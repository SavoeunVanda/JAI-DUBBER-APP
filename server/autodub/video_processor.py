import os
import re
import json
import time
import shutil
import tempfile
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import silent_process
from silent_process import get_silent_kwargs
from typing import List, Dict, Any, Optional, Callable
try:
    from pydub import AudioSegment
except ImportError:
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "pydub", "--no-warn-script-location"], check=False)
        from pydub import AudioSegment
    except Exception:
        AudioSegment = None
from config_manager import ConfigManager
from gemini_engine import GeminiEngine
from tts_engine import TTSEngine
from khmer_utils import clean_khmer_text, wrap_khmer_subtitle, split_khmer_into_single_lines

# Pre-import PyTorch, Demucs, and audio_pitch_detector on MainThread to prevent Windows OS Loader Lock deadlock
try:
    import torch
    import demucs_separate
    import audio_pitch_detector
except Exception:
    pass

VIDEO_EXTENSIONS = {
    ".mp4", ".mkv", ".mov", ".avi", ".webm", ".ts", ".m2ts", ".mts",
    ".flv", ".f4v", ".m4v", ".wmv", ".3gp", ".3g2", ".vob", ".ogv",
    ".rmvb", ".rm", ".asf", ".divx"
}

if getattr(sys, 'frozen', False):
    CURRENT_DIR = os.path.dirname(sys.executable)
else:
    CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

SERVER_DIR = os.path.dirname(CURRENT_DIR)
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

class VideoProcessor:
    def __init__(self):
        self.config_manager = ConfigManager()
        self.gemini_engine = GeminiEngine()
        self.tts_engine = TTSEngine()
        self.is_cancelled = False
        self.current_process: Optional[subprocess.Popen] = None
        self.bgm_executor: Optional[ThreadPoolExecutor] = None

    def cancel(self):
        """Cancel current processing."""
        self.is_cancelled = True
        if self.bgm_executor:
            try:
                self.bgm_executor.shutdown(wait=False, cancel_futures=True)
            except Exception:
                pass
        if self.current_process:
            try:
                self.current_process.terminate()
            except Exception:
                pass

    @staticmethod
    def natural_sort_key(s: str):
        return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]

    @classmethod
    def find_video_files(cls, folder_path: str) -> List[str]:
        """Finds and naturally sorts all video files in the specified directory."""
        if not folder_path or not os.path.isdir(folder_path):
            return []
        found = []
        try:
            for fname in os.listdir(folder_path):
                fpath = os.path.join(folder_path, fname)
                if os.path.isfile(fpath):
                    _, ext = os.path.splitext(fname)
                    if ext.lower() in VIDEO_EXTENSIONS:
                        if ext.lower() == ".ts":
                            try:
                                with open(fpath, "rb") as check_f:
                                    header = check_f.read(188)
                                    if not (len(header) > 0 and header[0] == 0x47):
                                        continue
                            except Exception:
                                continue
                        found.append(fpath)
            found.sort(key=cls.natural_sort_key)
        except Exception as e:
            print(f"[VideoProcessor] Error listing directory: {e}")
        return found

    @classmethod
    def get_dubbed_output_path(cls, video_path: str, export_folder: str) -> str:
        """Returns the standard expected output path for a dubbed video."""
        filename = os.path.basename(video_path)
        base_name, _ = os.path.splitext(filename)
        return os.path.join(export_folder, f"{base_name}_KH.mp4")

    @classmethod
    def is_video_already_dubbed(cls, video_path: str, export_folder: str) -> bool:
        """
        Checks if a video has already been successfully dubbed in the export folder.
        A video is considered dubbed if the output file exists and is non-empty (> 100KB).
        """
        if not export_folder or not os.path.isdir(export_folder):
            return False

        filename = os.path.basename(video_path)
        base_name, _ = os.path.splitext(filename)

        # Standard output candidate: {base_name}_KH.mp4
        std_target = os.path.join(export_folder, f"{base_name}_KH.mp4")
        if os.path.exists(std_target) and os.path.getsize(std_target) > 100 * 1024:
            return True

        # Check other video extensions (mkv, mov, avi, webm, etc.)
        for ext in VIDEO_EXTENSIONS:
            cand = os.path.join(export_folder, f"{base_name}_KH{ext}")
            if os.path.exists(cand) and os.path.getsize(cand) > 100 * 1024:
                return True

        return False

    def get_video_info(self, video_path: str) -> Dict[str, Any]:
        """Gets video duration, width, height, fps via ffprobe."""
        info = {"duration_ms": 0, "width": 1080, "height": 1920, "has_audio": False}
        try:
            cmd = [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration:stream=width,height,codec_type",
                "-of", "json",
                video_path
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
            if res.returncode == 0 and res.stdout:
                data = json.loads(res.stdout)
                if "format" in data and "duration" in data["format"]:
                    info["duration_ms"] = int(float(data["format"]["duration"]) * 1000)
                for stream in data.get("streams", []):
                    if stream.get("codec_type") == "video":
                        if "width" in stream and "height" in stream:
                            info["width"] = int(stream["width"])
                            info["height"] = int(stream["height"])
                    elif stream.get("codec_type") == "audio":
                        info["has_audio"] = True
        except Exception as e:
            print(f"[VideoProcessor] Error getting video info: {e}")
        return info

    @staticmethod
    def ms_to_srt_time(ms: int) -> str:
        hours = ms // 3600000
        ms %= 3600000
        minutes = ms // 60000
        ms %= 60000
        seconds = ms // 1000
        millis = ms % 1000
        return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"

    def export_srt(self, segments: List[Dict[str, Any]], srt_path: str):
        """Export Khmer subtitles to standard .srt file."""
        try:
            with open(srt_path, "w", encoding="utf-8") as f:
                for idx, seg in enumerate(segments, start=1):
                    start_str = self.ms_to_srt_time(seg["start_ms"])
                    end_str = self.ms_to_srt_time(seg["end_ms"])
                    khmer_text = seg.get("khmer_text", "").strip()
                    if khmer_text:
                        khmer_text = clean_khmer_text(khmer_text)
                        khmer_text = wrap_khmer_subtitle(khmer_text, max_chars=34, newline="\n")
                    f.write(f"{idx}\n{start_str} --> {end_str}\n{khmer_text}\n\n")
            print(f"[VideoProcessor] Exported SRT to {srt_path}")
        except Exception as e:
            print(f"[VideoProcessor] Error exporting SRT: {e}")

    @staticmethod
    def ms_to_ass_time(ms: int) -> str:
        safe_ms = max(0, ms)
        hours = safe_ms // 3600000
        safe_ms %= 3600000
        minutes = safe_ms // 60000
        safe_ms %= 60000
        seconds = safe_ms // 1000
        centis = (safe_ms % 1000) // 10
        return f"{hours}:{minutes:02d}:{seconds:02d}.{centis:02d}"

    def generate_ass(
        self,
        segments: List[Dict[str, Any]],
        ass_path: str,
        font_name: str = "Battambang",
        color_hex: str = "#facc15",
        y_pct: float = 70.0,
        width_pct: float = 84.0,
        font_size: int = 15,
        video_width: int = 720,
        video_height: int = 1280,
        style_type: str = "box",
        bg_color: str = "#000000",
        bg_opacity: float = 100.0,
        max_lines: int = 1
    ):
        """Generate ASS subtitle file with exact font, size, boldness, and rounded background box matching preview 1:1."""
        BOX_PRESETS = {
            "black_lightgray_box": {"textColor": "#000000", "bgColor": "#9ca3af"},
            "white_darkgray_box": {"textColor": "#ffffff", "bgColor": "#374151"},
            "black_yellow_box": {"textColor": "#000000", "bgColor": "#facc15"},
            "white_purple_box": {"textColor": "#ffffff", "bgColor": "#8b5cf6"},
            "purple_white_box": {"textColor": "#7c3aed", "bgColor": "#ffffff"},
            "black_white_box": {"textColor": "#000000", "bgColor": "#ffffff"},
            "white_black_box": {"textColor": "#ffffff", "bgColor": "#000000"},
            "green_black_box": {"textColor": "#22c55e", "bgColor": "#000000"},
        }

        c = color_hex.lstrip("#")
        if style_type in BOX_PRESETS:
            p_text = BOX_PRESETS[style_type]["textColor"].lstrip("#")
            p_bg = BOX_PRESETS[style_type]["bgColor"].lstrip("#")
            primary_color = f"&H00{p_text[4:6]}{p_text[2:4]}{p_text[0:2]}".upper()
            text_bgr = f"{p_text[4:6]}{p_text[2:4]}{p_text[0:2]}".upper()
            bg_c = p_bg
        elif len(c) == 6:
            r, g, b = c[0:2], c[2:4], c[4:6]
            primary_color = f"&H00{b}{g}{r}".upper()
            text_bgr = f"{b}{g}{r}".upper()
            bg_c = bg_color.lstrip("#") if bg_color else "000000"
        elif style_type == "yellow":
            primary_color = "&H0015CCFA"
            text_bgr = "15CCFA"
            bg_c = bg_color.lstrip("#") if bg_color else "000000"
        else:
            primary_color = "&H00FFFFFF"
            text_bgr = "FFFFFF"
            bg_c = bg_color.lstrip("#") if bg_color else "000000"

        play_res_x = video_width if video_width > 0 else 720
        play_res_y = video_height if video_height > 0 else 1280
        is_portrait = play_res_x < play_res_y

        raw_font_size = font_size if font_size > 0 else 15
        # Proportional ASS font sizing matching the UI Web Preview 1:1
        if is_portrait:
            base_ass_size = round(play_res_x * 0.072)
        else:
            base_ass_size = round(play_res_y * 0.055)
        eff_font_size = max(20, round(base_ass_size * (raw_font_size / 15.0)))
        line_height = round(eff_font_size * 1.55)

        clean_font = font_name.strip()
        if "Freehand" in clean_font:
            font_title = "Freehand"
        elif "Moul" in clean_font and "Moulpali" not in clean_font:
            font_title = "Moul"
        elif "Moulpali" in clean_font:
            font_title = "Moulpali"
        elif "Kantumruy" in clean_font:
            font_title = "Kantumruy Pro"
        elif "Nokora" in clean_font:
            font_title = "Nokora"
        elif "Hanuman" in clean_font:
            font_title = "Hanuman"
        elif "Content" in clean_font:
            font_title = "Content"
        elif "Siemreap" in clean_font:
            font_title = "Siemreap"
        elif "Bokor" in clean_font:
            font_title = "Bokor"
        elif "Bayon" in clean_font:
            font_title = "Bayon"
        elif "Dangrek" in clean_font:
            font_title = "Dangrek"
        elif "Koulen" in clean_font:
            font_title = "Koulen"
        elif "Fasthand" in clean_font:
            font_title = "Fasthand"
        elif "Preahvihear" in clean_font:
            font_title = "Preahvihear"
        elif "Chenla" in clean_font:
            font_title = "Chenla"
        elif clean_font:
            font_title = clean_font
        else:
            font_title = "Battambang"

        sub_pos_x = round(play_res_x / 2)
        sub_pos_y = round((y_pct / 100.0) * play_res_y)

        has_box = style_type == "box" or style_type in BOX_PRESETS or (bg_color and bg_color != "transparent" and bg_color != "")
        box_width = round((width_pct / 100.0) * play_res_x)
        corner_radius = max(8, round(eff_font_size * 0.22))

        if len(bg_c) == 6:
            br, bg, bb = bg_c[0:2], bg_c[2:4], bg_c[4:6]
            box_bgr = f"{bb}{bg}{br}".upper()
        else:
            box_bgr = "000000"

        alpha_val = max(0, min(255, round((1.0 - bg_opacity / 100.0) * 255)))
        box_alpha_hex = f"{alpha_val:02X}"

        # Boldness and thickness tags (ភាពឌិតនៃអក្សរ ដូចផ្ទាំង Preview)
        if has_box:
            text_tags = f"\\b1\\bord1.2\\3c&H{text_bgr}&\\shad1.5\\4a&H60&\\an5\\pos({sub_pos_x},{sub_pos_y})"
        elif style_type in ("white_black_stroke", "yellow_black_stroke", "green_black_stroke", "yellow"):
            text_tags = f"\\b1\\bord3.5\\3c&H000000&\\shad2\\an5\\pos({sub_pos_x},{sub_pos_y})"
        elif style_type in ("white_outline", "outline"):
            text_tags = f"\\b1\\bord2.5\\3c&H000000&\\shad0\\an5\\pos({sub_pos_x},{sub_pos_y})"
        elif style_type == "white_shadow":
            text_tags = f"\\b1\\bord1\\3c&H{text_bgr}&\\shad3.5\\4a&H00&\\an5\\pos({sub_pos_x},{sub_pos_y})"
        elif style_type == "white_glow":
            text_tags = f"\\b1\\bord2\\3c&H000000&\\shad3\\4a&H20&\\an5\\pos({sub_pos_x},{sub_pos_y})"
        elif style_type == "yellow_red_shadow":
            text_tags = f"\\b1\\bord1.5\\3c&H000000&\\shad3\\4c&H0000DC&\\an5\\pos({sub_pos_x},{sub_pos_y})"
        elif style_type == "pink_neon":
            text_tags = f"\\b1\\bord2\\3c&HEC4899&\\shad3\\an5\\pos({sub_pos_x},{sub_pos_y})"
        else:
            text_tags = f"\\b1\\bord1.2\\3c&H{text_bgr}&\\shad1.5\\an5\\pos({sub_pos_x},{sub_pos_y})"

        def _get_rounded_box_drawing(w: int, h: int, rad: int) -> str:
            r = max(0, min(rad, round(w / 2), round(h / 2)))
            k = round(r * 0.5523)
            return f"m {r} 0 l {w - r} 0 b {w - r + k} 0 {w} {r - k} {w} {r} l {w} {h - r} b {w} {h - r + k} {w - r + k} {h} {w - r} {h} l {r} {h} b {r - k} {h} 0 {h - r + k} 0 {h - r} l 0 {r} b 0 {r - k} {r - k} 0 {r} 0"

        margin_lr = max(20, round(play_res_x * 0.05))
        ass_header = f"""[Script Info]
Title: JAI AUTO DUBBING Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: {play_res_x}
PlayResY: {play_res_y}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: SubBoxStyle,Arial,20,&H00000000,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: KhmerSubMain,{font_title},{eff_font_size},{primary_color},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1,1,5,{margin_lr},{margin_lr},10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(ass_header)
            for seg in segments:
                raw_text = seg.get("khmer_text", "").strip()
                if not raw_text:
                    raw_text = seg.get("original_text", "").strip()
                if not raw_text:
                    continue
                text = clean_khmer_text(raw_text)
                if not text:
                    continue

                start_ms = seg.get("placed_start_ms", seg.get("start_ms", 0))
                dur_ms = seg.get("duration_ms", 1500)
                end_ms = seg.get("placed_end_ms", seg.get("end_ms", start_ms + dur_ms))

                if end_ms <= start_ms:
                    end_ms = start_ms + max(1200, dur_ms)
                elif end_ms - start_ms < 1000:
                    end_ms = start_ms + 1000

                approx_chars = max(18, min(34, round((box_width - eff_font_size * 0.8) / (eff_font_size * 0.52))))
                raw_lines = split_khmer_into_single_lines(text, max_chars=approx_chars)
                if not raw_lines:
                    continue

                # Group lines into chunks according to max_lines setting
                if max_lines == 0:
                    chunks = [raw_lines]
                elif max_lines == 2:
                    chunks = [raw_lines[i:i + 2] for i in range(0, len(raw_lines), 2)]
                else:
                    chunks = [[l] for l in raw_lines]

                total_chars = sum(sum(len(re.sub(r'\s+', '', line)) for line in chunk) for chunk in chunks) or 1
                total_dur = max(400, end_ms - start_ms)
                cur_start_ms = start_ms

                for c_idx, chunk in enumerate(chunks):
                    chunk_text = "\\N".join(chunk)
                    c_chars = sum(len(re.sub(r'\s+', '', line)) for line in chunk) or 1
                    if c_idx == len(chunks) - 1:
                        cur_end_ms = end_ms
                    else:
                        c_dur = round((c_chars / total_chars) * total_dur)
                        cur_end_ms = min(end_ms, cur_start_ms + max(350, c_dur))

                    if cur_end_ms <= cur_start_ms:
                        cur_end_ms = cur_start_ms + 400

                    start_t = self.ms_to_ass_time(cur_start_ms)
                    end_t = self.ms_to_ass_time(cur_end_ms)

                    # Dynamic box height based on number of lines in this chunk
                    box_height = round(len(chunk) * line_height + eff_font_size * 0.35)
                    box_drawing = _get_rounded_box_drawing(box_width, box_height, corner_radius)
                    box_left = sub_pos_x - round(box_width / 2)
                    box_top = sub_pos_y - round(box_height / 2)

                    if has_box:
                        f.write(f"Dialogue: 0,{start_t},{end_t},SubBoxStyle,,0,0,0,,{{\\an7\\pos({box_left},{box_top})\\p1\\bord1\\3c&HFFFFFF&\\3a&HD9&\\shad0\\1c&H{box_bgr}&\\1a&H{box_alpha_hex}&}}{box_drawing}{{\\p0}}\n")

                    f.write(f"Dialogue: 1,{start_t},{end_t},KhmerSubMain,,0,0,0,,{{{text_tags}}}{chunk_text}\n")
                    cur_start_ms = cur_end_ms

    def separate_bgm_with_demucs(self, input_audio_path: str, output_bgm_path: str) -> Optional[str]:
        """
        Isolates pure BGM and SFX from dialogue vocals using Demucs AI model.
        Returns the path to the isolated BGM track on success, or None on failure.
        """
        if self.is_cancelled or not input_audio_path or not os.path.exists(input_audio_path):
            return None
        try:
            from demucs_separate import separate_audio
            print(f"[VideoProcessor] Starting Demucs vocal separation on {input_audio_path}...")
            res = separate_audio(
                input_file=input_audio_path,
                output_bgm=output_bgm_path,
                output_vocals=None,
                device="auto",
                model_name="htdemucs"
            )
            if res and res.get("success") and os.path.exists(output_bgm_path):
                print(f"[VideoProcessor] Demucs separation completed in {res.get('timeTaken')}s on {res.get('device')}")
                return output_bgm_path
        except Exception as e:
            print(f"[VideoProcessor] In-process Demucs failed: {e}. Trying CLI fallback...")
            try:
                demucs_script = os.path.join(SERVER_DIR, "demucs_separate.py")
                if os.path.exists(demucs_script):
                    cmd = [
                        sys.executable,
                        demucs_script,
                        "--input", input_audio_path,
                        "--output-bgm", output_bgm_path,
                        "--device", "auto",
                        "--model", "htdemucs"
                    ]
                    kwargs = get_silent_kwargs()
                    subprocess.run(cmd, check=True, **kwargs)
                    if os.path.exists(output_bgm_path):
                        return output_bgm_path
            except Exception as err2:
                print(f"[VideoProcessor] Demucs CLI fallback error: {err2}")
        return None

    def assemble_dubbed_audio(
        self,
        synthesized_segments: List[Dict[str, Any]],
        video_duration_ms: int,
        temp_dir: str,
        original_audio_path: Optional[str] = None,
        isolated_bgm_path: Optional[str] = None
    ) -> str:
        """
        Creates the complete master audio track aligning each dubbed segment
        at its exact timestamp with auto-speed adjustments.
        Handles:
          - 'mute_vocal': Isolates vocals with Demucs AI, preserves 100% of BGM & SFX,
                          and overlays the Khmer dub.
          - 'mute_original': Mutes original audio 100% (pure Khmer dub).
          - 'duck_original': Lowers original audio (-16dB) under Khmer dub.
        Guarantees that NO audio segment is truncated or lost.
        """
        master_audio = AudioSegment.silent(duration=max(video_duration_ms, 1000))
        audio_mode = self.config_manager.get("audio_mode", "mute_original")
        duck_vol = float(self.config_manager.get("duck_volume", 0.15))

        # Apply global sync offset if configured
        sync_offset = int(self.config_manager.get("sync_offset_ms", 0))

        prev_end = 0
        for seg in synthesized_segments:
            seg_file = seg.get("audio_file")
            start_ms = max(0, seg.get("start_ms", 0) + sync_offset)

            # CRITICAL TIMING SYNCHRONIZATION:
            # Anchor start_ms directly to the original dialogue onset!
            # Do NOT delay start_ms into the future, otherwise dubbed dialogue drifts
            # away from the actor's lips and scene actions!
            if start_ms >= video_duration_ms:
                start_ms = max(0, video_duration_ms - seg.get("duration_ms", 1500) - 100)

            seg["placed_start_ms"] = start_ms

            if seg_file and os.path.exists(seg_file):
                try:
                    seg_audio = AudioSegment.from_file(seg_file)
                    seg_dur = len(seg_audio)
                    seg["duration_ms"] = seg_dur
                    seg["placed_end_ms"] = min(video_duration_ms, start_ms + seg_dur)

                    # Overlay onto master track
                    master_audio = master_audio.overlay(seg_audio, position=start_ms)
                    prev_end = start_ms + seg_dur
                except Exception as e:
                    print(f"[VideoProcessor] Error overlaying segment #{seg.get('seg_index')}: {e}")
                    seg["placed_end_ms"] = min(video_duration_ms, start_ms + seg.get("duration_ms", 1500))
                    prev_end = seg["placed_end_ms"]
            else:
                seg["placed_end_ms"] = min(video_duration_ms, start_ms + seg.get("duration_ms", 1500))
                prev_end = seg["placed_end_ms"]

        # CRITICAL ENFORCEMENT: Master audio track MUST MATCH video_duration_ms EXACTLY!
        # This guarantees exported video duration matches original video duration 100%
        # and NEVER freezes or stalls at the end!
        if len(master_audio) > video_duration_ms:
            master_audio = master_audio[:video_duration_ms]
        elif len(master_audio) < video_duration_ms:
            master_audio = master_audio + AudioSegment.silent(duration=video_duration_ms - len(master_audio))

        master_path = os.path.join(temp_dir, "dubbed_master.wav")

        # 1. Mute Vocal Only (Demucs AI Vocal Isolation):
        # Dialogue vocals deleted, background music (BGM) & sound effects (SFX) preserved 100%!
        if audio_mode in ("mute_vocal", "isolate_vocal") and isolated_bgm_path and os.path.exists(isolated_bgm_path):
            try:
                bgm_audio = AudioSegment.from_file(isolated_bgm_path)
                if len(bgm_audio) > video_duration_ms:
                    bgm_audio = bgm_audio[:video_duration_ms]
                elif len(bgm_audio) < video_duration_ms:
                    bgm_audio = bgm_audio + AudioSegment.silent(duration=video_duration_ms - len(bgm_audio))

                # Overlay Khmer master audio onto the isolated BGM track
                final_mixed = bgm_audio.overlay(master_audio)
                if len(final_mixed) > video_duration_ms:
                    final_mixed = final_mixed[:video_duration_ms]
                final_mixed.export(master_path, format="wav")
                print("[VideoProcessor] Successfully mixed Khmer dub with isolated Demucs BGM track.")
                return master_path
            except Exception as e:
                print(f"[VideoProcessor] Demucs isolated BGM mix error: {e}")

        # 2. Duck Original or Fallback for Mute Vocal if Demucs BGM was unavailable
        # (Lowers background original audio volume so video NEVER has complete silence / muted audio)
        if (audio_mode == "duck_original" or audio_mode in ("mute_vocal", "isolate_vocal")) and original_audio_path and os.path.exists(original_audio_path):
            try:
                orig_audio = AudioSegment.from_file(original_audio_path)
                if len(orig_audio) > video_duration_ms:
                    orig_audio = orig_audio[:video_duration_ms]
                elif len(orig_audio) < video_duration_ms:
                    orig_audio = orig_audio + AudioSegment.silent(duration=video_duration_ms - len(orig_audio))

                # Lower volume: -16dB
                ducked_orig = orig_audio - 16.0
                final_mixed = ducked_orig.overlay(master_audio)
                if len(final_mixed) > video_duration_ms:
                    final_mixed = final_mixed[:video_duration_ms]
                final_mixed.export(master_path, format="wav")
                return master_path
            except Exception as e:
                print(f"[VideoProcessor] Ducking mix error: {e}")

        # 3. Default / Mute Original: Pure Khmer dub (Original audio completely muted)
        master_audio.export(master_path, format="wav")
        return master_path

    def process_video_file(
        self,
        video_path: str,
        export_folder: str,
        status_callback: Optional[Callable[[str], None]] = None,
        progress_callback: Optional[Callable[[int], None]] = None
    ) -> bool:
        """Processes a single video: extract -> Gemini -> Edge-TTS -> Mux -> Export."""
        if self.is_cancelled:
            return False

        self.config_manager.load()
        filename = os.path.basename(video_path)
        base_name, ext = os.path.splitext(filename)
        output_filename = f"{base_name}_KH.mp4"
        output_video_path = os.path.join(export_folder, output_filename)

        # Ensure no residual .srt files exist in export folder (Export video only)
        for srt_candidate in [f"{base_name}_KH.srt", f"{base_name}.srt"]:
            possible_srt = os.path.join(export_folder, srt_candidate)
            if os.path.exists(possible_srt):
                try:
                    os.remove(possible_srt)
                except Exception:
                    pass

        temp_dir = tempfile.mkdtemp(prefix="dubbing_")

        current_pct = 0

        def report(msg: str, pct: Optional[int] = None):
            nonlocal current_pct
            if pct is not None:
                current_pct = max(current_pct, min(100, int(pct)))
            if status_callback:
                try:
                    import inspect
                    sig = inspect.signature(status_callback)
                    if len(sig.parameters) >= 2:
                        status_callback(msg, current_pct)
                    else:
                        status_callback(msg)
                except Exception:
                    try:
                        status_callback(msg)
                    except Exception:
                        pass
            if progress_callback and pct is not None:
                try:
                    progress_callback(current_pct)
                except Exception:
                    pass

        try:
            # 1. Inspect Video Info
            report("កំពុងបើកវីដេអូ & ត្រួតពិនិត្យព័ត៌មាន...", 2)
            video_info = self.get_video_info(video_path)
            duration_ms = video_info["duration_ms"]
            print(f"[VideoProcessor] Video duration: {duration_ms}ms ({duration_ms/1000:.1f}s)")

            if self.is_cancelled:
                return False

            # 2. Extract Audio
            report("កំពុងស្រង់សម្លេងចេញពីវីដេអូ...", 5)
            extracted_audio = os.path.join(temp_dir, "extracted.mp3")
            if not self.gemini_engine.extract_audio_from_video(video_path, extracted_audio):
                raise RuntimeError("Failed to extract audio from video.")

            if self.is_cancelled:
                return False

            # Check audio mode: If Mute Vocal Only, start Demucs AI vocal separation concurrently!
            # Runs on GPU in parallel with Gemini API & Edge TTS synthesis, saving 100% idle time.
            audio_mode = self.config_manager.get("audio_mode", "mute_original")
            bgm_future = None
            isolated_bgm_path = os.path.join(temp_dir, "isolated_bgm.wav")

            if audio_mode in ("mute_vocal", "isolate_vocal"):
                report("Demucs AI កំពុងរៀបចំបំបែកសំឡេងច្រៀង...", 8)
                self.bgm_executor = ThreadPoolExecutor(max_workers=1)
                def _demucs_task():
                    if self.is_cancelled:
                        return None
                    return self.separate_bgm_with_demucs(extracted_audio, isolated_bgm_path)
                bgm_future = self.bgm_executor.submit(_demucs_task)

            # 3. Gemini Transcription, Meaning Analysis & Khmer Translation
            report("Gemini កំពុងវិភាគន័យ & បកប្រែជាភាសាខ្មែរ...", 10)

            def _gemini_cb(msg: str):
                c_pct = None
                m = re.search(r"\[(\d+)/(\d+)\]", msg)
                if m:
                    try:
                        c_idx = int(m.group(1))
                        c_tot = int(m.group(2))
                        if c_tot > 0:
                            c_pct = int(10 + (c_idx / c_tot) * 40)
                    except Exception:
                        pass
                report(msg, c_pct)

            segments = self.gemini_engine.transcribe_and_translate_khmer(
                extracted_audio,
                total_duration_ms=duration_ms,
                progress_callback=_gemini_cb
            )

            if not segments:
                raise RuntimeError("No dialogue segments were identified by Gemini.")

            if self.is_cancelled:
                return False

            # 3.5. Deep Acoustic Pitch Detection (F0 vocal cords frequency)
            voice_pref = self.config_manager.get("voice", "auto")
            if voice_pref == "auto" and os.path.exists(extracted_audio):
                try:
                    report("🎵 កំពុងស្ដាប់រលកសំឡេងដើម (Acoustic Pitch Detection F0) ដើម្បីកំណត់សម្លេងប្រុស/ស្រី...", 51)
                    import audio_pitch_detector
                    pitch_results = audio_pitch_detector.analyze_audio_segments(extracted_audio, segments)
                    if pitch_results:
                        for idx, p_res in enumerate(pitch_results):
                            if idx < len(segments):
                                segments[idx]["gender"] = p_res.get("gender")
                                segments[idx]["voiceProfile"] = p_res.get("voiceProfile")
                                segments[idx]["pitchHz"] = p_res.get("pitchHz")
                except Exception as pitch_err:
                    sys.stderr.write(f"[VideoProcessor] Acoustic pitch detection note: {pitch_err}\n")
                    sys.stderr.flush()

            # 4. Edge TTS Speech Synthesis (Concurrent 5 at a time for maximum speed)
            total_segs = len(segments)
            synthesized_dict = {}
            completed_count = 0

            def _synth_worker(task_tuple):
                idx, segment_item, nxt_start = task_tuple
                if self.is_cancelled:
                    return idx, None
                synth = self.tts_engine.synthesize_segment_sync(
                    segment_item, idx, temp_dir, auto_speed=True, next_seg_start_ms=nxt_start, max_video_duration_ms=duration_ms
                )
                if not synth:
                    # Guarantee no subtitle or segment is ever dropped
                    synth = {
                        "seg_index": idx,
                        "start_ms": segment_item.get("start_ms", 0),
                        "end_ms": segment_item.get("end_ms", segment_item.get("start_ms", 0) + 2000),
                        "audio_file": None,
                        "duration_ms": max(1500, segment_item.get("end_ms", 2000) - segment_item.get("start_ms", 0)),
                        "khmer_text": segment_item.get("khmer_text", ""),
                        "original_text": segment_item.get("original_text", ""),
                        "speaker": segment_item.get("speaker", "Male"),
                        "voice": "auto",
                        "speed_ratio": 1.0
                    }
                return idx, synth

            report(f"Edge TTS កំពុងចាប់ផ្តើមបង្កើតសំឡេងខ្មែរ (ដំណាលគ្នា ៥ ឃ្លា) [0/{total_segs}]...", 52)

            tasks = []
            for i, seg in enumerate(segments):
                next_start = segments[i + 1].get("start_ms") if i + 1 < total_segs else duration_ms
                tasks.append((i, seg, next_start))

            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = {executor.submit(_synth_worker, t): t[0] for t in tasks}
                for f in as_completed(futures):
                    if self.is_cancelled:
                        executor.shutdown(wait=False, cancel_futures=True)
                        return False
                    idx, res = f.result()
                    synthesized_dict[idx] = res
                    completed_count += 1
                    tts_pct = int(52 + (completed_count / max(1, total_segs)) * 32)
                    report(f"Edge TTS កំពុងបង្កើតសំឡេងខ្មែរ [{completed_count}/{total_segs}] (ដំណាលគ្នា ៥ ឃ្លា)...", tts_pct)

            if self.is_cancelled:
                return False

            # Strictly maintain chronological order 0 .. total_segs - 1
            synthesized_segments = [synthesized_dict[i] for i in range(total_segs) if i in synthesized_dict]

            if self.is_cancelled:
                return False

            # 5. Assemble Dubbed Audio Master Track
            if bgm_future is not None:
                report("Demucs AI កំពុងបញ្ចប់ការបំបែកសំឡេង BGM & SFX...", 85)
                try:
                    bgm_future.result(timeout=3600)
                except Exception as e:
                    print(f"[VideoProcessor] Demucs background task error: {e}")
                if self.bgm_executor:
                    self.bgm_executor.shutdown(wait=False)
                    self.bgm_executor = None

            if self.is_cancelled:
                return False

            report("កំពុងតម្រៀបសំឡេងខ្មែរតាម Timestamp...", 86)
            dubbed_master_wav = self.assemble_dubbed_audio(
                synthesized_segments,
                duration_ms,
                temp_dir,
                original_audio_path=extracted_audio,
                isolated_bgm_path=isolated_bgm_path if os.path.exists(isolated_bgm_path) else None
            )

            if self.is_cancelled:
                return False

            # 6. Final Video Mux & Subtitle Burning (Hanuman Font)
            report(f"កំពុង Export វីដេអូជាមួយសំឡេងខ្មែរ & Subtitle {self.config_manager.get('subtitle_font', 'Battambang')}...", 87)

            # Subtitle Position & Mask settings
            mask_y_pct = float(self.config_manager.get("subtitle_y_pct", 70.0))
            mask_width_pct = float(self.config_manager.get("subtitle_width_pct", 84.0))
            subtitle_burn = bool(self.config_manager.get("subtitle_burn", True))

            vf_filters = []
            if subtitle_burn and synthesized_segments:
                ass_path = os.path.join(temp_dir, "khmer_subtitles.ass")
                sub_font = self.config_manager.get("subtitle_font", "Battambang")
                sub_color = self.config_manager.get("subtitle_color", "#ffffff")
                sub_font_size = int(self.config_manager.get("subtitle_font_size", 15))
                sub_style_type = str(self.config_manager.get("subtitle_style_type", "box"))
                sub_bg_color = str(self.config_manager.get("subtitle_bg_color", "#000000"))
                sub_bg_opacity = float(self.config_manager.get("subtitle_bg_opacity", 100.0))

                self.generate_ass(
                    synthesized_segments,
                    ass_path,
                    font_name=sub_font,
                    color_hex=sub_color,
                    y_pct=mask_y_pct,
                    width_pct=mask_width_pct,
                    font_size=sub_font_size,
                    video_width=video_info.get("width", 720),
                    video_height=video_info.get("height", 1280),
                    style_type=sub_style_type,
                    bg_color=sub_bg_color,
                    bg_opacity=sub_bg_opacity,
                    max_lines=int(self.config_manager.get("subtitle_max_lines", 1))
                )

                font_candidates = [
                    os.path.join(os.path.expanduser("~"), ".local", "share", "fonts", "khmer"),
                    os.path.join(os.getcwd(), "public", "fonts"),
                    os.path.join(os.getcwd(), "assets", "fonts"),
                    os.path.join(CURRENT_DIR, "assets", "fonts"),
                    os.path.join(os.path.dirname(CURRENT_DIR), "assets", "fonts"),
                    os.path.join(os.path.dirname(os.path.dirname(CURRENT_DIR)), "assets", "fonts"),
                ]
                if hasattr(sys, '_MEIPASS'):
                    font_candidates.append(os.path.join(sys._MEIPASS, "assets", "fonts"))

                font_dir = ""
                for cand in font_candidates:
                    if os.path.exists(cand) and os.path.isdir(cand):
                        font_dir = cand
                        break
                if not font_dir:
                    font_dir = font_candidates[0]

                font_dir = font_dir.replace("\\", "/")
                safe_ass = ass_path.replace("\\", "/").replace(":", r"\:")
                safe_font_dir = font_dir.replace(":", r"\:")
                sub_filter = f"ass='{safe_ass}':fontsdir='{safe_font_dir}':shaping=complex:alpha=1"
                vf_filters.append(sub_filter)

            mux_cmd = [
                "ffmpeg", "-nostdin", "-y",
                "-i", video_path,
                "-i", dubbed_master_wav
            ]

            if vf_filters:
                mux_cmd.extend(["-vf", ",".join(vf_filters)])

            mux_cmd.extend([
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "17",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "320k",
                "-ar", "48000",
                "-shortest",
                output_video_path
            ])

            os.makedirs(export_folder, exist_ok=True)
            print(f"[VideoProcessor] Running Mux: {' '.join(mux_cmd)}")
            self.current_process = subprocess.Popen(
                mux_cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                **get_silent_kwargs()
            )

            stderr_lines = []
            if self.current_process.stderr:
                for line in self.current_process.stderr:
                    stderr_lines.append(line)
                    if "time=" in line and duration_ms > 0:
                        try:
                            t_match = re.search(r"time=(\d+):(\d+):(\d+\.\d+)", line)
                            if t_match:
                                h, m, s = t_match.groups()
                                cur_ms = int(h) * 3600000 + int(m) * 60000 + int(float(s) * 1000)
                                mux_ratio = min(1.0, max(0.0, cur_ms / duration_ms))
                                mux_pct = int(87 + (mux_ratio * 12))
                                report(f"កំពុង Encode វីដេអូ... {int(mux_ratio * 100)}%", mux_pct)
                        except Exception:
                            pass

            self.current_process.wait()

            if self.current_process.returncode != 0:
                err_msg = "".join(stderr_lines[-20:]) if stderr_lines else f"exit code {self.current_process.returncode}"
                print(f"[VideoProcessor] FFmpeg error: {err_msg[:1000]}")
                raise RuntimeError(f"FFmpeg muxing failed: {err_msg[:500]}")

            if not os.path.exists(output_video_path) or os.path.getsize(output_video_path) == 0:
                raise RuntimeError(f"Exported video file was not created or is empty: {output_video_path}")

            # Ensure export folder contains only video (remove any leftover .srt)
            for srt_candidate in [f"{base_name}_KH.srt", f"{base_name}.srt"]:
                possible_srt = os.path.join(export_folder, srt_candidate)
                if os.path.exists(possible_srt):
                    try:
                        os.remove(possible_srt)
                    except Exception:
                        pass

            report(f"បានសម្រេច! វីដេអូបានរក្សាទុក: {output_filename}", 100)

            return True

        except Exception as e:
            print(f"[VideoProcessor] Video process failed: {e}")
            if status_callback:
                status_callback(f"កំហុស: {str(e)[:80]}")
            return False
        finally:
            self.current_process = None
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass
