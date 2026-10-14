import os
import sys
import asyncio
import subprocess
import silent_process
from silent_process import get_silent_kwargs
import shutil
from typing import Dict, Any, Optional
import edge_tts
from config_manager import ConfigManager
from pydub import AudioSegment
from pydub.silence import detect_leading_silence
from khmer_utils import clean_khmer_text

VOICE_MALE = "km-KH-PisethNeural"
VOICE_FEMALE = "km-KH-SreymomNeural"

class TTSEngine:
    def __init__(self):
        self.config_manager = ConfigManager()

    def get_audio_duration_ms(self, file_path: str) -> int:
        """Accurately gets duration in milliseconds using ffprobe."""
        try:
            cmd = [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path
            ]
            res = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                **get_silent_kwargs()
            )
            if res.returncode == 0 and res.stdout.strip():
                sec = float(res.stdout.strip())
                return int(sec * 1000)
        except Exception as e:
            print(f"[TTSEngine] Error getting duration: {e}")
        return 0

    def adjust_speed_tempo(self, input_path: str, output_path: str, tempo: float) -> bool:
        """
        Adjusts playback tempo (speed) using ffmpeg atempo filter while strictly
        preserving audio pitch (so voice sounds natural and not high-pitched).
        FFmpeg atempo supports 0.5 to 2.0 per filter instance.
        """
        try:
            # Build atempo filter chain if outside [0.5, 2.0]
            filters = []
            cur_tempo = tempo
            while cur_tempo > 2.0:
                filters.append("atempo=2.0")
                cur_tempo /= 2.0
            while cur_tempo < 0.5:
                filters.append("atempo=0.5")
                cur_tempo /= 0.5
            filters.append(f"atempo={cur_tempo:.4f}")
            filter_str = ",".join(filters)

            cmd = [
                "ffmpeg", "-nostdin", "-y",
                "-i", input_path,
                "-filter:a", filter_str,
                "-vn",
                output_path
            ]
            res = subprocess.run(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                **get_silent_kwargs()
            )
            return res.returncode == 0 and os.path.exists(output_path)
        except Exception as e:
            print(f"[TTSEngine] Speed adjustment error: {e}")
            return False

    async def _generate_raw_speech(
        self,
        text: str,
        voice: str,
        output_path: str,
        rate_str: str = "+0%",
        pitch_str: str = "+0Hz",
        timeout_sec: float = 20.0
    ) -> bool:
        """Synthesize text to speech using Edge TTS with strict timeout protection."""
        try:
            comm = edge_tts.Communicate(text=text, voice=voice, rate=rate_str, pitch=pitch_str)
            await asyncio.wait_for(comm.save(output_path), timeout=timeout_sec)
            return os.path.exists(output_path) and os.path.getsize(output_path) > 0
        except asyncio.TimeoutError:
            sys.stderr.write(f"[TTSEngine] Edge TTS timed out after {timeout_sec}s on voice {voice}\n")
            sys.stderr.flush()
            return False
        except Exception as e:
            err_str = str(e)
            if "403" in err_str or "WSServerHandshakeError" in err_str or "Invalid response status" in err_str:
                sys.stderr.write("[TTSEngine] Microsoft 403 detected on Edge TTS. Auto-upgrading edge-tts>=7.3.1...\n")
                sys.stderr.flush()
                try:
                    subprocess.run(
                        [sys.executable, "-m", "pip", "install", "--upgrade", "edge-tts>=7.3.1", "--no-warn-script-location"],
                        check=False,
                        stdin=subprocess.DEVNULL,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=60
                    )
                except Exception:
                    pass
            sys.stderr.write(f"[TTSEngine] Edge TTS generation error: {e}\n")
            sys.stderr.flush()
            return False

    def synthesize_segment_sync(
        self,
        segment: Dict[str, Any],
        seg_index: int,
        temp_dir: str,
        auto_speed: bool = True,
        next_seg_start_ms: Optional[int] = None,
        max_video_duration_ms: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Synthesizes a single dialogue segment in Khmer, measures its duration,
        and ensures speech speed is NEVER below 1.0x while fitting cleanly
        within the allotted video window.
        """
        raw_text = segment.get("khmer_text", "").strip()
        if not raw_text:
            raw_text = segment.get("original_text", "").strip()
        if not raw_text:
            return None

        khmer_text = clean_khmer_text(raw_text)
        if not khmer_text:
            khmer_text = raw_text

        # Determine voice
        voice_pref = self.config_manager.get("voice", "auto")
        if voice_pref == "km-KH-PisethNeural":
            chosen_voice = VOICE_MALE
        elif voice_pref == "km-KH-SreymomNeural":
            chosen_voice = VOICE_FEMALE
        else:
            # Check explicit voiceProfile or gender assigned from acoustic pitch detection
            explicit_voice = segment.get("voiceProfile") or segment.get("voice_profile")
            explicit_gender = str(segment.get("gender", "")).lower()

            if explicit_voice in [VOICE_FEMALE, "sreymom", "female"]:
                chosen_voice = VOICE_FEMALE
            elif explicit_voice in [VOICE_MALE, "piseth", "male"]:
                chosen_voice = VOICE_MALE
            elif explicit_gender == "female":
                chosen_voice = VOICE_FEMALE
            elif explicit_gender == "male":
                chosen_voice = VOICE_MALE
            else:
                # Auto based on detected speaker gender (Female -> Sreymom, Male -> Piseth)
                speaker = str(segment.get("speaker", "Male")).lower()
                char_name = str(segment.get("character_name", "")).lower()
                orig = str(segment.get("original_text", "")).lower()

                # Khmer female linguistic indicators
                female_khmer_markers = ["ចា៎", "ចាស", "នាងខ្ញុំ", "ខ្ញុំម្ចាស់", "កូនស្រី", "អ្នកនាង", "កញ្ញា", "ព្រះនាង", "ម្ចាស់ក្សត្រី", "មាតា", "ម៉ាក់", "ម៉ែ", "យាយ", "មីង", "បងស្រី", "អូនស្រី", "ភរិយា", "ប្រពន្ធ", "តួស្រី"]
                is_female_text = any(m in khmer_text for m in female_khmer_markers)
                is_female_orig = any(m in orig for m in ["姑娘", "小姐", "姐姐", "妹妹", "妈妈", "夫人", "王妃", "皇后", "娘娘", "公主", "丫鬟", "女", "她", "臣妾", "奴婢"])
                is_female_speaker = (
                    "female" in speaker or "woman" in speaker or "girl" in speaker or "ស្រី" in speaker or "sreymom" in speaker or
                    "ស្រី" in char_name or "female" in char_name or "កញ្ញា" in char_name or "អ្នកនាង" in char_name or "女" in char_name
                )

                male_khmer_markers = ["បាទ", "ខ្ញុំបាទ", "កូនប្រុស", "លោកម្ចាស់", "ឯកឧត្តម", "ស្ដេច", "ព្រះរាជា", "បិតា", "លោកពុក", "ពុក", "លោកតា", "ពូ", "ចៅហ្វាយ", "ស្វាមី", "ប្តី", "កម្លោះ", "តួប្រុស"]
                is_male_text = any(m in khmer_text for m in male_khmer_markers)

                if (is_female_text or is_female_orig or is_female_speaker) and not is_male_text:
                    chosen_voice = VOICE_FEMALE
                else:
                    chosen_voice = VOICE_MALE

        sys.stderr.write(f"[TTSEngine] Seg #{seg_index} speaker='{segment.get('speaker', 'Male')}' -> Voice: {chosen_voice}\n")
        sys.stderr.flush()

        rate_val = self.config_manager.get("voice_rate", 0)
        pitch_val = self.config_manager.get("voice_pitch", 0)
        rate_str = f"{rate_val:+d}%"
        pitch_str = f"{pitch_val:+d}Hz"

        raw_output = os.path.join(temp_dir, f"seg_{seg_index}_raw.mp3")
        final_output = os.path.join(temp_dir, f"seg_{seg_index}_final.mp3")

        # Multi-attempt generation with retry & alternative voice fallback
        success = False
        for attempt in range(3):
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                success = loop.run_until_complete(
                    self._generate_raw_speech(khmer_text, chosen_voice, raw_output, rate_str, pitch_str)
                )
                loop.close()
                if success and os.path.exists(raw_output) and os.path.getsize(raw_output) > 100:
                    break
            except Exception as e:
                sys.stderr.write(f"[TTSEngine] TTS attempt {attempt + 1} error: {e}\n")
                sys.stderr.flush()
                time.sleep(0.3)

        # Fallback to alternative voice if primary voice failed
        if not success or not os.path.exists(raw_output) or os.path.getsize(raw_output) < 100:
            alt_voice = VOICE_FEMALE if chosen_voice == VOICE_MALE else VOICE_MALE
            sys.stderr.write(f"[TTSEngine] Retrying seg #{seg_index} with fallback voice {alt_voice}...\n")
            sys.stderr.flush()
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                success = loop.run_until_complete(
                    self._generate_raw_speech(khmer_text, alt_voice, raw_output, rate_str, pitch_str)
                )
                loop.close()
                if success and os.path.exists(raw_output) and os.path.getsize(raw_output) > 100:
                    chosen_voice = alt_voice
            except Exception as e:
                sys.stderr.write(f"[TTSEngine] Fallback voice error: {e}\n")
                sys.stderr.flush()

        # If TTS completely failed, create a silent audio placeholder
        # so that SUBTITLE IS NEVER DROPPED OR LOST in the video!
        if not os.path.exists(raw_output) or os.path.getsize(raw_output) < 100:
            print(f"[TTSEngine] Warning: Generating silent placeholder for seg #{seg_index} to preserve subtitle.")
            fallback_duration = max(1500, segment.get("end_ms", 2000) - segment.get("start_ms", 0))
            silence_audio = AudioSegment.silent(duration=fallback_duration)
            silence_audio.export(raw_output, format="mp3")

        # Trim leading and trailing silence from the raw TTS output
        try:
            raw_audio = AudioSegment.from_file(raw_output)
            start_trim = detect_leading_silence(raw_audio)
            end_trim = detect_leading_silence(raw_audio.reverse())
            if start_trim + end_trim < len(raw_audio) - 200:
                trimmed_audio = raw_audio[start_trim:len(raw_audio) - end_trim]
            else:
                trimmed_audio = raw_audio
            trimmed_path = os.path.join(temp_dir, f"seg_{seg_index}_trimmed.mp3")
            trimmed_audio.export(trimmed_path, format="mp3")
        except Exception as e:
            print(f"[TTSEngine] Silence trimming error: {e}")
            trimmed_path = raw_output

        # Use trimmed (or original) file for duration measurement
        actual_duration_ms = self.get_audio_duration_ms(trimmed_path)
        if actual_duration_ms <= 0:
            actual_duration_ms = max(1000, segment.get("end_ms", 2000) - segment.get("start_ms", 0))

        start_ms = segment.get("start_ms", 0)
        end_ms = segment.get("end_ms", start_ms + actual_duration_ms)
        ideal_duration_ms = max(500, end_ms - start_ms)

        # Available time slot before next speaker or video end
        available_ms = ideal_duration_ms
        if next_seg_start_ms is not None and next_seg_start_ms > start_ms:
            gap_limit = next_seg_start_ms - start_ms - 50
            if gap_limit >= 500:
                available_ms = min(ideal_duration_ms, gap_limit)
            else:
                available_ms = ideal_duration_ms
        elif max_video_duration_ms is not None and max_video_duration_ms > start_ms:
            gap_limit = max_video_duration_ms - start_ms - 80
            if gap_limit > 500:
                available_ms = min(ideal_duration_ms, gap_limit)
            else:
                available_ms = max(500, gap_limit)

        # SPEED RULE: Speed must NEVER be below 1.0x (speed មិនក្រោម 1x ឡើយ)!
        # Speech is never slowed down. It plays at 1.0x natural rate or speeds up if needed.
        speed_ratio = 1.0

        if auto_speed and actual_duration_ms > 0:
            if actual_duration_ms > available_ms:
                # Needs speedup to comfortably fit before next dialogue starts or video ends
                calc_ratio = actual_duration_ms / available_ms
                # Speed must NEVER be below 1.0x!
                # Allow speedup up to 1.50x so it fits neatly without distortion
                speed_ratio = max(1.0, min(calc_ratio, 1.50))
            elif actual_duration_ms > ideal_duration_ms:
                # Slight speedup so it stays close to original dialogue pacing
                calc_ratio = actual_duration_ms / ideal_duration_ms
                speed_ratio = max(1.0, min(calc_ratio, 1.20))
            else:
                # Duration <= ideal duration: KEEP STRICTLY AT 1.0x!
                # Never slow down below 1.0x!
                speed_ratio = 1.0
        else:
            speed_ratio = 1.0

        if speed_ratio > 1.04:
            print(f"[TTSEngine] Seg #{seg_index}: Speeding up by {speed_ratio:.2f}x ({actual_duration_ms}ms -> {int(actual_duration_ms/speed_ratio)}ms)")
            if self.adjust_speed_tempo(trimmed_path, final_output, speed_ratio):
                resulting_audio = final_output
            else:
                shutil.copyfile(trimmed_path, final_output)
                resulting_audio = final_output
        else:
            shutil.copyfile(trimmed_path, final_output)
            resulting_audio = final_output
            speed_ratio = 1.0

        final_duration_ms = self.get_audio_duration_ms(resulting_audio)
        if final_duration_ms <= 0:
            final_duration_ms = actual_duration_ms

        # Subtitle end_ms must cover the full duration of the spoken audio so it never disappears prematurely
        calculated_end_ms = start_ms + final_duration_ms

        return {
            "seg_index": seg_index,
            "start_ms": start_ms,
            "end_ms": max(end_ms, calculated_end_ms),
            "target_end_ms": end_ms,
            "audio_file": resulting_audio,
            "duration_ms": final_duration_ms,
            "khmer_text": khmer_text,
            "original_text": segment.get("original_text", ""),
            "speaker": segment.get("speaker", "Male"),
            "voice": chosen_voice,
            "speed_ratio": speed_ratio
        }
