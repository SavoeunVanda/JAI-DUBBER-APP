"""
Audio Pitch & Voice Gender Detection Bridge for JAI DUBBER
Listens directly to the acoustic waveform of spoken audio slices (pitch / fundamental frequency F0),
determining whether each dialogue line is spoken by a Male (ប្រុស) or Female (ស្រី) speaker
without relying solely on text keywords.
"""

import sys
import os
import json
import argparse
import time
import subprocess
import tempfile
import numpy as np
import soundfile as sf

def get_bundled_ffmpeg():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(current_dir, '..', '..', '..', 'resources', 'bin', 'ffmpeg.exe'),
        os.path.join(current_dir, '..', '..', 'resources', 'bin', 'ffmpeg.exe'),
        os.path.join(current_dir, '..', 'resources', 'bin', 'ffmpeg.exe'),
        os.path.join(current_dir, '..', '..', 'bin', 'ffmpeg.exe'),
        os.path.join(current_dir, '..', 'bin', 'ffmpeg.exe'),
        os.path.join(current_dir, 'bin', 'ffmpeg.exe'),
        r'C:\Users\voeun\OneDrive\Documents\JAI DUBBER\JAI DUBBER 1.0.4\bin\ffmpeg.exe',
        'ffmpeg'
    ]
    for c in candidates:
        if os.path.exists(c):
            return os.path.abspath(c)
    return 'ffmpeg'

def extract_audio_16k(input_path: str, temp_wav_path: str):
    ffmpeg_bin = get_bundled_ffmpeg()
    cmd = [
        ffmpeg_bin,
        '-nostdin',
        '-y',
        '-i', input_path,
        '-vn',
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        temp_wav_path
    ]
    try:
        subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
            timeout=45
        )
    except Exception as ex:
        sys.stderr.write(f"[PitchDetector] FFmpeg extraction notice: {ex}\n")
        raise

def bandpass_filter_np(audio_slice: np.ndarray, sr: int = 16000, low_cut: float = 70.0, high_cut: float = 420.0):
    """
    Pure NumPy FFT bandpass filter (70 Hz - 420 Hz).
    Bypasses scipy to avoid Windows OS Loader Lock deadlocks with PyTorch / OpenBLAS.
    """
    n = len(audio_slice)
    freqs = np.fft.rfftfreq(n, d=1.0 / sr)
    f = np.fft.rfft(audio_slice)
    mask = (freqs >= low_cut) & (freqs <= high_cut)
    f[~mask] = 0.0
    return np.fft.irfft(f, n=n).astype(np.float32)

def detect_slice_f0(audio_slice: np.ndarray, sr: int = 16000, fmin: float = 75.0, fmax: float = 380.0):
    """
    Detects the median fundamental frequency (F0 in Hz) of voiced speech in an audio slice
    using pure NumPy bandpass pre-filtering + normalized autocorrelation with parabolic interpolation.
    """
    if len(audio_slice) < int(sr * 0.08):  # less than 80ms
        return 0.0, 0

    # 1. Isolate vocal fundamentals (70 Hz to 420 Hz) with pure NumPy (zero scipy dependency)
    filtered = bandpass_filter_np(audio_slice, sr, 70.0, 420.0)

    frame_len = int(sr * 0.04)   # 40ms frames
    hop_len = int(sr * 0.02)     # 20ms step (50% overlap)
    min_lag = int(sr / fmax)
    max_lag = int(sr / fmin)

    window = np.hanning(frame_len)
    voiced_pitches = []

    for i in range(0, len(filtered) - frame_len, hop_len):
        frame = filtered[i : i + frame_len]
        energy = np.mean(frame ** 2)
        if energy < 1e-4:
            continue

        frame = (frame - np.mean(frame)) * window
        n = len(frame)
        f = np.fft.rfft(frame, n=2 * n)
        acf = np.fft.irfft(f * np.conj(f))[:n]
        if acf[0] <= 0:
            continue
        acf_norm = acf / acf[0]

        if max_lag >= len(acf_norm):
            cur_max_lag = len(acf_norm) - 1
        else:
            cur_max_lag = max_lag

        if cur_max_lag <= min_lag:
            continue

        peak_idx = min_lag + np.argmax(acf_norm[min_lag:cur_max_lag])
        peak_val = acf_norm[peak_idx]

        # Voiced frame threshold
        if peak_val > 0.35:
            # Sub-sample parabolic interpolation
            if 0 < peak_idx < len(acf_norm) - 1:
                alpha = acf_norm[peak_idx - 1]
                beta = acf_norm[peak_idx]
                gamma = acf_norm[peak_idx + 1]
                denom = 2 * (2 * beta - alpha - gamma)
                if abs(denom) > 1e-6:
                    true_lag = peak_idx + (alpha - gamma) / denom
                else:
                    true_lag = peak_idx
            else:
                true_lag = peak_idx

            if true_lag > 0:
                pitch = sr / true_lag
                if fmin <= pitch <= fmax:
                    voiced_pitches.append(pitch)

    if not voiced_pitches:
        return 0.0, 0

    return float(np.median(voiced_pitches)), len(voiced_pitches)

def classify_segment_gender(pitch_hz: float, voiced_count: int, text: str = "", meaning: str = ""):
    """
    Classifies gender based on physical vocal pitch (F0) combined with secondary linguistic cues:
    - Pitch >= 162 Hz: Female (Sreymom)
    - 0 < Pitch < 155 Hz: Male (Piseth)
    - Ambiguous (155-162 Hz) or unvoiced: falls back to linguistic cues or default
    """
    text_lower = (text or "").lower()
    meaning_lower = (meaning or "").lower()

    # Female linguistic indicators
    has_female_text = any(w in text_lower for w in ["ចា៎", "ចាស", "នាងខ្ញុំ", "ខ្ញុំម្ចាស់", "កូនស្រី", "អ្នកនាង", "កញ្ញា", "ព្រះនាង", "ម្ចាស់ក្សត្រី", "មាតា", "ម៉ែ", "ម៉ាក់", "យាយ", "មីង", "បងស្រី", "អូនស្រី", "ភរិយា", "ប្រពន្ធ", "តួស្រី"])
    has_female_meaning = any(w in meaning_lower for w in ["ស្រី", "female", "woman", "girl", "queen", "princess", "sreymom", "女", "姑娘", "小姐", "妃", "后", "姐", "妹", "妈", "娘", "妾", "婢", "昭"])

    # Male linguistic indicators
    has_male_text = any(w in text_lower for w in ["បាទ", "ខ្ញុំបាទ", "កូនប្រុស", "លោកម្ចាស់", "ឯកឧត្តម", "ស្ដេច", "ព្រះរាជា", "បិតា", "លោកពុក", "ពុក", "លោកតា", "ពូ", "ចៅហ្វាយ", "ស្វាមី", "ប្តី", "កម្លោះ", "តួប្រុស"])
    has_male_meaning = any(w in meaning_lower for w in ["ប្រុស", "male", "man", "boy", "king", "prince", "piseth", "男", "公子", "少爷", "王", "皇", "爷", "兄", "弟", "爹", "哥", "将"])

    # 1. Pitch with high confidence (voiced_count >= 3)
    if voiced_count >= 3 and pitch_hz > 0:
        if pitch_hz >= 165.0:
            return "female", 0.95
        if pitch_hz <= 152.0:
            return "male", 0.95
        # Borderline (153 - 164 Hz)
        if has_female_text or has_female_meaning:
            return "female", 0.85
        if has_male_text or has_male_meaning:
            return "male", 0.85
        return ("female" if pitch_hz >= 158.0 else "male"), 0.70

    # 2. Unvoiced or insufficient voiced frames -> rely on linguistic / meaning
    if has_female_text or has_female_meaning:
        return "female", 0.80
    if has_male_text or has_male_meaning:
        return "male", 0.80

    return "male", 0.50

def analyze_audio_segments(input_media_path: str, segments: list):
    """
    Analyzes a list of subtitle segments against an audio/video track.
    Returns array of detected genders with acoustic pitch data.
    """
    temp_wav = None
    wav_path = input_media_path

    # If input is video or non-wav audio, extract a 16kHz mono temp wav
    if not (input_media_path.lower().endswith('.wav')):
        temp_dir = tempfile.gettempdir()
        temp_wav = os.path.join(temp_dir, f'pitch_in_{int(time.time()*1000)}.wav')
        extract_audio_16k(input_media_path, temp_wav)
        wav_path = temp_wav

    try:
        audio, sr = sf.read(wav_path, dtype='float32')
        if audio.ndim > 1:
            audio = np.mean(audio, axis=1)  # downmix to mono

        total_audio_samples = len(audio)
        results = []

        for seg in segments:
            seg_id = seg.get('id')
            if 'start_ms' in seg:
                start_sec = float(seg['start_ms']) / 1000.0
            else:
                start_sec = float(seg.get('startTime', seg.get('start', 0.0)))

            if 'end_ms' in seg:
                end_sec = float(seg['end_ms']) / 1000.0
            else:
                end_sec = float(seg.get('endTime', seg.get('end', start_sec + 1.0)))

            start_idx = max(0, int(start_sec * sr))
            end_idx = min(total_audio_samples, int(end_sec * sr))

            if end_idx <= start_idx:
                pitch_hz, voiced_count = 0.0, 0
            else:
                slice_data = audio[start_idx:end_idx]
                pitch_hz, voiced_count = detect_slice_f0(slice_data, sr)

            gender, conf = classify_segment_gender(
                pitch_hz=pitch_hz,
                voiced_count=voiced_count,
                text=seg.get('text', ''),
                meaning=seg.get('meaning', '')
            )

            voice_profile = 'km-KH-SreymomNeural' if gender == 'female' else 'km-KH-PisethNeural'

            results.append({
                "id": seg_id,
                "gender": gender,
                "voiceProfile": voice_profile,
                "pitchHz": round(pitch_hz, 1) if pitch_hz > 0 else None,
                "voicedFrames": voiced_count,
                "confidence": round(conf, 2)
            })

        return results

    finally:
        if temp_wav and os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except:
                pass

def main():
    parser = argparse.ArgumentParser(description="Acoustic Voice Gender Detector for JAI DUBBER")
    parser.add_argument('--media', required=True, help="Input video or audio file")
    parser.add_argument('--segments', required=True, help="Path to JSON file containing subtitle segments")
    parser.add_argument('--output', default=None, help="Optional output JSON path")

    args = parser.parse_args()

    try:
        with open(args.segments, 'r', encoding='utf-8') as f:
            segments = json.load(f)

        detected = analyze_audio_segments(args.media, segments)
        output_data = {"ok": True, "detected": detected}

        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, ensure_ascii=False)
        else:
            print(json.dumps(output_data, ensure_ascii=False))

    except Exception as e:
        err_out = {"ok": False, "error": str(e)}
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(err_out, f, ensure_ascii=False)
        else:
            print(json.dumps(err_out, ensure_ascii=False))
        sys.exit(1)

if __name__ == '__main__':
    main()
