import re
from typing import Dict

# Digit mappings
DIGITS_MAP: Dict[str, str] = {
    '0': 'សូន្យ', '1': 'មួយ', '2': 'ពីរ', '3': 'បី', '4': 'បួន',
    '5': 'ប្រាំ', '6': 'ប្រាំមួយ', '7': 'ប្រាំពីរ', '8': 'ប្រាំបី', '9': 'ប្រាំបួន',
    '០': 'សូន្យ', '១': 'មួយ', '២': 'ពីរ', '៣': 'បី', '៤': 'បួន',
    '៥': 'ប្រាំ', '៦': 'ប្រាំមួយ', '៧': 'ប្រាំពីរ', '៨': 'ប្រាំបី', '៩': 'ប្រាំបួន'
}

TENS_MAP: Dict[int, str] = {
    1: 'ដប់', 2: 'ម្ភៃ', 3: 'សាមសិប', 4: 'សែសិប',
    5: 'ហាសិប', 6: 'ហុកសិប', 7: 'ចិតសិប', 8: 'ប៉ែតសិប', 9: 'កៅសិប'
}

def number_to_khmer_words(num_str: str) -> str:
    """Converts a sequence of digits (1-4 digits) to natural Khmer words."""
    khmer_to_ar = str.maketrans('០១២៣៤៥៦៧៨៩', '0123456789')
    clean_num = num_str.translate(khmer_to_ar)
    
    try:
        val = int(clean_num)
    except ValueError:
        return num_str

    if val == 0:
        return 'សូន្យ'
    if val < 10:
        return DIGITS_MAP[clean_num]
    if val < 100:
        ten = val // 10
        unit = val % 10
        ten_str = TENS_MAP.get(ten, '')
        if unit == 0:
            return ten_str
        elif unit == 1 and ten > 1:
            return f"{ten_str}មួយ"
        else:
            return f"{ten_str}{DIGITS_MAP[str(unit)]}"
    if val < 1000:
        hundred = val // 100
        rem = val % 100
        h_str = f"{DIGITS_MAP[str(hundred)]}រយ"
        if rem == 0:
            return h_str
        return f"{h_str}{number_to_khmer_words(str(rem))}"
    if val < 10000:
        thousand = val // 1000
        rem = val % 1000
        t_str = f"{DIGITS_MAP[str(thousand)]}ពាន់"
        if rem == 0:
            return t_str
        return f"{t_str}{number_to_khmer_words(str(rem))}"
    
    # For longer numbers, read digit by digit
    return "".join(DIGITS_MAP.get(d, d) for d in clean_num)

def clean_khmer_text(text: str) -> str:
    """
    Cleans and normalizes Khmer text for perfect Edge TTS pronunciation
    and crisp subtitle display:
    1. Corrects common mistranslations and awkward phrasing in dubbing
    2. Converts all numeric digits to spelled-out Khmer words
    3. Normalizes Unicode vowel combinations
    4. Strips problematic punctuation that causes TTS to stumble
    """
    if not text:
        return ""

    # 1. Extract Khmer transliteration from bilingual annotations: e.g. 老九 (ឡៅជូ) -> ឡៅជូ, 大雍 (តាយ៉ុង) -> តាយ៉ុង
    text = re.sub(r'[\u4e00-\u9fff\u3400-\u4dbfA-Za-z0-9_\s]+\s*[\(（]\s*([^\)）]+)[\)）]', r'\1', text)

    # 2. Transliterate common Chinese Pinyin names, places, and English titles into authentic Khmer script
    pinyin_mappings = [
        (r'\bQingyue\b', 'ឈីងយៀក'), (r'\bQing\s*yue\b', 'ឈីងយៀក'),
        (r'\bQingxue\b', 'ឈីងស្វៀ'), (r'\bQing\s*xue\b', 'ឈីងស្វៀ'),
        (r'\bYueqing\b', 'យៀកឈីង'), (r'\bYue\s*qing\b', 'យៀកឈីង'),
        (r'\bLintian\b', 'លីនធាន'), (r'\bLin\s*tian\b', 'លីនធាន'),
        (r'\bXiaoyan\b', 'ស៊ាវយ៉ាន'), (r'\bXiao\s*yan\b', 'ស៊ាវយ៉ាន'),
        (r'\bYechen\b', 'យេឆឹង'), (r'\bYe\s*chen\b', 'យេឆឹង'),
        (r'\bLuchen\b', 'លូឆឹង'), (r'\bLu\s*chen\b', 'លូឆឹង'),
        (r'\bSuyuling\b', 'ស៊ូយីលីង'), (r'\bSu\s*yuling\b', 'ស៊ូយីលីង'),
        (r'\bGunan\b', 'គូណាន'), (r'\bGu\s*nan\b', 'គូណាន'),
        (r'\bHaoran\b', 'ហាវរ៉ាន'), (r'\bMeiling\b', 'ម៉ីលីង'),
        (r'\bZhiyuan\b', 'ជីយាន'), (r'\bXiaolong\b', 'ស៊ាវឡុង'),
        (r'\bQing\b', 'ឈីង'), (r'\bYue\b', 'យៀក'), (r'\bLin\b', 'លីន'),
        (r'\bXiao\b', 'ស៊ាវ'), (r'\bChen\b', 'ឆឹង'), (r'\bYe\b', 'យេ'),
        (r'\bSu\b', 'ស៊ូ'), (r'\bLu\b', 'លូ'), (r'\bGu\b', 'គូ'),
        (r'\bNan\b', 'ណាន'), (r'\bTian\b', 'ធាន'), (r'\bYan\b', 'យ៉ាន'),
        (r'\bFeng\b', 'ហ្វុង'), (r'\bWang\b', 'វ៉ាង'), (r'\bLi\b', 'លី'),
        (r'\bZhang\b', 'ចាង'), (r'\bLiu\b', 'លីវ'), (r'\bYang\b', 'យ៉ាង'),
        (r'\bHuang\b', 'ហ័ង'), (r'\bWu\b', 'វូ'), (r'\bZhao\b', 'ចាវ'),
        (r'\bZhou\b', 'ចូវ'), (r'\bXu\b', 'ស៊ូ'), (r'\bSun\b', 'ស៊ុន'),
        (r'\bMa\b', 'ម៉ា'), (r'\bZhu\b', 'ជូ'), (r'\bHu\b', 'ហ៊ូ'),
        (r'\bGuo\b', 'គួ'), (r'\bHe\b', 'ហេ'), (r'\bGao\b', 'កៅ'),
        (r'\bLuo\b', 'លួ'), (r'\bZheng\b', 'ចឹង'), (r'\bLiang\b', 'លៀង'),
        (r'\bXie\b', 'សៀ'), (r'\bSong\b', 'សុង'), (r'\bTang\b', 'ថាង'),
        (r'\bHan\b', 'ហាន'), (r'\bDong\b', 'តុង'), (r'\bJiang\b', 'ជាំង'),
        (r'\bBai\b', 'ប៉ាយ'), (r'\bFan\b', 'ហ្វាន'), (r'\bJin\b', 'ជីន'),
        (r'\bPeng\b', 'ផេង'), (r'\bYu\b', 'យូ'), (r'\bWen\b', 'វ៉ិន'),
        (r'\bLong\b', 'ឡុង'), (r'\bMing\b', 'មីង'), (r'\bNing\b', 'នីង'),
        (r'\bPing\b', 'ពីង'), (r'\bHao\b', 'ហាវ'), (r'\bRan\b', 'រ៉ាន'),
        (r'\bMei\b', 'ម៉ី'), (r'\bLing\b', 'លីង'), (r'\bZhi\b', 'ជី'),
        (r'\bYuan\b', 'យាន'), (r'\bCEO\b', 'អគ្គនាយក'), (r'\bBoss\b', 'ថៅកែ'),
        (r'\bMr\b\.?', 'លោក'), (r'\bMrs\b\.?', 'លោកស្រី'), (r'\bMiss\b\.?', 'កញ្ញា')
    ]
    for pattern, khmer_w in pinyin_mappings:
        text = re.sub(pattern, khmer_w, text, flags=re.IGNORECASE)

    # 3. Strip all Chinese / CJK, Japanese, Korean, Thai, Lao, Burmese scripts
    text = re.sub(r'[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uac00-\ud7af\u0e00-\u0e7f\u0e80-\u0eff\u1000-\u109f]', '', text)

    # 4. Strip any remaining Latin / English letters (Guarantees 100% PURE Khmer)
    text = re.sub(r'[a-zA-Z]+', '', text)

    # 4. Remove brackets and parentheses
    text = re.sub(r'[\(\)（）\[\]【】{}《》「」『』]', ' ', text)

    # 5. Correct common mistranslations & broken Thai transliterations:
    # 'រំាខាញ', 'រំខាញ', 'រំាគាញ', 'រំគាញ' are broken Thai transliterations (รำคาญ). Pure Khmer is 'រំខាន'
    text = re.sub(r'រំ[ាាំ]?[ខគ]ា?[ញន]', 'រំខាន', text)
    # 'ទូលបង្គាប់' is wrong Khmer. Correct is 'ទូលព្រះបង្គំ' or 'ទូលបង្គំ'
    text = re.sub(r'ទូលបង្គាប់', 'ទូលព្រះបង្គំ', text)
    # Fix broken vowel combinations
    text = re.sub(r'យុី', 'យី', text)
    text = re.sub(r'អុី', 'អ៊ី', text)
    text = re.sub(r'ហុី', 'ហ៊ី', text)
    text = re.sub(r'លុី', 'លី', text)
    # Normalize 'រំា' before any Khmer consonant to 'រំ'
    text = re.sub(r'រំ[ាាំ](?=[\u1780-\u17a2])', 'រំ', text)

    # Normalize Khmer Unicode characters order
    # Correct NIKAHIT + SRA AA: ំា (\u17c6\u17b6) -> ាំ (\u17b6\u17c6)
    text = re.sub(r'\u17c6\u17b6', '\u17b6\u17c6', text)
    # Duplicate COENG: ្្ -> ្
    text = re.sub(r'\u17d2+', '\u17d2', text)

    # 6. Convert Ordinals: ទី1, ទី2, ទី១, ទី២ -> ទីមួយ, ទីពីរ...
    def replace_ordinal(m):
        prefix = m.group(1)
        num = m.group(2)
        return f"{prefix}{number_to_khmer_words(num)}"
    text = re.sub(r'(ទី)([0-9០-៩]+)', replace_ordinal, text)

    # 7. Convert numbers to words (e.g. 5 នាក់ -> ប្រាំ នាក់, 100 -> មួយរយ)
    def replace_numbers(m):
        num = m.group(0)
        return number_to_khmer_words(num)
    text = re.sub(r'[0-9០-៩]+', replace_numbers, text)

    # 7.5. Adapt stiff written phrasing into natural spoken colloquial Khmer dubbing
    spoken_adaptations = [
        (r'តើ\s*អ្នក\s*កំពុង\s*(?:ធ្វើ)?អ្វី(?:\s*នៅទីនេះ)?', 'ឯងកំពុងធ្វើស្អីហ្នឹង?'),
        (r'តើ\s*ឯង\s*កំពុង\s*(?:ធ្វើ)?អ្វី(?:\s*នៅទីនេះ)?', 'ឯងកំពុងធ្វើស្អីហ្នឹង?'),
        (r'តើ\s*អ្នក\s*ចង់(?:បាន)?\s*អ្វី', 'ចង់បានអីដែរ?'),
        (r'តើ\s*ឯង\s*ចង់(?:បាន)?\s*អ្វី', 'ឯងចង់បានអី?'),
        (r'តើ\s*អ្នក\s*នៅឯណា', 'ឯងនៅឯណា?'),
        (r'តើ\s*ឯង\s*នៅឯណា', 'ឯងនៅឯណា?'),
        (r'តើ\s*មានរឿងអ្វី\s*កើតឡើង', 'មានរឿងអីកើតឡើងហ្នឹង?'),
        (r'តើ\s*ពិតមែនទេ', 'ពិតមែនហ្អេស?'),
        (r'តើ\s*ត្រូវធ្វើ\s*(?:យ៉ាង)?ម៉េច', 'ត្រូវធ្វើម៉េចទៅ?'),
        (r'តើ\s*ហេតុអ្វី(?:\s*បានជា)?', 'ហេតុអីបានជា'),
        (r'តើ\s*អ្នក\s*សុខសប្បាយជាទេ', 'សុខសប្បាយជាទេ?'),
        (r'តើ\s*អ្នកណា(?:\s*គេ)?', 'អ្នកណាគេ'),
        (r'^តើ\s*', ''),
        (r'([.!?។]\s*)តើ\s*', r'\1'),
        (r'មិនដឹងទេ', 'អត់ដឹងទេ'),
        (r'មិនដឹង', 'អត់ដឹង'),
        (r'មិនចង់ទេ', 'អត់ចង់ទេ'),
        (r'មិនចង់', 'អត់ចង់'),
        (r'មិនទៅទេ', 'អត់ទៅទេ'),
        (r'មិនទៅ', 'អត់ទៅ'),
        (r'មិនអាចទេ', 'អត់បានទេ'),
        (r'មិនទាន់ទេ', 'អត់ទាន់ទេ'),
        (r'មិនទាន់', 'អត់ទាន់'),
        (r'មិនយល់ទេ', 'អត់យល់ទេ'),
        (r'មិនយល់', 'អត់យល់'),
        (r'មិនមែនទេ', 'អត់មែនទេ'),
        (r'មិនមានទេ', 'អត់មានទេ'),
        (r'មិនអីទេ', 'អត់អីទេ'),
        (r'ធ្វើអ្វី', 'ធ្វើអី'),
        (r'រឿងអ្វី', 'រឿងអី'),
    ]
    for pattern, replacement in spoken_adaptations:
        text = re.sub(pattern, replacement, text)

    # 8. Clean symbols and punctuation that confuse Edge-TTS
    # Remove quotes, asterisks, math symbols, tildes, slashes
    text = re.sub(r'["\'`~@#$%^&*_+=\<\>\|\\]', ' ', text)
    text = re.sub(r'[-–—/]', ' ', text)
    
    # Normalize multiple spaces
    text = re.sub(r'\s+', ' ', text).strip()

    return text

def wrap_khmer_subtitle(text: str, max_chars: int = 22, newline: str = r"\N") -> str:
    """
    Wraps Khmer subtitle text downward when exceeding max_chars,
    ensuring subtitles never stretch beyond the video frame margins.
    Uses Khmer orthographic cluster boundaries to never break subscript consonants (Coeng)
    or vowels, even if the text has no spaces.
    """
    if not text:
        return ""

    raw_lines = re.split(r'\r\n|\n|\\N', str(text))
    wrapped_lines = []
    cluster_regex = re.compile(r'[\u1780-\u17B3](?:\u17D2[\u1780-\u17A2]|[\u17B6-\u17D3\u17DD])*|[^\u1780-\u17D3\u17DD]+')

    for raw_line in raw_lines:
        line_str = raw_line.strip()
        if not line_str:
            continue

        if len(line_str) <= max_chars:
            wrapped_lines.append(line_str)
            continue

        # If line contains spaces, split by spaces first
        tokens = [t for t in line_str.split(' ') if t] if ' ' in line_str else [line_str]

        atomic_units = []
        for token in tokens:
            if len(token) <= max_chars:
                atomic_units.append(token)
            else:
                clusters = cluster_regex.findall(token) or [token]
                current_chunk = ""
                for cl in clusters:
                    if len(current_chunk) + len(cl) > max_chars:
                        if current_chunk:
                            atomic_units.append(current_chunk)
                        current_chunk = cl
                    else:
                        current_chunk += cl
                if current_chunk:
                    atomic_units.append(current_chunk)

        cur_line = ""
        for unit in atomic_units:
            sep = " " if cur_line and ' ' in line_str else ""
            if cur_line and (len(cur_line) + len(sep) + len(unit) > max_chars):
                wrapped_lines.append(cur_line)
                cur_line = unit
            else:
                cur_line = f"{cur_line}{sep}{unit}" if cur_line else unit

        if cur_line:
            wrapped_lines.append(cur_line)

    return newline.join(wrapped_lines)

KHMER_GRAMMAR_MARKERS = [
    'ដើម្បី', 'ពីព្រោះ', 'ព្រោះ', 'ប៉ុន្តែ', 'ដូច្នេះ', 'ហើយ', 'ដែល', 'នៅពេល',
    'ប្រសិនបើ', 'ដូចជា', 'ជាច្រើន', 'គ្មាន', 'កំពុង', 'ជាមួយ', 'ដោយ', 'ទៅកាន់',
    'ប្រាប់', 'បាន', 'នឹង', 'ក្នុង', 'លើ', 'ក្រោយ', 'មុន', 'ថា', 'សូម', 'គឺជា'
]
_KHMER_MARKER_PATTERN = '|'.join(re.escape(m) for m in KHMER_GRAMMAR_MARKERS)
_KHMER_CLUSTER_REGEX = re.compile(r'[\u1780-\u17B3](?:\u17D2[\u1780-\u17A2]|[\u17B6-\u17D3\u17DD])*|[^\u1780-\u17D3\u17DD]+')

def split_khmer_into_single_lines(text: str, max_chars: int = 34):
    """
    Splits long Khmer subtitle text into sleek, single-line chunks.
    Ensures subtitles are displayed one line at a time (ដូច manual dubbing),
    respecting sentence boundaries (។, !, ?, …), spaces, and grammatical clause markers.
    Never breaks subscript consonants or vowels.
    """
    if not text:
        return []

    raw_parts = re.split(r'([។!?…\r\n]+)', str(text).strip())
    atomic_phrases = []

    for part in raw_parts:
        part = part.strip()
        if not part:
            continue
        if re.match(r'^[។!?…\r\n]+$', part):
            if atomic_phrases:
                atomic_phrases[-1] += part
            continue

        if ' ' in part:
            space_tokens = [t.strip() for t in part.split(' ') if t.strip()]
        else:
            space_tokens = [part]

        for tok in space_tokens:
            if len(tok) <= max_chars:
                atomic_phrases.append(tok)
            else:
                # Try breaking at grammatical markers using lookahead
                sub_toks = re.split(f'(?={_KHMER_MARKER_PATTERN})', tok)
                sub_toks = [st for st in sub_toks if st]

                for st in sub_toks:
                    if len(st) <= max_chars:
                        atomic_phrases.append(st)
                    else:
                        # Fallback to orthographic cluster boundaries
                        clusters = _KHMER_CLUSTER_REGEX.findall(st) or [st]
                        cur_sub = ''
                        for cl in clusters:
                            if len(cur_sub) + len(cl) <= max_chars:
                                cur_sub += cl
                            else:
                                if cur_sub:
                                    atomic_phrases.append(cur_sub)
                                cur_sub = cl
                        if cur_sub:
                            atomic_phrases.append(cur_sub)

    lines = []
    current_line = ''
    for phrase in atomic_phrases:
        if not current_line:
            current_line = phrase
        else:
            sep = ' ' if (' ' in text) else ''
            candidate = f'{current_line}{sep}{phrase}'
            if len(candidate) <= max_chars:
                current_line = candidate
            else:
                lines.append(current_line.strip())
                current_line = phrase
    if current_line and current_line.strip():
        lines.append(current_line.strip())

    return [l for l in lines if l]

def get_app_icon_path() -> str:
    """Finds the absolute path to jai_auto_dubber.png / favicon.png across dev and packaged environments."""
    import sys
    import os
    candidates = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "jai_auto_dubber.png"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "jai_auto_dubber.png"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "favicon.png"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "favicon.png"),
    ]
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        candidates.insert(0, os.path.join(exe_dir, "jai_auto_dubber.png"))
        candidates.insert(1, os.path.join(exe_dir, "assets", "jai_auto_dubber.png"))
        candidates.insert(2, os.path.join(exe_dir, "favicon.png"))
        candidates.insert(3, os.path.join(exe_dir, "assets", "favicon.png"))
        if hasattr(sys, '_MEIPASS'):
            candidates.insert(4, os.path.join(sys._MEIPASS, "jai_auto_dubber.png"))
            candidates.insert(5, os.path.join(sys._MEIPASS, "assets", "jai_auto_dubber.png"))
            candidates.insert(6, os.path.join(sys._MEIPASS, "favicon.png"))
            candidates.insert(7, os.path.join(sys._MEIPASS, "assets", "favicon.png"))
    for p in candidates:
        if p and os.path.exists(p):
            return p
    return ""

def load_application_fonts():
    """Loads embedded fonts (Hanuman, JetBrains Mono, etc.) into QFontDatabase."""
    import sys
    import os
    try:
        from PyQt6.QtGui import QFontDatabase
        candidates = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "fonts"),
        ]
        if getattr(sys, 'frozen', False):
            exe_dir = os.path.dirname(sys.executable)
            candidates.insert(0, os.path.join(exe_dir, "assets", "fonts"))
            if hasattr(sys, '_MEIPASS'):
                candidates.insert(0, os.path.join(sys._MEIPASS, "assets", "fonts"))

        for fdir in candidates:
            if os.path.exists(fdir):
                for fname in os.listdir(fdir):
                    if fname.lower().endswith((".ttf", ".otf")):
                        QFontDatabase.addApplicationFont(os.path.join(fdir, fname))
    except Exception as e:
        print(f"[Fonts] Warning loading application fonts: {e}")
