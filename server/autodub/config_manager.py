import os
import sys
import json
import threading
from typing import List, Dict, Optional, Any

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG_FILE = os.path.join(BASE_DIR, "config.json")

DEFAULT_CONFIG = {
    "api_keys": [],
    "active_key_index": 0,
    "key_rotation_mode": "failover",  # "failover" (rotate on 429) or "round_robin"
    "gemini_model": "gemini-3.5-flash",
    "voice": "auto",  # "auto", "km-KH-PisethNeural", "km-KH-SreymomNeural"
    "voice_rate": 0,  # percentage: -20 to +50
    "voice_pitch": 0,  # percentage: -20 to +20
    "audio_mode": "mute_original",  # "mute_original" or "mute_vocal" (or "duck_original")
    "duck_volume": 0.15,
    "sync_offset_ms": 0,  # Audio synchronization offset in ms (-500 to +500)
    "subtitle_burn": True,
    "subtitle_font": "Hanuman",
    "subtitle_y_pct": 94,
    "mask_width_pct": 88,
    "subtitle_color": "#facc15",  # Yellow
    "mask_color": "#000000",
    "folder_wish": "",
    "export_to": ""
}

class ConfigManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ConfigManager, cls).__new__(cls)
                cls._instance._init()
            return cls._instance

    def _init(self):
        self.config: Dict[str, Any] = DEFAULT_CONFIG.copy()
        self.load()

    def load(self):
        try:
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for k, v in data.items():
                        self.config[k] = v
            # Ensure api_keys is a list of dicts
            normalized_keys = []
            for item in self.config.get("api_keys", []):
                if isinstance(item, str):
                    normalized_keys.append({"key": item.strip(), "status": "Untested", "note": ""})
                elif isinstance(item, dict) and "key" in item:
                    normalized_keys.append(item)
            self.config["api_keys"] = normalized_keys
        except Exception as e:
            print(f"[ConfigManager] Error loading config: {e}")

    def save(self):
        with self._lock:
            try:
                with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(self.config, f, indent=2, ensure_ascii=False)
            except Exception as e:
                print(f"[ConfigManager] Error saving config: {e}")

    def get(self, key: str, default: Any = None) -> Any:
        return self.config.get(key, default)

    def set(self, key: str, value: Any):
        self.config[key] = value
        self.save()

    def add_api_key(self, key: str, name: str = "") -> bool:
        key = key.strip()
        if not key:
            return False
        # Check duplicate
        for item in self.config["api_keys"]:
            if item["key"] == key:
                return False
        key_count = len(self.config["api_keys"]) + 1
        self.config["api_keys"].append({
            "key": key,
            "name": name if name else f"Gemini Key {key_count}",
            "status": "Untested",
            "note": "Added",
            "enabled": True
        })
        self.save()
        return True

    def remove_api_key(self, index: int) -> bool:
        if 0 <= index < len(self.config["api_keys"]):
            self.config["api_keys"].pop(index)
            if self.config["active_key_index"] >= len(self.config["api_keys"]):
                self.config["active_key_index"] = max(0, len(self.config["api_keys"]) - 1)
            self.save()
            return True
        return False

    def update_key_status(self, index: int, status: str, note: str = ""):
        if 0 <= index < len(self.config["api_keys"]):
            self.config["api_keys"][index]["status"] = status
            self.config["api_keys"][index]["note"] = note
            self.save()

    def set_key_enabled(self, index: int, enabled: bool):
        if 0 <= index < len(self.config["api_keys"]):
            self.config["api_keys"][index]["enabled"] = bool(enabled)
            self.save()

    def get_api_keys(self) -> List[Dict[str, Any]]:
        return self.config.get("api_keys", [])

    def get_active_key(self) -> Optional[str]:
        keys = self.config.get("api_keys", [])
        if not keys:
            # Check env var as fallback
            env_key = os.environ.get("GEMINI_API_KEY")
            return env_key.strip() if env_key else None
        
        # Filter enabled keys
        enabled_keys = [k for k in keys if k.get("enabled", True)]
        target_keys = enabled_keys if enabled_keys else keys

        idx = self.config.get("active_key_index", 0)
        if idx >= len(target_keys):
            idx = 0
            self.config["active_key_index"] = 0
        return target_keys[idx]["key"]

    def rotate_to_next_key(self) -> Optional[str]:
        keys = self.config.get("api_keys", [])
        enabled_keys = [k for k in keys if k.get("enabled", True)]
        target_keys = enabled_keys if enabled_keys else keys

        if len(target_keys) <= 1:
            return self.get_active_key()
        curr_idx = self.config.get("active_key_index", 0)
        next_idx = (curr_idx + 1) % len(target_keys)
        self.config["active_key_index"] = next_idx
        self.save()
        print(f"[ConfigManager] Rotated to API key #{next_idx + 1}")
        return target_keys[next_idx]["key"]

    def mark_key_rate_limited(self, key_str: str):
        for idx, item in enumerate(self.config["api_keys"]):
            if item["key"] == key_str:
                self.update_key_status(idx, "Rate Limited / Quota", "429 Too Many Requests")
                break
        self.rotate_to_next_key()

    def mark_key_banned(self, key_str: str, status: str = "Banned (403)", note: str = "Permission Denied by Google"):
        with self._lock:
            for idx, item in enumerate(self.config.get("api_keys", [])):
                if item["key"] == key_str:
                    item["enabled"] = False
                    item["status"] = status
                    item["note"] = note
                    break
            self.save()
        self.rotate_to_next_key()

    @staticmethod
    def mask_key(key: str) -> str:
        if not key or len(key) < 10:
            return "••••••••"
        return f"{key[:6]}••••••••{key[-4:]}"

    @staticmethod
    def format_compact_key(key: str) -> str:
        if not key or len(key) < 10:
            return "••••••••"
        return f"{key[:6]}...{key[-4:]}"
