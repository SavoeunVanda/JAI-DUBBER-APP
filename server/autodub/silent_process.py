import sys
import subprocess

CREATE_NO_WINDOW = 0x08000000
SW_HIDE = 0
STARTF_USESHOWWINDOW = 0x00000001

if sys.platform == "win32":
    _orig_popen = subprocess.Popen

    class SilentPopen(_orig_popen):
        def __init__(self, *args, **kwargs):
            # Enforce CREATE_NO_WINDOW flag
            kwargs["creationflags"] = kwargs.get("creationflags", 0) | CREATE_NO_WINDOW

            # Enforce SW_HIDE in STARTUPINFO
            startupinfo = kwargs.get("startupinfo")
            if startupinfo is None:
                startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = SW_HIDE
            kwargs["startupinfo"] = startupinfo

            # CRITICAL WINDOWS UTF-8 FIX:
            # On Windows, text=True defaults to system ANSI encoding (cp1252).
            # If the process outputs non-ASCII (e.g. Chinese characters in folder paths,
            # Khmer text, ASS subtitles), Python's background _readerthread crashes
            # with UnicodeDecodeError: 'charmap' codec can't decode byte 0x81...,
            # deadlocking pipes and freezing FFmpeg / the entire application.
            if kwargs.get("text") or kwargs.get("universal_newlines"):
                if not kwargs.get("encoding"):
                    kwargs["encoding"] = "utf-8"
                if not kwargs.get("errors"):
                    kwargs["errors"] = "replace"

            # CRITICAL WINDOWS STDIN FIX:
            # Default stdin to DEVNULL if not explicitly provided, so spawned FFmpeg / ffprobe
            # processes never inherit parent stdin pipe and deadlock waiting for console input.
            if "stdin" not in kwargs or kwargs["stdin"] is None:
                kwargs["stdin"] = subprocess.DEVNULL

            super().__init__(*args, **kwargs)

    # Monkey patch standard library subprocess.Popen with SilentPopen class
    subprocess.Popen = SilentPopen

    # Also patch pydub.utils if pydub is imported
    try:
        import pydub.utils
        pydub.utils.Popen = SilentPopen
    except Exception:
        pass


def get_silent_kwargs() -> dict:
    """Returns extra kwargs for subprocess calls on Windows to guarantee no console window appears."""
    if sys.platform == "win32":
        si = subprocess.STARTUPINFO()
        si.dwFlags |= STARTF_USESHOWWINDOW
        si.wShowWindow = SW_HIDE
        return {
            "creationflags": CREATE_NO_WINDOW,
            "startupinfo": si
        }
    return {}
