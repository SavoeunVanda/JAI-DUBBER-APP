"""
Demucs AI Vocal Separation Bridge for JAI DUBBER
Extracts pure BGM and SFX (no_vocals) from video/audio using Demucs on CUDA/CPU,
bypassing torchaudio's torchcodec dependency via soundfile and bundled FFmpeg.
Features memory-bounded chunked streaming processing to handle arbitrarily long videos
(from 1 minute to 3+ hours) without running out of CUDA VRAM or system RAM.
"""

import sys
import os
import argparse
import json
import time
import subprocess
import tempfile
import threading
from contextlib import nullcontext
import numpy as np
import torch
import soundfile as sf

_CACHED_MODEL = None
_CACHED_DEVICE = None
_CACHED_MODEL_NAME = None
_MODEL_LOCK = threading.Lock()

def get_or_load_model(model_name: str, device: str):
    global _CACHED_MODEL, _CACHED_DEVICE, _CACHED_MODEL_NAME
    with _MODEL_LOCK:
        if _CACHED_MODEL is not None and _CACHED_DEVICE == device and _CACHED_MODEL_NAME == model_name:
            return _CACHED_MODEL
        import demucs.pretrained
        model = demucs.pretrained.get_model(model_name)
        model.to(device)
        model.eval()
        _CACHED_MODEL = model
        _CACHED_DEVICE = device
        _CACHED_MODEL_NAME = model_name
        return model

def get_bundled_ffmpeg():
    # Check bundled bin folder
    current_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
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

def extract_audio_wav(input_path: str, temp_wav_path: str):
    ffmpeg_bin = get_bundled_ffmpeg()
    cmd = [
        ffmpeg_bin, '-y',
        '-i', input_path,
        '-vn',
        '-ar', '44100',
        '-ac', '2',
        '-c:a', 'pcm_s16le',
        temp_wav_path
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

def separate_audio(input_file: str, output_bgm: str, output_vocals: str = None, device: str = 'auto', model_name: str = 'htdemucs'):
    t0 = time.time()
    
    # 1. Device resolution
    if device == 'auto':
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    # 2. Extract or read input audio as 44100Hz stereo wav
    is_temp_wav = False
    wav_file = input_file
    if not (input_file.lower().endswith('.wav')):
        temp_dir = tempfile.gettempdir()
        wav_file = os.path.join(temp_dir, f'demucs_in_{int(time.time()*1000)}.wav')
        extract_audio_wav(input_file, wav_file)
        is_temp_wav = True
    
    try:
        info = sf.info(wav_file)
        sr = info.samplerate
        total_samples = info.frames
        duration = total_samples / float(sr)
        
        # 3. Load or reuse Demucs Model
        import demucs.apply
        model = get_or_load_model(model_name, device)
        vocal_idx = model.sources.index('vocals')

        os.makedirs(os.path.dirname(os.path.abspath(output_bgm)), exist_ok=True)
        if output_vocals:
            os.makedirs(os.path.dirname(os.path.abspath(output_vocals)), exist_ok=True)

        # Chunk parameters: 180 seconds chunk, 2 seconds overlap for crossfading
        CHUNK_SEC = 180.0
        OVERLAP_SEC = 2.0
        chunk_len = int(CHUNK_SEC * sr)
        overlap_len = int(OVERLAP_SEC * sr)
        step_len = chunk_len - overlap_len

        # If audio is small (<= 180s), single pass
        if total_samples <= chunk_len:
            data, _ = sf.read(wav_file, dtype='float32')
            if data.ndim == 1:
                data = data[:, None]
            if data.shape[1] == 1:
                data = data.repeat(2, axis=1)
            elif data.shape[1] > 2:
                data = data[:, :2]

            tensor = torch.from_numpy(data.T).float()[None]  # CPU tensor
            with torch.no_grad():
                sources = demucs.apply.apply_model(model, tensor, device=device, split=True, progress=False)[0]

            bgm_tensor = sum(sources[i] for i in range(len(model.sources)) if i != vocal_idx)
            bgm_data = bgm_tensor.numpy().T
            sf.write(output_bgm, bgm_data, sr, subtype='PCM_16')

            if output_vocals:
                vocals_tensor = sources[vocal_idx]
                sf.write(output_vocals, vocals_tensor.numpy().T, sr, subtype='PCM_16')
        else:
            # Multi-chunk streaming processing for long videos (e.g. 10m to 2+ hours)
            print(f"[Demucs] Processing long audio ({duration:.1f}s / {duration/60:.1f} min) in {CHUNK_SEC}s streaming chunks...", file=sys.stderr)
            
            with sf.SoundFile(wav_file, mode='r') as in_f, \
                 sf.SoundFile(output_bgm, mode='w', samplerate=sr, channels=2, subtype='PCM_16') as bgm_out, \
                 (sf.SoundFile(output_vocals, mode='w', samplerate=sr, channels=2, subtype='PCM_16') if output_vocals else nullcontext()) as voc_out:

                prev_bgm_tail = None
                prev_voc_tail = None
                curr_sample = 0
                chunk_index = 0
                total_chunks = max(1, (total_samples + step_len - 1) // step_len)

                while curr_sample < total_samples:
                    chunk_index += 1
                    in_f.seek(curr_sample)
                    frames_to_read = min(chunk_len, total_samples - curr_sample)
                    chunk_data = in_f.read(frames_to_read, dtype='float32')

                    if chunk_data.ndim == 1:
                        chunk_data = chunk_data[:, None]
                    if chunk_data.shape[1] == 1:
                        chunk_data = chunk_data.repeat(2, axis=1)
                    elif chunk_data.shape[1] > 2:
                        chunk_data = chunk_data[:, :2]

                    actual_len = len(chunk_data)
                    chunk_tensor = torch.from_numpy(chunk_data.T).float()[None]  # CPU tensor

                    # Run separation on chunk
                    with torch.no_grad():
                        try:
                            sources = demucs.apply.apply_model(model, chunk_tensor, device=device, split=True, progress=False)[0]
                        except Exception as oom:
                            if device == 'cuda':
                                print(f"[Demucs] CUDA error on chunk {chunk_index}, fallback chunk to CPU...", file=sys.stderr)
                                torch.cuda.empty_cache()
                                sources = demucs.apply.apply_model(model, chunk_tensor, device='cpu', split=True, progress=False)[0]
                            else:
                                raise oom

                    bgm_chunk = sum(sources[i] for i in range(len(model.sources)) if i != vocal_idx).numpy().T
                    voc_chunk = sources[vocal_idx].numpy().T if output_vocals else None

                    # Crossfade & stream write
                    if prev_bgm_tail is None:
                        # First chunk
                        if actual_len <= chunk_len and (curr_sample + actual_len) >= total_samples:
                            bgm_out.write(bgm_chunk)
                            if voc_out: voc_out.write(voc_chunk)
                            break
                        else:
                            bgm_out.write(bgm_chunk[:step_len])
                            prev_bgm_tail = bgm_chunk[step_len:]
                            if voc_out:
                                voc_out.write(voc_chunk[:step_len])
                                prev_voc_tail = voc_chunk[step_len:]
                    else:
                        head_len = min(len(prev_bgm_tail), actual_len)
                        fade_in = np.linspace(0.0, 1.0, head_len, dtype=np.float32)[:, None]
                        fade_out = 1.0 - fade_in

                        blended_bgm = prev_bgm_tail[:head_len] * fade_out + bgm_chunk[:head_len] * fade_in
                        bgm_out.write(blended_bgm)
                        if voc_out and prev_voc_tail is not None:
                            blended_voc = prev_voc_tail[:head_len] * fade_out + voc_chunk[:head_len] * fade_in
                            voc_out.write(blended_voc)

                        if (curr_sample + actual_len) < total_samples:
                            bgm_out.write(bgm_chunk[head_len:step_len])
                            prev_bgm_tail = bgm_chunk[step_len:]
                            if voc_out:
                                voc_out.write(voc_chunk[head_len:step_len])
                                prev_voc_tail = voc_chunk[step_len:]
                        else:
                            bgm_out.write(bgm_chunk[head_len:])
                            prev_bgm_tail = None
                            if voc_out:
                                voc_out.write(voc_chunk[head_len:])
                                prev_voc_tail = None

                    if device == 'cuda':
                        torch.cuda.empty_cache()

                    pct = min(99.0, round((chunk_index / total_chunks) * 100, 1))
                    print(f"[Demucs] Chunk {chunk_index}/{total_chunks} ({pct}%)...", file=sys.stderr)
                    sys.stderr.flush()

                    curr_sample += step_len

        elapsed = time.time() - t0
        print(f"[Demucs] Separation successfully finished in {elapsed:.1f}s for {duration:.1f}s audio.", file=sys.stderr)
        
        return {
            "success": True,
            "device": device,
            "duration": round(duration, 2),
            "timeTaken": round(elapsed, 2),
            "outputBgm": output_bgm,
            "outputVocals": output_vocals or None
        }
    finally:
        if is_temp_wav and os.path.exists(wav_file):
            try:
                os.remove(wav_file)
            except:
                pass

def main():
    parser = argparse.ArgumentParser(description="Demucs Audio Separation for JAI DUBBER")
    parser.add_argument('--input', required=True, help="Input video or audio file path")
    parser.add_argument('--output-bgm', required=True, help="Path to save isolated BGM and SFX (no_vocals)")
    parser.add_argument('--output-vocals', default=None, help="Path to save isolated vocals")
    parser.add_argument('--device', default='auto', choices=['auto', 'cuda', 'cpu'], help="Compute device")
    parser.add_argument('--model', default='htdemucs', help="Demucs model name (default: htdemucs)")
    
    args = parser.parse_args()
    
    try:
        res = separate_audio(
            input_file=args.input,
            output_bgm=args.output_bgm,
            output_vocals=args.output_vocals,
            device=args.device,
            model_name=args.model
        )
        print(json.dumps(res))
    except Exception as e:
        err_res = {"success": False, "error": str(e)}
        print(json.dumps(err_res))
        sys.exit(1)

if __name__ == '__main__':
    main()
