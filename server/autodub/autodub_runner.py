"""
autodub_runner.py - CLI Runner and IPC bridge for JAI AUTO DUBBING in JAI DUBBER 1.0.4.

Accepts configuration via --job <path-to-json> or stdin, performs natural pause-aligned
Gemini translation, Edge TTS synthesis, Hanuman subtitle generation, and FFmpeg muxing.
Emits real-time JSON events on stdout for the Node.js / Electron server.
"""

import os
import sys
import json
import time
import signal
import threading
from typing import List, Dict, Any, Optional

# Force UTF-8 encoding on standard I/O streams on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ensure bin/ is on PATH for ffmpeg and ffprobe
def _ensure_bin_path():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.getcwd(), "bin"),
        os.path.join(current_dir, "..", "..", "..", "..", "resources", "bin"),
        os.path.join(current_dir, "..", "..", "..", "resources", "bin"),
        os.path.join(current_dir, "..", "..", "..", "bin"),
        os.path.join(current_dir, "..", "..", "bin"),
        os.path.join(current_dir, "..", "bin"),
        os.path.join(current_dir, "bin"),
    ]
    for cand in candidates:
        norm = os.path.abspath(cand)
        if os.path.exists(os.path.join(norm, "ffmpeg.exe")) or os.path.exists(os.path.join(norm, "ffmpeg")):
            if norm not in os.environ.get("PATH", ""):
                os.environ["PATH"] = norm + os.pathsep + os.environ.get("PATH", "")
            break

_ensure_bin_path()

# Self-healing: verify critical Python packages, auto-installing via pip if missing on user machine
def _ensure_dependencies():
    packages = [
        ("pydub", "pydub"),
        ("soundfile", "soundfile"),
        ("edge_tts", "edge-tts"),
    ]
    for mod_name, pip_name in packages:
        try:
            __import__(mod_name)
        except ImportError:
            try:
                import subprocess
                sys.stderr.write(f"[AutoDub] Missing package '{pip_name}', auto-installing via pip...\n")
                sys.stderr.flush()
                subprocess.run(
                    [sys.executable, "-m", "pip", "install", pip_name, "--no-warn-script-location"],
                    check=False,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=120
                )
            except Exception as e:
                sys.stderr.write(f"[AutoDub] Notice installing {pip_name}: {e}\n")
                sys.stderr.flush()

_ensure_dependencies()

# Import local autodub modules
try:
    import torch
    import demucs_separate
    import audio_pitch_detector
except Exception:
    pass

import silent_process
from video_processor import VideoProcessor
from config_manager import ConfigManager
from gemini_engine import DramaStyle

_stdout_lock = threading.Lock()

def emit_event(event_dict: Dict[str, Any]):
    """Emit JSON event line to stdout for Node/Electron to read with thread lock."""
    with _stdout_lock:
        try:
            line = json.dumps(event_dict, ensure_ascii=False)
            sys.stdout.write(line + "\n")
            sys.stdout.flush()
        except Exception as e:
            try:
                sys.stderr.write(f"[autodub_runner] emit error: {e}\n")
                sys.stderr.flush()
            except Exception:
                pass

def main():
    job_file: Optional[str] = None
    use_stdin = False

    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--job" and i + 1 < len(args):
            job_file = args[i + 1]
            i += 2
        elif args[i] == "--stdin":
            use_stdin = True
            i += 1
        elif args[i] == "--list-only" and i + 2 < len(args):
            # Special command: list files and check if already dubbed
            src_folder = args[i + 1]
            exp_folder = args[i + 2]
            files = VideoProcessor.find_video_files(src_folder)
            res = []
            for f in files:
                res.append({
                    "name": os.path.basename(f),
                    "path": f,
                    "size": os.path.getsize(f) if os.path.exists(f) else 0,
                    "alreadyDubbed": VideoProcessor.is_video_already_dubbed(f, exp_folder),
                    "outputPath": VideoProcessor.get_dubbed_output_path(f, exp_folder)
                })
            emit_event({"type": "list_result", "files": res})
            return
        else:
            i += 1

    job_data: Dict[str, Any] = {}
    if job_file and os.path.exists(job_file):
        with open(job_file, "r", encoding="utf-8") as f:
            job_data = json.load(f)
    elif use_stdin:
        raw = sys.stdin.readline()
        if raw.strip():
            job_data = json.loads(raw)

    source_folder = job_data.get("sourceFolder") or job_data.get("source_folder") or ""
    export_folder = job_data.get("outputFolder") or job_data.get("exportFolder") or job_data.get("export_folder") or ""

    if not source_folder or not os.path.isdir(source_folder):
        emit_event({"type": "error", "message": f"Source folder does not exist: {source_folder}"})
        sys.exit(1)

    if not export_folder:
        export_folder = os.path.join(source_folder, "DUBBED_KH")
    os.makedirs(export_folder, exist_ok=True)

    # Initialize VideoProcessor
    processor = VideoProcessor()

    # Apply job configuration to ConfigManager
    cm = processor.config_manager
    cm.load()

    # API Keys: If passed in job, use them but preserve disabled/banned states
    raw_keys = job_data.get("apiKeys") or job_data.get("api_keys")
    if raw_keys and isinstance(raw_keys, list) and len(raw_keys) > 0:
        existing_keys_map = {k.get("key"): k for k in cm.get_api_keys() if isinstance(k, dict)}
        normalized_keys = []
        for idx, k in enumerate(raw_keys):
            if isinstance(k, str) and k.strip():
                k_str = k.strip()
                if k_str in existing_keys_map:
                    normalized_keys.append(existing_keys_map[k_str])
                else:
                    normalized_keys.append({"key": k_str, "name": f"Gemini Key {idx + 1}", "status": "Untested", "enabled": True})
            elif isinstance(k, dict) and k.get("key"):
                normalized_keys.append(k)
        if normalized_keys:
            cm.set("api_keys", normalized_keys)

    # Other settings
    if "geminiModel" in job_data:
        cm.set("gemini_model", job_data["geminiModel"])
    elif "gemini_model" in job_data:
        cm.set("gemini_model", job_data["gemini_model"])

    if "voice" in job_data:
        cm.set("voice", job_data["voice"])
    if "voiceRate" in job_data:
        cm.set("voice_rate", int(job_data["voiceRate"]))
    if "voicePitch" in job_data:
        cm.set("voice_pitch", int(job_data["voicePitch"]))

    if "audioMode" in job_data:
        cm.set("audio_mode", job_data["audioMode"])
    elif "audio_mode" in job_data:
        cm.set("audio_mode", job_data["audio_mode"])

    if "duckVolume" in job_data:
        cm.set("duck_volume", float(job_data["duckVolume"]))
    if "syncOffsetMs" in job_data:
        cm.set("sync_offset_ms", int(job_data["syncOffsetMs"]))

    if "subtitleBurn" in job_data:
        cm.set("subtitle_burn", bool(job_data["subtitleBurn"]))
    elif "subtitle_burn" in job_data:
        cm.set("subtitle_burn", bool(job_data["subtitle_burn"]))

    if "subtitleFont" in job_data:
        cm.set("subtitle_font", job_data["subtitleFont"])
    elif "subtitle_font" in job_data:
        cm.set("subtitle_font", job_data["subtitle_font"])

    if "subtitleYPct" in job_data:
        cm.set("subtitle_y_pct", float(job_data["subtitleYPct"]))
    elif "subtitle_y_pct" in job_data:
        cm.set("subtitle_y_pct", float(job_data["subtitle_y_pct"]))

    if "subtitleColor" in job_data:
        cm.set("subtitle_color", job_data["subtitleColor"])
    elif "subtitle_color" in job_data:
        cm.set("subtitle_color", job_data["subtitle_color"])

    if "subtitleFontSize" in job_data:
        cm.set("subtitle_font_size", int(job_data["subtitleFontSize"]))
    elif "subtitle_font_size" in job_data:
        cm.set("subtitle_font_size", int(job_data["subtitle_font_size"]))

    if "subtitleWidthPct" in job_data:
        cm.set("subtitle_width_pct", float(job_data["subtitleWidthPct"]))
    elif "subtitle_width_pct" in job_data:
        cm.set("subtitle_width_pct", float(job_data["subtitle_width_pct"]))

    if "subtitleBgColor" in job_data:
        cm.set("subtitle_bg_color", str(job_data["subtitleBgColor"]))
    elif "subtitle_bg_color" in job_data:
        cm.set("subtitle_bg_color", str(job_data["subtitle_bg_color"]))

    if "subtitleBgOpacity" in job_data:
        cm.set("subtitle_bg_opacity", float(job_data["subtitleBgOpacity"]))
    elif "subtitle_bg_opacity" in job_data:
        cm.set("subtitle_bg_opacity", float(job_data["subtitle_bg_opacity"]))

    if "subtitleStyleType" in job_data:
        cm.set("subtitle_style_type", str(job_data["subtitleStyleType"]))
    elif "subtitle_style_type" in job_data:
        cm.set("subtitle_style_type", str(job_data["subtitle_style_type"]))

    if "subtitleMaxLines" in job_data:
        cm.set("subtitle_max_lines", int(job_data["subtitleMaxLines"]))
    elif "subtitle_max_lines" in job_data:
        cm.set("subtitle_max_lines", int(job_data["subtitle_max_lines"]))
    else:
        cm.set("subtitle_max_lines", 1)

    drama_style = job_data.get("dramaStyle") or job_data.get("drama_style") or DramaStyle.HISTORICAL_ROYAL
    processor.gemini_engine.set_drama_style(drama_style)

    skip_existing = job_data.get("skipExisting", True)
    if "skip_existing" in job_data:
        skip_existing = bool(job_data["skip_existing"])

    # Register cancellation signals
    def handle_sig(sig, frame):
        emit_event({"type": "log", "message": "Signal received, cancelling auto dubbing..."})
        processor.cancel()

    signal.signal(signal.SIGINT, handle_sig)
    signal.signal(signal.SIGTERM, handle_sig)

    # Listen on stdin for cancel command in background thread
    def stdin_listener():
        while not processor.is_cancelled:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                line_str = line.strip()
                if not line_str:
                    continue
                try:
                    msg = json.loads(line_str)
                    if msg.get("action") == "cancel":
                        emit_event({"type": "log", "message": "Cancellation requested via IPC."})
                        processor.cancel()
                        break
                except Exception:
                    if "cancel" in line_str.lower():
                        processor.cancel()
                        break
            except Exception:
                break

    listener_thread = threading.Thread(target=stdin_listener, daemon=True)
    listener_thread.start()

    # Find videos
    all_videos = VideoProcessor.find_video_files(source_folder)
    selected_files = job_data.get("selectedFiles") or job_data.get("selected_files")

    if selected_files and isinstance(selected_files, list) and len(selected_files) > 0:
        norm_selected = set(os.path.normpath(p) for p in selected_files)
        target_videos = [v for v in all_videos if os.path.normpath(v) in norm_selected or os.path.basename(v) in norm_selected]
    else:
        target_videos = all_videos

    total_count = len(target_videos)
    file_info_list = []
    for f in target_videos:
        file_info_list.append({
            "name": os.path.basename(f),
            "path": f,
            "size": os.path.getsize(f) if os.path.exists(f) else 0,
            "alreadyDubbed": VideoProcessor.is_video_already_dubbed(f, export_folder),
            "outputPath": VideoProcessor.get_dubbed_output_path(f, export_folder)
        })

    emit_event({
        "type": "init",
        "total": total_count,
        "sourceFolder": source_folder,
        "exportFolder": export_folder,
        "files": file_info_list
    })

    if total_count == 0:
        emit_event({"type": "complete", "total": 0, "succeeded": 0, "failed": 0, "skipped": 0})
        return

    # Preload Demucs AI model on MainThread if vocal isolation is requested.
    # Prevents Windows OS Loader Lock deadlock when ThreadPoolExecutor spawns TTS worker threads.
    audio_mode = cm.get("audio_mode", "mute_original")
    if audio_mode in ("mute_vocal", "isolate_vocal"):
        emit_event({"type": "log", "message": "កំពុង Preload Demucs AI Model (Vocal Separation) លើ GPU..."})
        try:
            import torch
            import demucs_separate
            dev = "cuda" if torch.cuda.is_available() else "cpu"
            demucs_separate.get_or_load_model("htdemucs", dev)
            emit_event({"type": "log", "message": f"Demucs AI Model រួចរាល់លើ {dev.upper()}!"})
        except Exception as e:
            emit_event({"type": "log", "message": f"Demucs Preload Notice: {e}"})

    succeeded_count = 0
    failed_count = 0
    skipped_count = 0

    for idx, video_path in enumerate(target_videos, start=1):
        if processor.is_cancelled:
            emit_event({"type": "cancelled"})
            break

        video_name = os.path.basename(video_path)

        # Check if already dubbed
        if skip_existing and VideoProcessor.is_video_already_dubbed(video_path, export_folder):
            out_p = VideoProcessor.get_dubbed_output_path(video_path, export_folder)
            emit_event({
                "type": "video_skipped",
                "index": idx,
                "total": total_count,
                "name": video_name,
                "path": video_path,
                "outputPath": out_p,
                "reason": "Already dubbed in export folder"
            })
            skipped_count += 1
            continue

        current_video_pct = 0
        emit_event({
            "type": "video_start",
            "index": idx,
            "total": total_count,
            "name": video_name,
            "path": video_path,
            "percent": 0
        })

        def status_cb(msg: str, pct: Optional[int] = None):
            nonlocal current_video_pct
            if pct is not None:
                current_video_pct = max(0, min(100, int(pct)))
            emit_event({
                "type": "progress",
                "index": idx,
                "total": total_count,
                "name": video_name,
                "path": video_path,
                "stage": "processing",
                "message": msg,
                "percent": current_video_pct
            })

        def progress_cb(pct: int, msg: Optional[str] = None):
            nonlocal current_video_pct
            current_video_pct = max(0, min(100, int(pct)))
            evt = {
                "type": "progress",
                "index": idx,
                "total": total_count,
                "name": video_name,
                "path": video_path,
                "stage": "processing",
                "percent": current_video_pct
            }
            if msg:
                evt["message"] = msg
            emit_event(evt)

        try:
            ok = processor.process_video_file(
                video_path=video_path,
                export_folder=export_folder,
                status_callback=status_cb,
                progress_callback=progress_cb
            )

            if ok:
                out_p = VideoProcessor.get_dubbed_output_path(video_path, export_folder)
                emit_event({
                    "type": "video_done",
                    "index": idx,
                    "total": total_count,
                    "name": video_name,
                    "path": video_path,
                    "outputPath": out_p,
                    "percent": 100
                })
                succeeded_count += 1
            else:
                if processor.is_cancelled:
                    emit_event({"type": "cancelled"})
                    break
                emit_event({
                    "type": "video_failed",
                    "index": idx,
                    "total": total_count,
                    "name": video_name,
                    "path": video_path,
                    "error": "Failed during processing"
                })
                failed_count += 1

        except Exception as e:
            if processor.is_cancelled:
                emit_event({"type": "cancelled"})
                break
            emit_event({
                "type": "video_failed",
                "index": idx,
                "total": total_count,
                "name": video_name,
                "path": video_path,
                "error": str(e)
            })
            failed_count += 1

    emit_event({
        "type": "complete",
        "total": total_count,
        "succeeded": succeeded_count,
        "failed": failed_count,
        "skipped": skipped_count
    })

if __name__ == "__main__":
    main()
