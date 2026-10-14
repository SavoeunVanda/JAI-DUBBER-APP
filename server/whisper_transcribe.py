# -*- coding: utf-8 -*-
import sys
import os
import json
import argparse
import traceback
import re

# Force UTF-8 stdout & stderr
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')



def main():
    parser = argparse.ArgumentParser(description='Fast-Whisper Audio Transcription')
    parser.add_argument('--audio', required=True, help='Path to audio or video file')
    parser.add_argument('--model', default='large-v3-turbo', help='Whisper model name')
    parser.add_argument('--device', default='auto', help='Device (cuda, cpu, auto)')
    parser.add_argument('--compute_type', default='auto', help='Compute type (float16, int8, auto)')
    parser.add_argument('--language', default=None, help='Source language code (e.g. zh, en, th) or None for auto')
    parser.add_argument('--output', default=None, help='Path to output JSON file')
    args = parser.parse_args()

    audio_path = args.audio
    if not os.path.exists(audio_path):
        sys.stderr.write(f'Audio file not found: {audio_path}\n')
        sys.exit(1)

    import torch
    from faster_whisper import WhisperModel

    device = args.device
    compute_type = args.compute_type

    if device == 'auto':
        if torch.cuda.is_available():
            device = 'cuda'
            compute_type = 'float16' if compute_type == 'auto' else compute_type
        else:
            device = 'cpu'
            compute_type = 'int8' if compute_type == 'auto' else compute_type
    elif compute_type == 'auto':
        compute_type = 'float16' if device == 'cuda' else 'int8'

    sys.stderr.write(f'Loading Fast-Whisper model \'{args.model}\' on {device} ({compute_type})...\n')

    model = None
    try:
        model = WhisperModel(args.model, device=device, compute_type=compute_type)
    except Exception as e:
        sys.stderr.write(f'Failed on {device} ({compute_type}): {e}\n')
        if device == 'cuda':
            sys.stderr.write('Retrying on CPU (int8)...\n')
            device = 'cpu'
            compute_type = 'int8'
            model = WhisperModel(args.model, device='cpu', compute_type='int8')
        else:
            raise

    import numpy as np
    from faster_whisper.audio import decode_audio

    # Step 1: Pre-decode audio and protect against phase cancellation and low volume
    audio_data = audio_path
    isolated_ch = None
    try:
        left_ch, right_ch = decode_audio(audio_path, sampling_rate=16000, split_stereo=True)
        e_left = float(np.mean(left_ch ** 2)) if len(left_ch) > 0 else 0.0
        e_right = float(np.mean(right_ch ** 2)) if len(right_ch) > 0 else 0.0
        mono_ch = (left_ch + right_ch) * 0.5
        e_mono = float(np.mean(mono_ch ** 2)) if len(mono_ch) > 0 else 0.0

        # If mono energy is drastically lower than the average channel energy, destructive phase cancellation exists!
        if (e_left > 1e-4 or e_right > 1e-4) and e_mono < 0.25 * ((e_left + e_right) * 0.5):
            sys.stderr.write('Detected stereo phase cancellation in source audio! Using left channel to preserve dialogue.\n')
            chosen_audio = left_ch
        else:
            chosen_audio = mono_ch

        # Volume normalization: check peak and rms energy to boost quiet or whispering dialogue
        peak = float(np.max(np.abs(chosen_audio))) if len(chosen_audio) > 0 else 0.0
        rms = float(np.sqrt(np.mean(chosen_audio ** 2))) if len(chosen_audio) > 0 else 0.0
        if peak > 0 and (peak < 0.70 or rms < 0.05):
            target_boost = min(4.0, 0.90 / peak)
            sys.stderr.write(f'Boosting audio volume (peak={peak:.3f}, rms={rms:.3f}, boost={target_boost:.2f}x) for optimal dialogue capture...\n')
            chosen_audio = chosen_audio * target_boost

        audio_data = chosen_audio
        isolated_ch = (left_ch if e_left >= e_right else right_ch) if len(left_ch) > 0 else None
    except Exception as dec_err:
        sys.stderr.write(f'Note: Audio pre-decoding skipped ({dec_err}), using file path directly.\n')
        audio_data = audio_path

    lang = args.language
    if lang and (lang.lower() in ('auto', 'null', 'none', '')):
        lang = None

    def extract_segment_bounds(seg):
        seg_start = seg.start
        seg_end = seg.end
        if hasattr(seg, 'words') and seg.words:
            valid_words = [w for w in seg.words if getattr(w, 'word', None) and w.word.strip()]
            if valid_words:
                first_w = valid_words[0]
                if first_w.start is not None and first_w.start >= seg_start:
                    seg_start = first_w.start
                last_w = valid_words[-1]
                if last_w.end is not None and last_w.end > seg_start:
                    seg_end = max(last_w.end, seg_start + 0.3)
        return round(seg_start, 2), round(seg_end, 2)

    # Step 2: Transcribe with sensitive, speech-preserving VAD filter separated by vocal pauses
    # threshold=0.38 prevents triggering on pre-speech inhalation/breathing
    # speech_pad_ms=30 prevents shifting start time into pre-speech silence (avoiding voice leading the mouth)
    sys.stderr.write('Transcribing audio with vocal-pause VAD filter (threshold=0.38, min_silence=300ms, speech_pad=30ms)...\n')
    results = []
    info = None

    vad_params = dict(
        threshold=0.38,
        min_speech_duration_ms=100,
        min_silence_duration_ms=300,
        speech_pad_ms=30
    )

    try:
        segments, info = model.transcribe(
            audio_data,
            beam_size=5,
            language=lang,
            vad_filter=True,
            vad_parameters=vad_params,
            word_timestamps=True,
            condition_on_previous_text=False,
            no_speech_threshold=0.85,
            log_prob_threshold=-1.0,
            compression_ratio_threshold=2.4
        )
        for segment in segments:
            text = segment.text.strip()
            if text:
                s_start, s_end = extract_segment_bounds(segment)
                results.append({
                    'start': s_start,
                    'end': s_end,
                    'text': text
                })
    except Exception as e:
        sys.stderr.write(f'VAD transcription notice: {e}\n')

    # Step 3: CRITICAL FALLBACK — If VAD yielded 0 segments OR missed significant dialogue due to BGM
    total_speech_dur = sum(s['end'] - s['start'] for s in results)
    audio_dur = round(getattr(info, 'duration', 0.0), 2) if info else 0.0

    # If VAD returned 0 segments, OR if speech duration is suspiciously low (< 10% on audio > 25s)
    need_full_retry = len(results) == 0 or (audio_dur > 25.0 and total_speech_dur < 0.10 * audio_dur)

    if need_full_retry:
        sys.stderr.write(f'Notice: VAD dialogue duration ({total_speech_dur:.1f}s / {audio_dur:.1f}s) may have missed speech. Running Whisper deep scan (vad_filter=False)...\n')
        try:
            segments_raw, info_raw = model.transcribe(
                audio_data,
                beam_size=5,
                language=lang,
                vad_filter=False,
                word_timestamps=True,
                condition_on_previous_text=False,
                no_speech_threshold=0.85,
                log_prob_threshold=-1.0,
                compression_ratio_threshold=2.4
            )

            raw_results = []
            for segment in segments_raw:
                text = segment.text.strip()
                if text:
                    s_start, s_end = extract_segment_bounds(segment)
                    raw_results.append({
                        'start': s_start,
                        'end': s_end,
                        'text': text
                    })
            raw_speech_dur = sum(s['end'] - s['start'] for s in raw_results)
            # If the raw scan recovered dialogue, adopt it
            if len(raw_results) > len(results) or raw_speech_dur > total_speech_dur:
                sys.stderr.write(f'Deep scan recovered {len(raw_results)} dialogue segments (total {raw_speech_dur:.1f}s speech)!\n')
                results = raw_results
                if not info and info_raw:
                    info = info_raw
        except Exception as retry_err:
            sys.stderr.write(f'Retry without VAD error: {retry_err}\n')

    # Step 4: Stereo isolated channel fallback (if mono still yielded 0 segments)
    if len(results) == 0 and isolated_ch is not None:
        sys.stderr.write('Retrying on isolated audio channel without VAD...\n')
        try:
            segments_iso, _ = model.transcribe(
                isolated_ch,
                beam_size=5,
                language=lang,
                vad_filter=False,
                word_timestamps=True,
                condition_on_previous_text=False,
                no_speech_threshold=0.85,
                log_prob_threshold=-1.0,
                compression_ratio_threshold=2.4
            )
            for segment in segments_iso:
                text = segment.text.strip()
                if text:
                    s_start, s_end = extract_segment_bounds(segment)
                    results.append({
                        'start': s_start,
                        'end': s_end,
                        'text': text
                    })
            if len(results) > 0:
                sys.stderr.write(f'Channel fallback recovered {len(results)} dialogue segments!\n')
        except Exception:
            pass

    detected_lang = getattr(info, 'language', 'unknown') if info else 'unknown'
    detected_prob = round(getattr(info, 'language_probability', 0.0), 3) if info else 0.0
    detected_dur = round(getattr(info, 'duration', 0.0), 2) if info else 0.0

    output_data = {
        'language': detected_lang,
        'language_probability': detected_prob,
        'duration': detected_dur,
        'segments': results
    }

    json_str = json.dumps(output_data, ensure_ascii=False, indent=2)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(json_str)
        sys.stderr.write(f'Output written to {args.output}\n')
    else:
        print(json_str)

if __name__ == '__main__':
    try:
        main()
    except Exception as err:
        sys.stderr.write(f'Whisper transcription error: {err}\n')
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
