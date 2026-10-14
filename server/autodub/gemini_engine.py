"""
GeminiEngine - Advanced Translation & Transcription Engine for Khmer Auto-Dubbing.

Features:
1. Context Memory: Rolling multi-segment dialogue context across audio chunks.
2. Character Profile Manager: Tracks character names, genders, roles, speech styles, and consistent pronouns.
3. Terminology Dictionary: Standardized drama dictionary (Royal, Wuxia, Modern, Casual, Formal).
4. Drama Genre / Tone Classification: Automatic adaptation for Historical Royal, Wuxia, Modern, Action.
5. Segment Context Injection: Injects recent dialogue, characters, and glossary into Gemini prompts.
6. Stable JSON Output: Deterministic, standardized schema for Subtitle Editors.
7. Protected Timestamps: Strict clamping, non-destructive boundary calibration, zero timestamp corruption.
8. Validation & Healing: Detects dropped segments, hallucinated loops, and missing texts.
9. Resilient Fallback & Retry: Multi-key rotation on 429/quota, model fallback ladder, exponential backoff.
10. Full Debug Logging: Logs raw LLM responses and final validated JSON.
"""

import os
import sys
import json
import re
import subprocess
import silent_process
from silent_process import get_silent_kwargs
import time
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional
from google import genai
from google.genai import types
from google.genai.errors import APIError
from config_manager import ConfigManager
from khmer_utils import clean_khmer_text

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

LOGS_DIR = os.path.join(BASE_DIR, "logs")


class DramaStyle:
    """Drama genres and speech registers."""
    HISTORICAL_ROYAL = "Historical_Royal"     # រឿងបុរាណរាជវាំង (Royal titles, honorifics, court etiquette)
    HISTORICAL_WUXIA = "Historical_Wuxia"     # យុទ្ធសិល្ប៍បុរាណ (Martial arts, chivalry, sects)
    MODERN_FORMAL = "Modern_Formal"           # សម័យទំនើបផ្លូវការ (Business, executive, polite society)
    MODERN_CASUAL = "Modern_Casual"           # សម័យទំនើបស្និទ្ធស្នាល (Everyday conversational, family, friends)
    ACTION_URGENT = "Action_Urgent"           # សកម្មភាពតានតឹង (Fast-paced, suspense, commands)

    @classmethod
    def get_style_guidelines(cls, style: str) -> str:
        guidelines = {
            cls.HISTORICAL_ROYAL: (
                "STYLE: HISTORICAL ROYAL / PALACE DRAMA (រឿងបុរាណរាជវាំង & រាជស័ព្ទ)\n"
                "- Subordinates/Ministers speaking to King/Prince: Use 'ទូលព្រះបង្គំ' or 'ទូលបង្គំ' (NEVER 'ទូលបង្គាប់'!).\n"
                "- Addressing King/Emperor: 'ព្រះករុណា', 'ព្រះមហាក្សត្រ'.\n"
                "- Addressing Prince/Royalty: 'ព្រះអង្គ', 'ម្ចាស់បង', 'ទ្រង់'.\n"
                "- Female Consort/Maid addressing King: 'ខ្ញុំម្ចាស់', 'ខ្ញុំម្ចាស់ក្សត្រី'.\n"
                "- Royal Commands: 'ទទួលរាជបញ្ជា', 'ក្រាបទូល', 'សូមព្រះករុណាទ្រង់ព្រះមេត្តាប្រោស'."
            ),
            cls.HISTORICAL_WUXIA: (
                "STYLE: HISTORICAL WUXIA / MARTIAL ARTS (យុទ្ធសិល្ប៍បុរាណ & ពិភពគុន)\n"
                "- Chivalrous terms: 'អ្នកក្លាហាន', 'មេបក្ស', 'លោកគ្រូ', 'សិស្សច្បង', 'សិស្សប្អូន'.\n"
                "- Martial realm: 'យុទ្ធភព', 'ពិភពគុន', 'ធាតុពិត', 'កម្លាំងខាងក្នុង', 'ថ្នាំបន្សាបពិស'.\n"
                "- Bold, honorable, courageous dialogue rhythm."
            ),
            cls.MODERN_FORMAL: (
                "STYLE: MODERN FORMAL / CORPORATE DRAMA (សម័យទំនើប ផ្លូវការ & ការងារ)\n"
                "- Professional workplace terms: 'លោកប្រធាន', 'លោកអគ្គនាយក', 'អ្នកគ្រប់គ្រង', 'លេខា'.\n"
                "- Polite, professional pronouns: 'លោក', 'លោកស្រី', 'អ្នកនាង', 'ខ្ញុំបាទ', 'នាងខ្ញុំ'."
            ),
            cls.MODERN_CASUAL: (
                "STYLE: MODERN CASUAL / YOUTH / ROMANCE (សម័យទំនើប ស្និទ្ធស្នាល & ជីវិតប្រចាំថ្ងៃ)\n"
                "- Natural everyday conversational Khmer: 'ខ្ញុំ/ឯង', 'បង/អូន', 'ម៉ាក់/ប៉ា'.\n"
                "- Emotional, expressive drama dialogues as heard in popular TV dubbing."
            ),
            cls.ACTION_URGENT: (
                "STYLE: ACTION / THRILLER / URGENT (សកម្មភាព តានតឹង & បន្ទាន់)\n"
                "- Short, snappy, high-impact lines: 'រត់ទៅ!', 'ជួយផង!', 'ប្រយ័ត្ន!', 'តាមចាប់វា!'."
            )
        }
        return guidelines.get(style, guidelines[cls.HISTORICAL_ROYAL])


class RelationshipEngine:
    """Manages character relationships and authentic Khmer pronoun pairs."""
    @staticmethod
    def get_relationship_rules_text() -> str:
        return (
            "KHMER DRAMA RELATIONSHIP & PRONOUN MATRIX (វិធានការប្រើសព្វនាមខ្មែរតាមទំនាក់ទំនង):\n"
            "🚨 DO NOT TRANSLATE 你 / 我 / 他 / 她 LITERALLY! Always select the authentic Khmer form:\n"
            "1. LOVERS / HUSBAND & WIFE: Man calls self 'បង', calls woman 'អូន'. Woman calls self 'អូន', calls man 'បង' (បង / អូន). NEVER 'អ្នក / ខ្ញុំ'!\n"
            "2. FATHER & CHILD: Father calls self 'ប៉ា/ពុក', calls child 'កូន'. Child calls father 'ប៉ា/ពុក', calls self 'កូន'.\n"
            "3. MOTHER & CHILD: Mother calls self 'ម៉ាក់/ម៉ែ', calls child 'កូន'. Child calls mother 'ម៉ាក់/ម៉ែ', calls self 'កូន'.\n"
            "4. OLDER BROTHER/SISTER & SIBLING: Older calls self 'បង', calls younger 'អូន/ប្អូន'. Younger calls older 'បង', calls self 'អូន/ប្អូន'.\n"
            "5. ROYALTY: Subject calls King 'ព្រះករុណា', calls self 'ទូលព្រះបង្គំ' (NEVER 'ទូលបង្គាប់'!). King calls self 'យើង', calls subjects 'ពួកឯង'. Queen/Consort calls self 'ខ្ញុំម្ចាស់'.\n"
            "6. WUXIA/MARTIAL: Disciple calls Master 'លោកគ្រូ/មេបក្ស', calls self 'កូនសិស្ស/ទូលបង្គំ'. Master calls self 'គ្រូ', calls disciple 'ឯង/កូន'.\n"
            "7. WORKPLACE: Subordinate calls boss 'លោកប្រធាន/ថៅកែ', calls self 'ខ្ញុំបាទ/នាងខ្ញុំ'. Boss calls subordinate 'ឯង/អ្នក'.\n"
            "8. STRANGERS: Polite 'លោក' (man), 'អ្នកនាង/លោកស្រី' (woman), self 'ខ្ញុំ'.\n"
            "9. FRIENDS: 'ឯង / យើង' or names.\n"
            "10. CONFLICT / ENEMIES: 'ឯង / យើង' or hostile words ('អា...', 'មី...'). When lovers fight intensely, they switch coldly to 'លោក / ខ្ញុំ' or 'ឯង / យើង'!\n"
        )


class CharacterProfile:
    """Stores a character profile for consistent pronoun and tone handling."""
    def __init__(
        self,
        name: str,
        gender: str = "Male",
        age_group: str = "adult",
        role: str = "",
        personality: str = "natural",
        speech_style: str = "Formal",
        relationships: Optional[Dict[str, str]] = None
    ):
        self.name = name
        self.gender = "Female" if gender.lower() in ["female", "woman", "girl", "ស្រី"] else "Male"
        self.age_group = age_group
        self.role = role
        self.personality = personality
        self.speech_style = speech_style
        self.relationships = relationships or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "gender": self.gender,
            "age_group": self.age_group,
            "role": self.role,
            "personality": self.personality,
            "speech_style": self.speech_style,
            "relationships": self.relationships
        }


class CharacterProfileManager:
    """Manages character roster across episode segments to guarantee consistent names & pronouns."""
    def __init__(self):
        self.profiles: Dict[str, CharacterProfile] = {}

    def register_or_update(
        self,
        name: str,
        gender: str = "Male",
        age_group: str = "adult",
        role: str = "",
        personality: str = "natural",
        speech_style: str = "Formal",
        relationships: Optional[Dict[str, str]] = None
    ) -> CharacterProfile:
        if not name or not name.strip():
            name = "Unknown"
        name = name.strip()
        if name not in self.profiles:
            prof = CharacterProfile(
                name=name,
                gender=gender,
                age_group=age_group,
                role=role,
                personality=personality,
                speech_style=speech_style,
                relationships=relationships
            )
            self.profiles[name] = prof
        else:
            prof = self.profiles[name]
            if gender in ["Male", "Female"]:
                prof.gender = gender
            if role:
                prof.role = role
            if age_group:
                prof.age_group = age_group
            if personality:
                prof.personality = personality
            if speech_style:
                prof.speech_style = speech_style
            if relationships:
                prof.relationships.update(relationships)
        return self.profiles[name]

    def get_profile(self, name: str) -> Optional[CharacterProfile]:
        return self.profiles.get(name.strip())

    def get_prompt_text(self) -> str:
        if not self.profiles:
            return "CHARACTER ROSTER: Auto-detect and register character names, genders, and roles in pure Khmer.\n"
        lines = ["ACTIVE CHARACTER ROSTER & PRONOUN RULES (តួអង្គក្នុងរឿង ដើម្បីប្រើពាក្យសព្វនាមឱ្យត្រូវ):"]
        for p in list(self.profiles.values())[:12]:
            lines.append(f"  - [{p.name}] (Gender: {p.gender}, Role: {p.role or 'Character'}, Age: {p.age_group}): Style={p.speech_style}")
        return "\n".join(lines) + "\n"

    def clear(self):
        self.profiles.clear()


class TerminologyDictionary:
    """Standardizes drama terms, titles, idioms, and addresses into pure authentic Khmer."""
    ROYAL_TERMS = {
        "陛下": "ព្រះករុណា",
        "皇上": "ព្រះករុណា / ព្រះមហាក្សត្រ",
        "殿下": "ព្រះអង្គ / ទ្រង់",
        "太子": "ព្រះរជ្ជទាយាទ",
        "皇后": "ព្រះអគ្គមហេសី",
        "娘娘": "ព្រះម្នាង",
        "贵妃": "ព្រះស្នំឯក",
        "王爷": "ព្រះអង្គម្ចាស់ / លោកម្ចាស់",
        "王妃": "អ្នកម្នាង / ព្រះជាយា",
        "微臣": "ទូលបង្គំ / ទូលព្រះបង្គំ",
        "奴才": "ទូលបង្គំ",
        "奴婢": "ខ្ញុំម្ចាស់",
        "臣妾": "ខ្ញុំម្ចាស់ / ខ្ញុំម្ចាស់ក្សត្រី",
        "遵命": "ទទួលរាជបញ្ជា / ក្រាបទូល",
        "领旨": "ទទួលរាជបញ្ជា",
        "喳": "ក្រាបទូល",
        "谢主隆恩": "អរព្រះគុណព្រះករុណាជាអនេក",
        "启奏": "ក្រាបបង្គំទូល",
        "圣旨": "ព្រះរាជក្រឹត្យ / រាជសារ",
        "斩": "កាត់ក្បាល / ប្រហារជីវិត",
        "诛九族": "ប្រហារជីវិតប្រាំបួនជួរត្រកូល",
        "平身": "ក្រោកឡើងវិញចុះ"
    }

    WUXIA_TERMS = {
        "江湖": "យុទ្ធភព / ពិភពគុន",
        "大侠": "អ្នកក្លាហាន",
        "掌门": "មេបក្ស / ប្រធានបក្ស",
        "师父": "លោកគ្រូ / គ្រូ",
        "师傅": "លោកគ្រូ",
        "师兄": "សិស្សច្បង",
        "师弟": "សិស្សប្អូន",
        "师姐": "សិស្សច្បងស្រី",
        "师妹": "សិស្សប្អូនស្រី",
        "徒儿": "កូនសិស្ស",
        "内力": "ថាមពលខាងក្នុង / កម្លាំងធាតុ",
        "真气": "ធាតុពិតខាងក្នុង",
        "走火入魔": "ធ្លាក់ក្នុងអន្ទាក់ផ្លូវងងឹត / វិបល្លាសផ្លូវចិត្ត",
        "报仇": "សងសឹក",
        "解药": "ថ្នាំបន្សាបពិស",
        "暗器": "អាវុធសម្ងាត់"
    }

    MODERN_TERMS = {
        "总裁": "លោកប្រធាន / លោកអគ្គនាយក",
        "董事长": "ប្រធានក្រុមប្រឹក្សាភិបាល / ថៅកែធំ",
        "老板": "ថៅកែ / មេ",
        "经理": "អ្នកគ្រប់គ្រង",
        "秘书": "លេខា",
        "助理": "ជំនួយការ",
        "离婚": "លែងលះ",
        "结婚": "រៀបការ",
        "吵死了": "រំខានណាស់!",
        "烦死了": "រំខានណាស់!",
        "闭嘴": "បិទមាត់ទៅ!",
        "滚": "ចេញទៅ! / ចេញឱ្យឆ្ងាយ!",
        "救命": "ជួយផង!"
    }

    KINSHIP_TERMS = {
        "爸爸": "ប៉ា / ពុក (កូនហៅ)",
        "父亲": "ឪពុក / ពុក",
        "妈妈": "ម៉ាក់ / ម៉ែ (កូនហៅ)",
        "母亲": "ម្តាយ / ម៉ែ",
        "哥哥": "បងប្រុស / បង",
        "姐姐": "បងស្រី / បង",
        "弟弟": "ប្អូនប្រុស / ប្អូន",
        "妹妹": "ប្អូនស្រី / អូន",
        "爷爷": "លោកតា",
        "奶奶": "លោកយាយ",
        "外公": "លោកតា",
        "外婆": "លោកយាយ",
        "叔叔": "លោកពូ",
        "阿姨": "អ្នកមីង",
        "伯父": "លោកអ៊ំ",
        "伯母": "អ្នកអ៊ំ",
        "老公": "ប្តី / បង",
        "老婆": "ប្រពន្ធ / អូន",
    }

    def __init__(self):
        self.custom_terms: Dict[str, str] = {}

    def add_custom_term(self, original: str, khmer_trans: str):
        if original and khmer_trans:
            self.custom_terms[original.strip()] = khmer_trans.strip()

    def get_glossary_prompt_text(self, style: str) -> str:
        lines = ["STANDARDIZED TERMINOLOGY DICTIONARY (វចនានុក្រមបកប្រែជាក់លាក់ ហាមបកប្រែខុស):"]
        if style == DramaStyle.HISTORICAL_ROYAL:
            items = list(self.ROYAL_TERMS.items())[:12]
        elif style == DramaStyle.HISTORICAL_WUXIA:
            items = list(self.WUXIA_TERMS.items())[:12]
        else:
            items = list(self.MODERN_TERMS.items())[:12]

        for orig, kh in items:
            lines.append(f"  - {orig} => {kh}")

        lines.append("  [KINSHIP & FAMILY ADDRESS TERMS]:")
        for orig, kh in list(self.KINSHIP_TERMS.items())[:8]:
            lines.append(f"  - {orig} => {kh}")

        if self.custom_terms:
            lines.append("  [CUSTOM GLOSSARY]:")
            for k, v in self.custom_terms.items():
                lines.append(f"  - {k} => {v}")

        return "\n".join(lines) + "\n"

    def apply_post_translation_corrections(self, text: str) -> str:
        if not text:
            return ""
        # 1. Eliminate broken Thai transliteration
        text = re.sub(r'រំ[ាាំ]?[ខគ]ា?[ញន]', 'រំខាន', text)
        text = re.sub(r'កុំរំ[ាាំ]?[ខគ]ា?[ញន]', 'កុំរំខាន', text)
        # 2. Historical & Royal corrections
        text = re.sub(r'ទូលបង្គាប់', 'ទូលព្រះបង្គំ', text)
        # 3. Custom replacements
        for orig, kh in self.custom_terms.items():
            text = text.replace(orig, kh)
        return text


class ContextMemory:
    """Maintains rolling conversation history across segments and chunks."""
    def __init__(self, max_history: int = 8):
        self.max_history = max_history
        self.history: List[Dict[str, Any]] = []
        self.detected_style: str = DramaStyle.HISTORICAL_ROYAL

    def add_segment(self, seg: Dict[str, Any]):
        self.history.append({
            "speaker": seg.get("speaker", "Unknown"),
            "character_name": seg.get("character_name", ""),
            "original_text": seg.get("original_text", ""),
            "khmer_text": seg.get("khmer_text", ""),
            "tone": seg.get("tone", "conversational")
        })
        if len(self.history) > self.max_history:
            self.history.pop(0)

    def get_prompt_text(self) -> str:
        if not self.history:
            return "RECENT CONVERSATION CONTEXT: Beginning of scene / episode.\n"
        lines = ["RECENT CONVERSATION CONTEXT (ការសន្ទនាពីមុន ដើម្បីរក្សាសាច់រឿង និងសព្វនាមឱ្យត្រូវគ្នា):"]
        for i, h in enumerate(self.history[-5:], 1):
            spk = h.get("character_name") or h.get("speaker") or "Speaker"
            lines.append(f"  {i}. [{spk}] \"{h.get('original_text', '')}\" -> \"{h.get('khmer_text', '')}\"")
        return "\n".join(lines) + "\n"

    def clear(self):
        self.history.clear()


class GeminiEngine:
    """
    Advanced Gemini Translation & Transcription Engine.
    Equipped with Context Memory, Character Profiles, Terminology Dictionary,
    Genre Adaptation, Stable JSON Generation, and Safe Timestamp Clamping.
    """
    def __init__(self):
        self.config_manager = ConfigManager()
        self.context_memory = ContextMemory()
        self.character_manager = CharacterProfileManager()
        self.terminology_dict = TerminologyDictionary()
        self.current_style = DramaStyle.HISTORICAL_ROYAL
        self._ensure_logs_dir()

    def _ensure_logs_dir(self):
        try:
            os.makedirs(LOGS_DIR, exist_ok=True)
        except Exception as e:
            print(f"[GeminiEngine] Warning: Could not create logs directory: {e}")

    def set_drama_style(self, style: str):
        """Set drama style (Historical_Royal, Historical_Wuxia, Modern_Formal, Modern_Casual, Action_Urgent)."""
        self.current_style = style
        self.context_memory.detected_style = style

    def reset_episode_context(self):
        """Reset context memory and character roster for a new episode."""
        self.context_memory.clear()
        self.character_manager.clear()

    def test_key(self, api_key: str, model_name: str = "gemini-3.5-flash") -> Tuple[bool, str]:
        """Test if a Gemini API key is valid and functional with automatic model fallback."""
        if not api_key or not api_key.strip():
            return False, "API key cannot be empty"
        
        candidates = [model_name, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]
        seen = set()
        models_to_try = [m for m in candidates if m and not (m in seen or seen.add(m))]

        client = genai.Client(api_key=api_key.strip())
        last_error = ""

        for m in models_to_try:
            try:
                response = client.models.generate_content(
                    model=m,
                    contents="Test. Reply with: OK"
                )
                if response and response.text:
                    return True, f"Valid ({m})"
            except Exception as e:
                err_msg = str(e)
                last_error = err_msg
                if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
                    return False, "Rate Limited / Quota Exceeded (429)"
                if "API_KEY_INVALID" in err_msg or "400" in err_msg or "403" in err_msg:
                    return False, "Invalid API Key (Check key on Google AI Studio)"
                continue

        return False, f"Error: {last_error[:90]}"

    def extract_audio_from_video(self, video_path: str, output_audio_path: str) -> bool:
        """Extract compressed mono audio from video file for efficient upload to Gemini."""
        try:
            cmd = [
                "ffmpeg", "-nostdin", "-y",
                "-i", video_path,
                "-vn",
                "-ac", "1",
                "-ar", "16000",
                "-b:a", "48k",
                "-f", "mp3",
                output_audio_path
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
            return res.returncode == 0 and os.path.exists(output_audio_path)
        except Exception as e:
            print(f"[GeminiEngine] Failed to extract audio: {e}")
            return False

    def transcribe_and_translate_khmer(
        self,
        audio_path: str,
        total_duration_ms: Optional[int] = None,
        progress_callback=None
    ) -> List[Dict[str, Any]]:
        """
        Uploads audio to Gemini, transcribes with timestamps, analyzes meaning,
        and translates into natural Khmer voiceover dialogue with Context Memory.
        """
        from pydub import AudioSegment

        # Reset episode context for clean fresh start
        self.reset_episode_context()

        # Auto-detect audio duration if not provided
        if not total_duration_ms or total_duration_ms <= 0:
            try:
                audio_obj = AudioSegment.from_file(audio_path)
                total_duration_ms = len(audio_obj)
            except Exception as e:
                print(f"[GeminiEngine] Warning: Could not detect audio duration: {e}")
                total_duration_ms = 0

        # Chunking handling for audio > 70 seconds (70,000 ms):
        # Slice into chunks strictly between 50 to 70 seconds at natural speech pauses
        if total_duration_ms > 70000:
            return self._transcribe_long_audio_chunked(
                audio_path, total_duration_ms, progress_callback
            )

        single_segs = self._transcribe_single_audio_chunk(
            audio_path, total_duration_ms, offset_ms=0, progress_callback=progress_callback
        )
        return self._validate_and_heal_segments(single_segs, total_duration_ms)

    def _calculate_50_to_70s_slices(self, full_audio: Any, total_duration_ms: int) -> List[Tuple[int, int]]:
        """
        Calculates optimal audio slices strictly between 50 and 70 seconds (as requested by user).
        Finds natural speech pauses / quietest points in the [50s, 70s] window so that
        no spoken sentence is ever cut in half and timestamps remain 100% faithful to the original video.
        """
        if total_duration_ms <= 70000:
            return [(0, total_duration_ms)]

        slices = []
        cur = 0
        while cur < total_duration_ms:
            remaining = total_duration_ms - cur
            # If remaining duration fits in a 70s chunk, take it all
            if remaining <= 70000:
                slices.append((cur, total_duration_ms))
                break

            # Search window is between 50s and 70s from cur
            search_start = cur + 50000
            search_end = min(total_duration_ms, cur + 70000)

            # Default to 60s cut
            best_cut = min(total_duration_ms, cur + 60000)

            if full_audio is not None and len(full_audio) >= search_end:
                try:
                    # Scan for quietest 250ms slot (natural pause between dialogue)
                    window = full_audio[search_start:search_end]
                    min_rms = float('inf')
                    best_offset = 10000  # Default +10s (60s mark)
                    step = 200
                    for offset in range(0, len(window) - 250, step):
                        slot_rms = window[offset:offset + 250].rms
                        if slot_rms < min_rms:
                            min_rms = slot_rms
                            best_offset = offset + 125
                    best_cut = search_start + best_offset
                except Exception as e:
                    print(f"[GeminiEngine] Pause search fallback: {e}")
                    best_cut = cur + 60000

            # Guard against tiny trailing chunk (< 20s)
            if total_duration_ms - best_cut < 20000:
                slices.append((cur, total_duration_ms))
                break

            slices.append((cur, best_cut))
            cur = best_cut

        return slices

    def _transcribe_long_audio_chunked(
        self,
        audio_path: str,
        total_duration_ms: int,
        progress_callback=None
    ) -> List[Dict[str, Any]]:
        """Splits long audio into 50-70s pause-aligned slices and merges transcriptions with context continuity."""
        from pydub import AudioSegment
        import tempfile

        if progress_callback:
            progress_callback(f"វីដេអូវែង ({total_duration_ms/1000:.1f}s): កំពុងបែងចែកជាកង់ចន្លោះ 50-70s តាមចន្លោះស្ងាត់...")

        try:
            full_audio = AudioSegment.from_file(audio_path)
        except Exception as e:
            print(f"[GeminiEngine] Failed to load full audio for chunking: {e}")
            return self._transcribe_single_audio_chunk(audio_path, total_duration_ms, 0, progress_callback)

        slices = self._calculate_50_to_70s_slices(full_audio, total_duration_ms)
        total_chunks = len(slices)
        all_segments: List[Dict[str, Any]] = []

        temp_dir = tempfile.mkdtemp(prefix="gemini_chunks_")

        try:
            for chunk_idx, (cur_start, cur_end) in enumerate(slices, start=1):
                chunk_dur = cur_end - cur_start
                chunk_audio = full_audio[cur_start:cur_end]
                chunk_file = os.path.join(temp_dir, f"chunk_{chunk_idx}.mp3")
                chunk_audio.export(chunk_file, format="mp3")

                if progress_callback:
                    progress_callback(f"Gemini កំពុង transcribe កង់ [{chunk_idx}/{total_chunks}] ({cur_start/1000:.0f}s - {cur_end/1000:.0f}s, ប្រវែង {chunk_dur/1000:.0f}s)...")

                def _chunk_cb(msg):
                    if progress_callback:
                        progress_callback(f"[{chunk_idx}/{total_chunks}] {msg}")

                chunk_segs = self._transcribe_single_audio_chunk(
                    chunk_file, chunk_dur, offset_ms=cur_start, progress_callback=_chunk_cb
                )

                for seg in chunk_segs:
                    all_segments.append(seg)
                    self.context_memory.add_segment(seg)

            # Validate, clamp, and heal full segment list
            final_healed = self._validate_and_heal_segments(all_segments, total_duration_ms)
            self._log_translation_debug("full_episode_chunked", total_duration_ms, "", final_healed)
            return final_healed

        finally:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _transcribe_single_audio_chunk(
        self,
        audio_path: str,
        duration_ms: int,
        offset_ms: int = 0,
        progress_callback=None
    ) -> List[Dict[str, Any]]:
        """Transcribes a single audio slice with context injection and duration constraints."""
        keys = self.config_manager.get_api_keys()
        if not keys:
            fallback_key = self.config_manager.get_active_key()
            if fallback_key:
                keys = [{"key": fallback_key}]
            else:
                raise ValueError("No Gemini API key configured. Please add one in Settings.")

        model_name = self.config_manager.get("gemini_model", "gemini-3.5-flash")

        model_candidates = [
            model_name,
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-2.5-flash",
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite"
        ]
        deprecated_models = {"gemini-1.5-flash"}
        seen_models = set()
        fallback_models = [m for m in model_candidates if m and m not in deprecated_models and not (m in seen_models or seen_models.add(m))]

        max_attempts = max(len(keys), 1)
        last_error = None

        dur_sec = duration_ms / 1000.0 if duration_ms > 0 else 0

        duration_constraint_text = ""
        if duration_ms > 0:
            duration_constraint_text = (
                f"\nCRITICAL DURATION CONSTRAINTS (ហាមរំលង ឬខុសកាលកំណត់):\n"
                f"- The EXACT total duration of this audio slice is {dur_sec:.1f} seconds ({duration_ms} ms).\n"
                f"- ALL timestamps (start_ms and end_ms) MUST be between 0 and {duration_ms} ms.\n"
                f"- NEVER output timestamps greater than {duration_ms} ms!\n"
                f"- Transcribe and translate 100% of all dialogue through to the very end of the audio ({dur_sec:.1f}s). Never stop early or omit dialogue at the end!\n"
            )

        # Context components
        relationship_text = RelationshipEngine.get_relationship_rules_text()
        context_text = self.context_memory.get_prompt_text()
        character_text = self.character_manager.get_prompt_text()
        style_text = DramaStyle.get_style_guidelines(self.current_style)
        glossary_text = self.terminology_dict.get_glossary_prompt_text(self.current_style)

        prompt = (
            "You are an elite Cambodian film & drama dubbing master and translator (អ្នកដឹកនាំបញ្ចេញបញ្ចូលសំឡេងភាពយន្តភាគខ្មែរអាជីព).\n"
            "Carefully listen to this entire audio track and transcribe/translate with extreme cinematic accuracy:\n\n"
            "[រយៈពេលកំណត់ និងបរិបទនៃសាច់រឿង (Duration & Scene Context)]\n"
            f"{duration_constraint_text}\n"
            f"{context_text}\n\n"
            "[ទម្រង់រឿង (Drama Style: រឿងបុរាណរាជវាំង, ក្បាច់គុន, ឬសម័យ)]\n"
            f"{style_text}\n\n"
            "[វចនានុក្រមសព្ទរឿង (Drama Glossary & Royal Terms)]\n"
            f"{glossary_text}\n"
            f"{relationship_text}\n\n"
            "[តារាងឈ្មោះ និងភេទតួអង្គ (Character Profiles & Continuity)]\n"
            f"{character_text}\n\n"
            "RULES FOR KHMER TRANSLATION & VOICEOVER (ភាសាខ្មែរពិតប្រាកដ និងត្រឹមត្រូវតាមក្បួនខ្នាត):\n"
            "1. STORYLINE & CONTEXT COHESION (បកប្រែឱ្យត្រូវនឹងសាច់រឿង):\n"
            "   - Read the dialogue as an unfolding story. Understand the plot, setting, genre, and emotional arc.\n"
            "   - Use appropriate spoken Khmer pronouns and honorifics based on who is speaking to whom:\n"
            "     * Lovers / Couples / Husband-Wife: បង / អូន\n"
            "     * Friends / Peers: ឯង / គ្នា, ខ្ញុំ / ឯង\n"
            "     * Family / Kinship: ម៉ែ, ឪ, កូន, បង, ប្អូន, តា, យាយ, មីង, ពូ\n"
            "     * Formal / Respectful / Strangers: លោក, អ្នក, ខ្ញុំបាទ, នាងខ្ញុំ\n"
            "     * Angry / Confrontational: អញ / ហង, អា / មី\n"
            "   - Avoid stiff, robotic word-for-word translation. Adapt idioms, humor, sarcasm, emotions, and cultural nuances into natural spoken Khmer that sounds authentic and engaging in a dubbed film.\n\n"
            "2. COMPLETE MEANING & NATURAL SPOKEN FLUENCY (បកប្រែឱ្យពេញលេញ និងស្តាប់យល់ន័យច្បាស់):\n"
            "   - Translate every dialogue line fully and completely. Preserve the full meaning, context, humor, and emotion without omitting any important ideas.\n"
            "   - Prioritize clear, natural spoken Khmer (ភាសាខ្មែរនិយាយបែបធម្មជាតិ) that native listeners understand easily and smoothly.\n"
            "   - Do not truncate or over-compress sentences into stiff abbreviations. Complete, authentic conversational meaning is the highest priority.\n\n"
            "3. NATURAL EVERYDAY SPOKEN KHMER (ភាសានិយាយសាមញ្ញ ងាយយល់ ខ្មែរធ្លាប់ឮ ហាមពាក្យចម្លែក):\n"
            "   - Use ONLY natural, familiar words that ordinary Cambodian people actually speak and hear every day on TV drama dubbing!\n"
            "   - NEVER translate foreign idioms word-for-word into nonsense phrases! Translate the REAL, SIMPLE MEANING (烦死了 -> 'រំខានណាស់!', 闭嘴 -> 'បិទមាត់ទៅ!', 给我滚 -> 'ចេញទៅ!', 救命 -> 'ជួយផង!', 别担心 -> 'កុំបារម្ភអី!').\n\n"
            "4. ROYAL & HISTORICAL DRAMA VOCABULARY (ក្បួនរាជសព្ទរឿងបុរាណ):\n"
            "   - Subordinate/Minister addressing King/Prince: Use 'ទូលព្រះបង្គំ' or 'ទូលបង្គំ' (NEVER 'ទូលបង្គាប់' which is incorrect Khmer!).\n"
            "   - Addressing Royal/Superior: Use 'ព្រះករុណា', 'ព្រះអង្គ', 'ម្ចាស់បង', 'ទ្រង់'...\n"
            "   - Consort / Maid / Female subject: 'ខ្ញុំម្ចាស់'\n"
            "   - Royal Response: 'ក្រាបទូល', 'ទទួលរាជបញ្ជា'\n\n"
            "5. PRECISE TIMESTAMPS (ចាប់ពេលឱ្យចំពេលតួអង្គនិយាយ គិតជា Milliseconds):\n"
            "   - Provide EXACT timestamps down to milliseconds matching when vocal sounds are physically produced:\n"
            "     * 'start_time': '00:02.350'\n"
            "     * 'end_time': '00:04.800'\n"
            "     * 'start_ms': 2350, 'end_ms': 4800\n"
            "   - Do NOT guess or round to full seconds. Align tightly with speech.\n\n"
            "6. 100% PURE KHMER CHARACTERS ONLY (អក្សរខ្មែរសុទ្ធ ហាមមានអក្សរបរទេស):\n"
            "   - 'khmer_text' MUST be 100% pure Khmer text (គ្មានអក្សរបរទេស ឬភាសាផ្សេងឡើយ)។\n"
            "   - STRICTLY FORBIDDEN: NEVER include Chinese characters (如: 老九, 大雍, 苏玉玲), Thai letters, or English letters.\n"
            "   - STRICTLY FORBIDDEN: NEVER use bilingual brackets like '老九 (ឡៅជូ)' or '大雍 (តាយ៉ុង)'!\n"
            "   - Transliterate all foreign names directly and exclusively into pure Khmer letters: សរសេរតែ 'ឡៅជូ', 'តាយ៉ុង', 'លូឆឹង', 'ស៊ូយីលីង'...\n\n"
            "7. SPELL OUT ALL NUMBERS (ហាមសរសេរជាលេខ ត្រូវសរសេរជាពាក្យខ្មែរ):\n"
            "   - Always write numbers in Khmer words: 'មួយ', 'ពីរ', 'បី', 'បួន', 'ប្រាំ', 'ដប់', 'ម្ភៃ', 'មួយរយ', 'មួយពាន់'...\n\n"
            "8. SPEAKER GENDER ACCURACY (បែងចែកសម្លេងស្រី ឬ ប្រុស):\n"
            "   - 'speaker' MUST be strictly either 'Female' (ស្រី) or 'Male' (ប្រុស) ដើម្បីជ្រើសរើសសំឡេង Edge TTS ឱ្យត្រូវ។\n"
            "   - Also include 'character_name' in Khmer (ឧ. 'ឡៅជូ', 'ព្រះមហាក្សត្រ', 'មេបក្ស')។\n\n"
            "9. OUTPUT FORMAT: Return ONLY a valid JSON array of objects without markdown commentary.\n\n"
            "[\n"
            "  {\n"
            "    \"id\": 1,\n"
            "    \"start_time\": \"00:01.200\",\n"
            "    \"end_time\": \"00:04.500\",\n"
            "    \"start_ms\": 1200,\n"
            "    \"end_ms\": 4500,\n"
            "    \"speaker\": \"Male\",\n"
            "    \"character_name\": \"ឡៅជូ\",\n"
            "    \"original_text\": \"Original spoken sentence\",\n"
            "    \"khmer_text\": \"ប្រយោគជាភាសាខ្មែរសុទ្ធសាធ ខ្លីខ្លឹម...\",\n"
            "    \"tone\": \"emotional/urgent/calm/respectful\"\n"
            "  }\n"
            "]"
        )

        for attempt in range(max_attempts):
            active_key = self.config_manager.get_active_key()
            if not active_key:
                break

            client = genai.Client(api_key=active_key)

            with open(audio_path, "rb") as f:
                audio_bytes = f.read()

            audio_part = types.Part.from_bytes(
                data=audio_bytes,
                mime_type="audio/mp3"
            )

            for target_model in fallback_models:
                if progress_callback:
                    progress_callback(f"កំពុងវិភាគវីដេអូជាមួយ Gemini ({target_model})...")

                try:
                    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout

                    def _call_gemini():
                        return client.models.generate_content(
                            model=target_model,
                            contents=[audio_part, prompt],
                            config=types.GenerateContentConfig(
                                temperature=0.3,
                                max_output_tokens=8192,
                                response_mime_type="application/json"
                            )
                        )

                    with ThreadPoolExecutor(max_workers=1) as g_exec:
                        g_fut = g_exec.submit(_call_gemini)
                        response = g_fut.result(timeout=45.0)

                    raw_text = response.text or ""
                    segments = self._parse_segments_json(raw_text, duration_ms, offset_ms)
                    if segments:
                        healed_segments = self._validate_and_heal_segments(segments, duration_ms + offset_ms)
                        # Register discovered characters into CharacterProfileManager
                        for s in healed_segments:
                            cname = s.get("character_name")
                            if cname and cname not in ["Unknown", "Speaker"]:
                                self.character_manager.register_or_update(
                                    cname, gender=s.get("speaker", "Male"), role="", speech_style="Formal"
                                )
                        # Log debug trace
                        self._log_translation_debug(
                            f"slice_offset_{offset_ms}", duration_ms, raw_text, healed_segments, model=target_model
                        )
                        return healed_segments
                    else:
                        sys.stderr.write(f"[GeminiEngine] Warning: empty segments returned by {target_model}\n")
                        sys.stderr.flush()
                except Exception as model_err:
                    err_str = str(model_err)
                    last_error = err_str
                    sys.stderr.write(f"[GeminiEngine] Model {target_model} error: {err_str[:120]}\n")
                    sys.stderr.flush()
                    if any(code in err_str for code in ["403", "PERMISSION_DENIED", "API_KEY_INVALID", "denied access"]):
                        self.config_manager.mark_key_banned(active_key, "Banned (403)", err_str[:100])
                        if progress_callback:
                            progress_callback("សោរ API គ្មានសិទ្ធិ (403) កំពុងប្តូរទៅសោរថ្មី...")
                        time.sleep(0.5)
                        break
                    elif any(code in err_str for code in ["429", "RESOURCE_EXHAUSTED", "quota"]):
                        self.config_manager.mark_key_rate_limited(active_key)
                        if progress_callback:
                            progress_callback("សោរ API ជាប់កូតា (429) កំពុងប្តូរទៅសោរថ្មី...")
                        time.sleep(0.5)
                        break
                    elif "timeout" in err_str.lower() or isinstance(model_err, (FutureTimeout, TimeoutError)):
                        sys.stderr.write(f"[GeminiEngine] Model {target_model} timed out after 45s\n")
                        sys.stderr.flush()
                        self.config_manager.rotate_to_next_key()
                        break
                    continue

        raise RuntimeError(f"All Gemini API keys failed. Last error: {last_error}")

    def translate_existing_segments(
        self,
        segments: List[Dict[str, Any]],
        audio_path: Optional[str] = None,
        progress_callback=None
    ) -> List[Dict[str, Any]]:
        """
        Translates a list of pre-defined subtitle segments while STRICTLY preserving
        their original 'id', 'start_ms', 'end_ms', and timing boundaries.
        Guarantees Gemini NEVER mutates or corrupts existing timestamps!
        """
        if not segments:
            return []
        try:

            active_key = self.config_manager.get_active_key()
            if not active_key:
                raise ValueError("No Gemini API key configured.")

            model_name = self.config_manager.get("gemini_model", "gemini-3.5-flash")
            client = genai.Client(api_key=active_key)

            # 1. System Directive ណែនាំ Gemini អំពីការបកប្រែបែបភាពយន្ត និងសាច់រឿង
            system_instruction = (
                "You are an expert cinematic dialogue translator, script adaptor, and professional Khmer voice dubbing director (អ្នកដឹកនាំ និងនិពន្ធសេណារីយ៉ូបញ្ចូលសំឡេងភាពយន្តអាជីព)។\n\n"
                "CORE OBJECTIVE:\n"
                "Translate the transcribed dialogue into authentic, natural spoken colloquial Khmer specifically crafted for professional voice dubbing (ភាសាខ្មែរនិយាយបញ្ចូលសំឡេងបែបធម្មជាតិ ១០០% មិនមែនពាក្យអានសៀវភៅ) matching the storyline, context, character relationships, and screen timing.\n\n"
                "CRITICAL DIRECTIVES:\n"
                "1. NATURAL SPOKEN COLLOQUIAL KHMER VS. STIFF BOOK TRANSLATION (ភាសាខ្មែរនិយាយបែបធម្មជាតិ ហាមបកប្រែដូចអានសៀវភៅ):\n"
                "   - STRICTLY FORBIDDEN: Never translate into stiff book-like phrases such as 'តើអ្នកកំពុងធ្វើអ្វី?', 'ខ្ញុំមិនដឹងអំពីរឿងនេះទេ', 'តើពិតមែនទេ?', 'តើអ្នកចង់បានអ្វី?'!\n"
                "   - ALWAYS ADAPT INTO NATURAL SPOKEN KHMER:\n"
                "     * Contractions: In modern colloquial speech, use 'អត់...ទេ' instead of stiff 'មិន...ទេ' (e.g. 'អត់ដឹងទេ', 'អត់ចង់ទៅទេ', 'អត់ទាន់ទេ', 'អត់យល់ទេ', 'អត់មានរឿងអីទេ')។\n"
                "     * Colloquial Question Patterns:\n"
                "       - 'តើអ្នកកំពុងធ្វើអ្វី?' -> 'ឯងកំពុងធ្វើស្អីហ្នឹង?' ឬ 'កំពុងធ្វើអីហ្នឹង?'\n"
                "       - 'តើអ្នកចង់បានអ្វី?' -> 'ចង់បានអីដែរ?' ឬ 'ឯងចង់បានអី?'\n"
                "       - 'តើអ្នកនៅឯណា?' -> 'ឯងនៅឯណា?' ឬ 'នៅឯណា?'\n"
                "       - 'តើមានរឿងអ្វីកើតឡើង?' -> 'មានរឿងអីកើតឡើងហ្នឹង?'\n"
                "       - 'តើពិតមែនទេ?' -> 'ពិតមែនហ្អេស?' ឬ 'មែនហ្ហ៎?'\n"
                "       - 'តើហេតុអ្វី?' -> 'ហេតុអី?', 'ម៉េចក៏ចឹង?', 'ម៉េចបានជាចឹង?'\n"
                "     * Emotional Fillers & Conversational Endings:\n"
                "       - Seamlessly integrate natural Khmer particles for dramatic effect: 'ហ្នឹង', 'ណា', 'ហ្អា៎', 'ហា៎?', 'អ្ហ៎!', 'ចុះ', 'ដែរ', 'ឯណាទៅ', 'ទៅ', 'ម៉េចចឹង!'\n"
                "       - Interjections for reactions: 'ចុម!', 'យី!', 'អីយ៉ា!', 'ងាប់ហើយ!', 'ព្រះអើយ!', 'ហ៊ឹម!'\n"
                "     * Dialogue Timing & Rhythm:\n"
                "       - Keep sentences punchy, natural, and rhythmic for lip-sync and voice delivery.\n\n"
                "2. STORYLINE & CONTEXT COHESION (បកប្រែឱ្យត្រូវនឹងសាច់រឿង):\n"
                "   - Read the dialogue as an unfolding story. Understand the plot, setting, genre, and emotional arc.\n"
                "   - Use appropriate spoken Khmer pronouns and honorifics based on who is speaking to whom:\n"
                "     * Lovers / Couples / Husband-Wife: បង / អូន\n"
                "     * Friends / Peers: ឯង / គ្នា, ខ្ញុំ / ឯង\n"
                "     * Family / Kinship: ម៉ែ, ឪ, កូន, បង, ប្អូន, តា, យាយ, មីង, ពូ\n"
                "     * Formal / Respectful / Strangers: លោក, អ្នក, ខ្ញុំបាទ, នាងខ្ញុំ\n"
                "     * Angry / Confrontational: អញ / ហង, អា / មី\n"
                "   - Dynamic Emotion Shift: If lovers or husband/wife enter a bitter quarrel or betrayal scene, smoothly transition from 'បង/អូន' to 'លោក/ខ្ញុំ' or 'ឯង/យើង' matching their rage or heartbreak!\n\n"
                "3. SPEAKER GENDER CLASSIFICATION:\n"
                "   - Determine the overall primary voice gender: 'male' or 'female'.\n"
                "   - For each dialogue item, classify the speaker voice as 'male' or 'female'.\n\n"
                "4. 100% PURE KHMER CHARACTERS ONLY (អក្សរខ្មែរសុទ្ធ ហាមមានអក្សរបរទេស):\n"
                "   - 'khmer_text' MUST be 100% pure Khmer text. Never include Chinese characters, Thai letters, or English letters. Transliterate all names into Khmer script only.\n"
                "   - Spell out all numbers in Khmer words ('មួយ', 'ពីរ', 'បី'...). \n\n"
                "5. OUTPUT FORMAT (Strict JSON object):\n"
                "{\n"
                "  \"detected_voice\": \"male\" or \"female\",\n"
                "  \"items\": [\n"
                "    {\"id\": 0, \"khmer_text\": \"ឃ្លានិយាយខ្មែរ\", \"voice\": \"male\" or \"female\"}\n"
                "  ]\n"
                "}"
            )

            # 2. បែងចែកជាកង់ៗ (Chunk 35 Segments) ដើម្បីរក្សា Context បានល្អ និងមិនកាត់ផ្ដាច់
            CHUNK_SIZE = 35
            total_segments = len(segments)
            chunk_indices = list(range(0, total_segments, CHUNK_SIZE))
            total_chunks = len(chunk_indices)
            trans_map = {}
            overall_detected_voice = "male"

            for chunk_num, start_idx in enumerate(chunk_indices):
                end_idx = min(start_idx + CHUNK_SIZE, total_segments)
                chunk_slice = segments[start_idx:end_idx]
                dialogue_items = [
                    {
                        "id": seg.get("id", start_idx + i + 1),
                        "text": seg.get("original_text") or seg.get("khmer_text", ""),
                        "duration_sec": round(max(0.3, (seg.get("end_ms", 0) - seg.get("start_ms", 0)) / 1000.0), 2)
                    }
                    for i, seg in enumerate(chunk_slice)
                ]

                prompt = (
                    f"Scene Dialogue Transcript (Part {chunk_num + 1}/{total_chunks}, Source Language: auto):\n"
                    f"{json.dumps(dialogue_items, ensure_ascii=False, indent=2)}\n\n"
                    "TRANSLATION INSTRUCTIONS:\n"
                    "1. Read the dialogue sequence to understand the storyline, scene setting, and character relationships.\n"
                    "2. Translate each dialogue line into natural spoken Khmer for voice dubbing matching the story context (ត្រូវនឹងសាច់រឿង) and proper character pronouns (បង/អូន, ឯង/គ្នា, លោក/អ្នក, etc.).\n"
                    "3. Ensure the translation is complete, expressive, and fully understandable (ការបកប្រែពេញលេញ និងស្ដាប់អត្ថន័យយល់ច្បាស់) without omitting key ideas.\n"
                    "4. Return strict JSON with 'detected_voice' and translated 'items' preserving each line's exact 'id'."
                )

                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            temperature=0.3,
                            response_mime_type="application/json"
                        )
                    )
                    raw_text = response.text or ""
                    parsed = json.loads(raw_text)
                    items_list = []
                    if isinstance(parsed, dict):
                        if parsed.get("detected_voice"):
                            overall_detected_voice = str(parsed["detected_voice"]).lower()
                        items_list = parsed.get("items") or []
                    elif isinstance(parsed, list):
                        items_list = parsed

                    for item in items_list:
                        if isinstance(item, dict) and "id" in item:
                            trans_map[item["id"]] = item
                except Exception as chunk_err:
                    print(f"[GeminiEngine] Error in translate chunk {chunk_num + 1}: {chunk_err}")

            # Recombine with original timestamps to guarantee 100% timestamp immunity
            result = []
            for orig in segments:
                oid = orig.get("id")
                t_item = trans_map.get(oid, {})
                k_text = t_item.get("khmer_text") or orig.get("khmer_text") or orig.get("original_text", "")
                k_text = self.terminology_dict.apply_post_translation_corrections(clean_khmer_text(k_text))

                v_gender = t_item.get("voice") or t_item.get("speaker") or orig.get("speaker") or overall_detected_voice
                is_female_k = any(m in k_text for m in ["ចា៎", "ចាស", "នាងខ្ញុំ", "ខ្ញុំម្ចាស់", "កូនស្រី", "អ្នកនាង", "កញ្ញា", "ព្រះនាង", "ម្ចាស់ក្សត្រី", "មាតា", "ម៉ាក់", "ម៉ែ", "យាយ", "មីង", "បងស្រី", "អូនស្រី", "ភរិយា", "ប្រពន្ធ", "តួស្រី"])
                is_female_orig = any(m in str(orig.get("original_text", "")).lower() for m in ["姑娘", "小姐", "姐姐", "妹妹", "妈妈", "夫人", "王妃", "皇后", "娘娘", "公主", "丫鬟", "女", "她", "臣妾", "奴婢"])
                is_female_speaker = "fem" in str(v_gender).lower() or "ស្រី" in str(v_gender)
                is_male_k = any(m in k_text for m in ["បាទ", "ខ្ញុំបាទ", "កូនប្រុស", "លោកម្ចាស់", "ឯកឧត្តម", "ស្ដេច", "ព្រះរាជា", "បិតា", "លោកពុក", "ពុក", "លោកតា", "ពូ", "ចៅហ្វាយ", "ស្វាមី", "ប្តី", "កម្លោះ", "តួប្រុស"])

                resolved_speaker = "Female" if ((is_female_k or is_female_orig or is_female_speaker) and not is_male_k) else "Male"

                result.append({
                    "id": oid,
                    "seg_index": orig.get("seg_index", oid - 1 if isinstance(oid, int) else 0),
                    "start_ms": orig.get("start_ms", 0),
                    "end_ms": orig.get("end_ms", 2000),
                    "start_time": orig.get("start_time", self._format_ms_to_time(orig.get("start_ms", 0))),
                    "end_time": orig.get("end_time", self._format_ms_to_time(orig.get("end_ms", 2000))),
                    "duration_ms": max(500, orig.get("end_ms", 2000) - orig.get("start_ms", 0)),
                    "speaker": resolved_speaker,
                    "character_name": t_item.get("character_name") or ("តួស្រី" if resolved_speaker == "Female" else "តួប្រុស"),
                    "original_text": orig.get("original_text", ""),
                    "khmer_text": k_text,
                    "tone": t_item.get("tone") or orig.get("tone", "conversational"),
                    "style": self.current_style
                })

            self._log_translation_debug("translate_existing_segments", 0, "", result)
            return result
        except Exception as e:
            print(f"[GeminiEngine] Error in translate_existing_segments: {e}")
            return segments

    def _parse_segments_json(self, raw_text: str, total_duration_ms: int = 0, offset_ms: int = 0) -> List[Dict[str, Any]]:
        """Cleans, parses, clamps and validates JSON array from model output."""
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"```$", "", cleaned)
            cleaned = cleaned.strip()

        start_idx = cleaned.find("[")
        end_idx = cleaned.rfind("]")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            cleaned = cleaned[start_idx:end_idx+1]

        try:
            data = json.loads(cleaned)
            if isinstance(data, list):
                valid_segments = []
                for s in data:
                    if not isinstance(s, dict):
                        continue

                    # Prioritize exact start_time / end_time string from Gemini if provided
                    start_time_str = s.get("start_time")
                    start_ms = s.get("start_ms")
                    if start_time_str:
                        parsed_s = self._time_to_ms(str(start_time_str))
                        if parsed_s > 0 or start_ms is None:
                            start_ms = parsed_s

                    end_time_str = s.get("end_time")
                    end_ms = s.get("end_ms")
                    if end_time_str:
                        parsed_e = self._time_to_ms(str(end_time_str))
                        if parsed_e > 0 or end_ms is None:
                            end_ms = parsed_e

                    if start_ms is not None:
                        start_ms = max(0, int(start_ms))
                        if end_ms is None or int(end_ms) <= start_ms:
                            end_ms = start_ms + 2000
                        else:
                            end_ms = int(end_ms)

                        # Apply chunk offset
                        start_ms += offset_ms
                        end_ms += offset_ms

                        raw_khmer = s.get("khmer_text", "").strip()
                        if not raw_khmer:
                            raw_khmer = s.get("original_text", "").strip()

                        if raw_khmer:
                            # Apply Terminology & Khmer sanitizer
                            khmer_text = clean_khmer_text(raw_khmer)
                            khmer_text = self.terminology_dict.apply_post_translation_corrections(khmer_text)
                            if not khmer_text:
                                khmer_text = raw_khmer

                            # Speaker gender normalization
                            raw_spk = str(s.get("speaker", "Male")).strip().lower()
                            if any(w in raw_spk for w in ["female", "woman", "girl", "ស្រី", "queen", "lady", "princess", "madam", "wife", "mother"]):
                                speaker = "Female"
                            else:
                                speaker = "Male"

                            char_name = s.get("character_name", "").strip()

                            valid_segments.append({
                                "start_ms": start_ms,
                                "end_ms": end_ms,
                                "speaker": speaker,
                                "character_name": char_name,
                                "original_text": s.get("original_text", ""),
                                "khmer_text": khmer_text,
                                "tone": s.get("tone", "conversational")
                            })

                valid_segments.sort(key=lambda x: x["start_ms"])
                return valid_segments
        except Exception as e:
            print(f"[GeminiEngine] Error parsing JSON: {e}\nRaw: {raw_text[:500]}")
        return []

    def _validate_and_heal_segments(
        self,
        segments: List[Dict[str, Any]],
        max_duration_ms: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Validates, deduplicates, bounds-checks, and heals segments into a deterministic,
        stable JSON structure ready for subtitle editors and audio synthesis.
        """
        if not segments:
            return []

        # 1. Sort strictly by start_ms
        segments.sort(key=lambda x: x.get("start_ms", 0))

        healed = []
        last_text = ""
        repeat_count = 0

        for i, seg in enumerate(segments):
            start_ms = max(0, int(seg.get("start_ms", 0)))
            end_ms = max(start_ms + 800, int(seg.get("end_ms", start_ms + 2000)))

            khmer_text = seg.get("khmer_text", "").strip()
            if not khmer_text:
                continue

            # Prune LLM hallucination loops only if identical text repeats 4+ times in under 3 seconds
            if khmer_text == last_text and healed and (start_ms - healed[-1]["start_ms"] < 3000):
                repeat_count += 1
                if repeat_count >= 3:
                    continue
            else:
                last_text = khmer_text
                repeat_count = 0

            # Clamp to max_duration if provided
            if max_duration_ms > 0:
                if start_ms >= max_duration_ms:
                    # Re-anchor into the end of video so dialogue is not dropped
                    start_ms = max(0, max_duration_ms - (end_ms - start_ms) - 50)
                    end_ms = max_duration_ms
                else:
                    end_ms = min(end_ms, max_duration_ms)

            # Prevent awkward overlaps with previous segment
            # STRICT RULE: Adjust previous segment end_ms. NEVER push current start_ms
            # into the future, so that speech starts EXACTLY when the character speaks on screen!
            if healed:
                prev = healed[-1]
                if start_ms < prev["end_ms"]:
                    if start_ms > prev["start_ms"] + 300:
                        prev["end_ms"] = start_ms - 20
                        prev["duration_ms"] = max(300, prev["end_ms"] - prev["start_ms"])
                        prev["end_time"] = self._format_ms_to_time(prev["end_ms"])

            seg_id = len(healed) + 1
            dur_ms = max(500, end_ms - start_ms)

            healed.append({
                "id": seg_id,
                "seg_index": seg_id - 1,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "start_time": self._format_ms_to_time(start_ms),
                "end_time": self._format_ms_to_time(end_ms),
                "duration_ms": dur_ms,
                "speaker": seg.get("speaker", "Male"),
                "character_name": seg.get("character_name", ""),
                "original_text": seg.get("original_text", ""),
                "khmer_text": khmer_text,
                "tone": seg.get("tone", "conversational"),
                "style": self.current_style
            })

        return healed

    def _log_translation_debug(
        self,
        label: str,
        duration_ms: int,
        raw_response: str,
        final_segments: List[Dict[str, Any]],
        model: str = ""
    ):
        """Logs raw LLM responses and final validated segments for debugging."""
        try:
            self._ensure_logs_dir()
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # 1. Append summary to debug log
            log_file = os.path.join(LOGS_DIR, "translation_debug.log")
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(f"\n{'='*60}\n")
                f.write(f"[{ts}] Label: {label} | Model: {model} | Duration: {duration_ms}ms | Segments: {len(final_segments)}\n")
                f.write(f"Drama Style: {self.current_style}\n")
                if final_segments:
                    f.write(f"First Segment: [{final_segments[0].get('start_time')}] {final_segments[0].get('khmer_text')}\n")
                    f.write(f"Last Segment : [{final_segments[-1].get('end_time')}] {final_segments[-1].get('khmer_text')}\n")
                f.write(f"{'='*60}\n")

            # 2. Write last raw response if present
            if raw_response:
                raw_file = os.path.join(LOGS_DIR, "last_raw_response.txt")
                with open(raw_file, "w", encoding="utf-8") as f:
                    f.write(raw_response)

            # 3. Write last final translation as stable JSON
            json_file = os.path.join(LOGS_DIR, "last_translation.json")
            with open(json_file, "w", encoding="utf-8") as f:
                json.dump(final_segments, f, ensure_ascii=False, indent=2)

        except Exception as e:
            print(f"[GeminiEngine] Debug log error: {e}")

    @staticmethod
    def _format_ms_to_time(ms: int) -> str:
        """Formats milliseconds into standard subtitle time string HH:MM:SS.mmm."""
        if ms < 0:
            ms = 0
        total_sec = ms // 1000
        rem_ms = ms % 1000
        hrs = total_sec // 3600
        mins = (total_sec % 3600) // 60
        secs = total_sec % 60
        return f"{hrs:02d}:{mins:02d}:{secs:02d}.{rem_ms:03d}"

    @staticmethod
    def _time_to_ms(timestr: str) -> int:
        """Convert HH:MM:SS.mmm or MM:SS to ms."""
        try:
            parts = timestr.replace(",", ".").split(":")
            if len(parts) == 3:
                h = float(parts[0])
                m = float(parts[1])
                s = float(parts[2])
                return int((h * 3600 + m * 60 + s) * 1000)
            elif len(parts) == 2:
                m = float(parts[0])
                s = float(parts[1])
                return int((m * 60 + s) * 1000)
            else:
                return int(float(parts[0]) * 1000)
        except Exception:
            return 0
