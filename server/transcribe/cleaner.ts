/**
 * Regular expression detecting foreign or dirty scripts:
 * - Chinese CJK unified ideographs: \u4e00-\u9fa5, \u3400-\u4dbf, \uf900-\ufaff
 * - Thai script: \u0e00-\u0e7f
 * - Lao script: \u0e80-\u0eff
 * - English / Latin letters (e.g. Pinyin names like Qingyue, Lin, Xiao): a-zA-Z
 */
export const FOREIGN_OR_DIRTY_REGEX =
  /[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff\u0e00-\u0e7f\u0e80-\u0effa-zA-Z]/;

/**
 * Common Chinese Pinyin character names, places, and English titles
 * mapped to their authentic Khmer script phonetics.
 */
export const PINYIN_TO_KHMER_REPLACEMENTS: [RegExp, string][] = [
  // Compound names
  [/\bQingyue\b/gi, 'ឈីងយៀក'],
  [/\bQing\s*yue\b/gi, 'ឈីងយៀក'],
  [/\bQingxue\b/gi, 'ឈីងស្វៀ'],
  [/\bQing\s*xue\b/gi, 'ឈីងស្វៀ'],
  [/\bYueqing\b/gi, 'យៀកឈីង'],
  [/\bYue\s*qing\b/gi, 'យៀកឈីង'],
  [/\bLintian\b/gi, 'លីនធាន'],
  [/\bLin\s*tian\b/gi, 'លីនធាន'],
  [/\bXiaoyan\b/gi, 'ស៊ាវយ៉ាន'],
  [/\bXiao\s*yan\b/gi, 'ស៊ាវយ៉ាន'],
  [/\bYechen\b/gi, 'យេឆឹង'],
  [/\bYe\s*chen\b/gi, 'យេឆឹង'],
  [/\bLuchen\b/gi, 'លូឆឹង'],
  [/\bLu\s*chen\b/gi, 'លូឆឹង'],
  [/\bSuyuling\b/gi, 'ស៊ូយីលីង'],
  [/\bSu\s*yuling\b/gi, 'ស៊ូយីលីង'],
  [/\bGunan\b/gi, 'គូណាន'],
  [/\bGu\s*nan\b/gi, 'គូណាន'],
  [/\bHaoran\b/gi, 'ហាវរ៉ាន'],
  [/\bHao\s*ran\b/gi, 'ហាវរ៉ាន'],
  [/\bMeiling\b/gi, 'ម៉ីលីង'],
  [/\bMei\s*ling\b/gi, 'ម៉ីលីង'],
  [/\bZhiyuan\b/gi, 'ជីយាន'],
  [/\bZhi\s*yuan\b/gi, 'ជីយាន'],
  [/\bXiaolong\b/gi, 'ស៊ាវឡុង'],
  [/\bXiao\s*long\b/gi, 'ស៊ាវឡុង'],
  [/\bBailong\b/gi, 'ប៉ាយឡុង'],
  [/\bBai\s*long\b/gi, 'ប៉ាយឡុង'],
  [/\bTianlong\b/gi, 'ធានឡុង'],
  [/\bTian\s*long\b/gi, 'ធានឡុង'],
  [/\bFenghuang\b/gi, 'ហ្វុងហ័ង'],
  [/\bFeng\s*huang\b/gi, 'ហ្វុងហ័ង'],

  // Single Pinyin clan/family names & syllables
  [/\bQing\b/gi, 'ឈីង'],
  [/\bYue\b/gi, 'យៀក'],
  [/\bLin\b/gi, 'លីន'],
  [/\bXiao\b/gi, 'ស៊ាវ'],
  [/\bChen\b/gi, 'ឆឹង'],
  [/\bYe\b/gi, 'យេ'],
  [/\bSu\b/gi, 'ស៊ូ'],
  [/\bLu\b/gi, 'លូ'],
  [/\bGu\b/gi, 'គូ'],
  [/\bNan\b/gi, 'ណាន'],
  [/\bTian\b/gi, 'ធាន'],
  [/\bYan\b/gi, 'យ៉ាន'],
  [/\bFeng\b/gi, 'ហ្វុង'],
  [/\bWang\b/gi, 'វ៉ាង'],
  [/\bLi\b/gi, 'លី'],
  [/\bZhang\b/gi, 'ចាង'],
  [/\bLiu\b/gi, 'លីវ'],
  [/\bYang\b/gi, 'យ៉ាង'],
  [/\bHuang\b/gi, 'ហ័ង'],
  [/\bWu\b/gi, 'វូ'],
  [/\bZhao\b/gi, 'ចាវ'],
  [/\bZhou\b/gi, 'ចូវ'],
  [/\bXu\b/gi, 'ស៊ូ'],
  [/\bSun\b/gi, 'ស៊ុន'],
  [/\bMa\b/gi, 'ម៉ា'],
  [/\bZhu\b/gi, 'ជូ'],
  [/\bHu\b/gi, 'ហ៊ូ'],
  [/\bGuo\b/gi, 'គួ'],
  [/\bHe\b/gi, 'ហេ'],
  [/\bGao\b/gi, 'កៅ'],
  [/\bLuo\b/gi, 'លួ'],
  [/\bZheng\b/gi, 'ចឹង'],
  [/\bLiang\b/gi, 'លៀង'],
  [/\bXie\b/gi, 'សៀ'],
  [/\bSong\b/gi, 'សុង'],
  [/\bTang\b/gi, 'ថាង'],
  [/\bHan\b/gi, 'ហាន'],
  [/\bDong\b/gi, 'តុង'],
  [/\bJiang\b/gi, 'ជាំង'],
  [/\bBai\b/gi, 'ប៉ាយ'],
  [/\bFan\b/gi, 'ហ្វាន'],
  [/\bJin\b/gi, 'ជីន'],
  [/\bPeng\b/gi, 'ផេង'],
  [/\bYu\b/gi, 'យូ'],
  [/\bWen\b/gi, 'វ៉ិន'],
  [/\bLong\b/gi, 'ឡុង'],
  [/\bHao\b/gi, 'ហាវ'],
  [/\bRan\b/gi, 'រ៉ាន'],
  [/\bMei\b/gi, 'ម៉ី'],
  [/\bLing\b/gi, 'លីង'],
  [/\bZhi\b/gi, 'ជី'],
  [/\bYuan\b/gi, 'យាន'],
  [/\bMing\b/gi, 'មីង'],
  [/\bNing\b/gi, 'នីង'],
  [/\bPing\b/gi, 'ពីង'],
  [/\bJian\b/gi, 'ជាន'],
  [/\bJia\b/gi, 'ជា'],
  [/\bJie\b/gi, 'ជៀ'],
  [/\bJun\b/gi, 'ជុន'],
  [/\bLei\b/gi, 'ឡី'],
  [/\bChun\b/gi, 'ឈុន'],
  [/\bChao\b/gi, 'ឆាវ'],
  [/\bHai\b/gi, 'ហាយ'],
  [/\bHong\b/gi, 'ហុង'],
  [/\bQiang\b/gi, 'ឈៀង'],
  [/\bQian\b/gi, 'ឈៀន'],
  [/\bRong\b/gi, 'រ៉ុង'],
  [/\bRui\b/gi, 'រួយ'],
  [/\bShan\b/gi, 'សាន'],
  [/\bSheng\b/gi, 'សឹង'],
  [/\bShu\b/gi, 'ស៊ូ'],
  [/\bShuang\b/gi, 'ស្វាង'],
  [/\bTing\b/gi, 'ធីង'],
  [/\bWei\b/gi, 'វ៉ី'],
  [/\bXiang\b/gi, 'ស៊ាង'],
  [/\bXin\b/gi, 'ស៊ីន'],
  [/\bXing\b/gi, 'ស៊ីង'],
  [/\bXiong\b/gi, 'ស្យុង'],
  [/\bXuan\b/gi, 'ស្វៀន'],
  [/\bXue\b/gi, 'ស្វៀ'],
  [/\bYong\b/gi, 'យ៉ុង'],
  [/\bZhen\b/gi, 'ចិន'],
  [/\bZhong\b/gi, 'ចុង'],

  // English & Workplace titles
  [/\bCEO\b/gi, 'អគ្គនាយក'],
  [/\bBoss\b/gi, 'ថៅកែ'],
  [/\bMr\b\.?/gi, 'លោក'],
  [/\bMrs\b\.?/gi, 'លោកស្រី'],
  [/\bMiss\b\.?/gi, 'កញ្ញា'],
  [/\bDr\b\.?/gi, 'លោកដុកទ័រ'],
];

/**
 * Common Thai phrases/words that AI might hallucinate or leave mixed with Khmer,
 * and their natural Khmer equivalents.
 */
const THAI_TO_KHMER_REPLACEMENTS: [RegExp, string][] = [
  // Common sentence starters / demonstratives
  [/นี่คือថា/g, 'នេះគឺថា'],
  [/นี่คือ/g, 'នេះគឺ'],
  [/นี่/g, 'នេះ'],
  [/นั่นคือ/g, 'នោះគឺ'],
  [/นั่น/g, 'នោះ'],
  [/คือ/g, 'គឺ'],
  [/เป็น/g, 'ជា'],
  [/ได้/g, 'បាន'],
  [/ไม่ได้/g, 'មិនបាន'],
  [/ไม่ใช่/g, 'មិនមែន'],
  [/ใช่/g, 'មែន'],
  [/ไม่/g, 'មិន'],
  [/ครับ/g, 'បាទ'],
  [/ค่ะ|คะ/g, 'ចាស'],
  [/ขอบคุณ/g, 'អរគុណ'],
  [/ขอโทษ/g, 'សុំទោស'],
  [/อะไร/g, 'អ្វី'],
  [/ทำไม/g, 'ហេតុអ្វី'],
  [/พูด/g, 'និយាយ'],
  [/ไป/g, 'ទៅ'],
  [/มา/g, 'មក'],
  [/ดี/g, 'ល្អ'],
  [/จริง/g, 'ពិត'],
  [/ใคร/g, 'នរណា'],
  [/ที่ไหน/g, 'ឯណា'],
  [/อย่างไร/g, 'យ៉ាងម៉េច'],
  [/เข้าใจ/g, 'យល់'],
  [/รู้/g, 'ដឹង'],
  [/คุณ/g, 'អ្នក'],
  [/เธอ/g, 'នាង'],
  [/เขา/g, 'គាត់'],
  [/เรา/g, 'យើង'],
  [/ฉัน|ผม/g, 'ខ្ញុំ'],
  [/พ่อ/g, 'ប៉ា'],
  [/แม่/g, 'ម៉ាក់'],
  [/ลูก/g, 'កូន'],
  [/พี่/g, 'បង'],
  [/น้อง/g, 'ប្អូន'],
  [/แล้ว/g, 'ហើយ'],
  [/จะ/g, 'នឹង'],
  [/ให้/g, 'ឱ្យ'],
  [/กับ/g, 'ជាមួយ'],
  [/ใน/g, 'ក្នុង'],
  [/ที่/g, 'នៅ'],
  [/ของ/g, 'របស់'],
  [/อยู่/g, 'នៅ'],
  [/มี/g, 'មាន'],
  [/มาก/g, 'ណាស់'],
  [/เร็ว/g, 'លឿន'],
  [/ช้า/g, 'យឺត'],
  [/ช่วย/g, 'ជួយ'],
  [/หยุด/g, 'ឈប់'],
  [/รอ/g, 'ចាំ'],
  [/รัก/g, 'ស្រឡាញ់'],
  [/ชอบ/g, 'ចូលចិត្ត'],
];

/**
 * Common Chinese character names, clan names, and titles transliterated to Khmer.
 */
export const CHINESE_TO_KHMER_REPLACEMENTS: [RegExp, string][] = [
  [/总裁/g, 'អគ្គនាយក'],
  [/董事长/g, 'ប្រធានក្រុមប្រឹក្សា'],
  [/经理/g, 'អ្នកគ្រប់គ្រង'],
  [/助理/g, 'ជំនួយការ'],
  [/秘书/g, 'លេខា'],
  [/二房/g, 'ផ្ទះទីពីរ'],
  [/大房/g, 'ផ្ទះធំ'],
  [/孙子/g, 'ចៅប្រុស'],
  [/孙女/g, 'ចៅស្រី'],
  [/保姆/g, 'អ្នកមើលថែ'],
  [/阿姨/g, 'អ្នកមីង'],
  [/叔叔/g, 'លោកពូ'],
  [/爸爸/g, 'ប៉ា'],
  [/妈妈/g, 'ម៉ាក់'],
  [/爷爷/g, 'លោកតា'],
  [/奶奶/g, 'លោកយាយ'],
  [/哥哥/g, 'បងប្រុស'],
  [/姐姐/g, 'បងស្រី'],
  [/弟弟/g, 'ប្អូនប្រុស'],
  [/妹妹/g, 'ប្អូនស្រី'],
  [/老公/g, 'ប្តី'],
  [/老婆/g, 'ប្រពន្ធ'],
  [/陛下|皇上/g, 'ព្រះករុណា'],
  [/殿下/g, 'ព្រះអង្គ'],
  [/娘娘/g, 'ព្រះម្នាង'],
  [/皇后/g, 'ព្រះអគ្គមហេសី'],
  [/王爷/g, 'ព្រះអង្គម្ចាស់'],
  [/王妃/g, 'អ្នកម្នាង'],
  [/微臣|奴才/g, 'ទូលបង្គំ'],
  [/奴婢|臣妾/g, 'ខ្ញុំម្ចាស់'],
  [/遵命/g, 'ទទួលរាជបញ្ជា'],
  [/师父|师傅/g, 'លោកគ្រូ'],
  [/师兄/g, 'សិស្សច្បង'],
  [/师弟/g, 'សិស្សប្អូន'],
  [/师姐/g, 'សិស្សច្បងស្រី'],
  [/师妹/g, 'សិស្សប្អូនស្រី'],
  [/徒儿|徒弟/g, 'កូនសិស្ស'],
  [/掌门/g, 'មេបក្ស'],
  [/大侠/g, 'អ្នកក្លាហាន'],
  [/江湖/g, 'ពិភពគុន'],
  [/天啊/g, 'ព្រះអើយ'],
  [/好孩子/g, 'កូនល្អ'],
  [/谢谢/g, 'អរគុណ'],
];

/**
 * Sanitizes dialogue text to ensure 100% pure Khmer text:
 * 1. Transliterates dynamically discovered glossary/character names from story analysis.
 * 2. Transliterates/replaces known Thai phrases to Khmer.
 * 3. Transliterates known Chinese character names/words to Khmer.
 * 4. Strictly strips all remaining Thai characters (U+0E00 - U+0E7F) and Lao (U+0E80 - U+0EFF).
 * 5. Strips any remaining Chinese characters (CJK).
 * 6. Cleans up whitespace.
 */
export function cleanKhmerDialogueText(
  input: string,
  customGlossary?: Record<string, string>
): string {
  if (!input) return '';
  let text = String(input);

  // 1. Replace dynamically discovered glossary and character names from story analysis
  if (customGlossary && typeof customGlossary === 'object') {
    for (const [key, value] of Object.entries(customGlossary)) {
      if (key && value && typeof value === 'string' && key.trim().length > 0) {
        text = text.split(key).join(value);
      }
    }
  }

  // 2. Replace Thai phrases
  for (const [pattern, khmerWord] of THAI_TO_KHMER_REPLACEMENTS) {
    text = text.replace(pattern, khmerWord);
  }

  // 3. Replace Chinese names & words
  for (const [pattern, khmerWord] of CHINESE_TO_KHMER_REPLACEMENTS) {
    text = text.replace(pattern, khmerWord);
  }

  // 4. Replace Pinyin and foreign names into authentic phonetic Khmer script
  for (const [pattern, khmerWord] of PINYIN_TO_KHMER_REPLACEMENTS) {
    text = text.replace(pattern, khmerWord);
  }

  // 5. Post-processing corrections for royal and Thai loanword mistakes
  text = text.replace(/ទូលបង្គាប់/g, 'ទូលព្រះបង្គំ');
  text = text.replace(/រំ[ាាំ]?[ខគ]ា?[ញន]/g, 'រំខាន');
  text = text.replace(/កុំរំ[ាាំ]?[ខគ]ា?[ញន]/g, 'កុំរំខាន');

  // 6. Strictly strip any remaining Thai script (U+0E00 - U+0E7F) and Lao script (U+0E80 - U+0EFF)
  text = text.replace(/[\u0e00-\u0e7f\u0e80-\u0eff]/g, '');

  // 7. Strictly strip any remaining Chinese CJK characters
  text = text.replace(/[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]/g, '');

  // 8. Strictly strip any remaining English / Latin letters so NO Latin text appears in subtitles
  text = text.replace(/[a-zA-Z]+/g, '');

  // 9. Adapt stiff written phrasing into natural spoken colloquial Khmer dubbing
  text = adaptToSpokenKhmerDubbing(text);

  // 10. Clean up duplicate spaces and trim
  text = text.replace(/[ \t]{2,}/g, ' ').trim();

  return text;
}

/**
 * Adapts stiff written/book Khmer phrases into authentic spoken colloquial Khmer
 * for natural cinematic voice dubbing.
 */
export function adaptToSpokenKhmerDubbing(input: string): string {
  if (!input) return '';
  let text = input;

  // 1. Stiff written question patterns -> spoken natural equivalents
  text = text.replace(/តើ\s*អ្នក\s*កំពុង\s*(?:ធ្វើ)?អ្វី(?:\s*នៅទីនេះ)?/g, 'ឯងកំពុងធ្វើស្អីហ្នឹង?');
  text = text.replace(/តើ\s*ឯង\s*កំពុង\s*(?:ធ្វើ)?អ្វី(?:\s*នៅទីនេះ)?/g, 'ឯងកំពុងធ្វើស្អីហ្នឹង?');
  text = text.replace(/តើ\s*អ្នក\s*ចង់(?:បាន)?\s*អ្វី/g, 'ចង់បានអីដែរ?');
  text = text.replace(/តើ\s*ឯង\s*ចង់(?:បាន)?\s*អ្វី/g, 'ឯងចង់បានអី?');
  text = text.replace(/តើ\s*អ្នក\s*នៅឯណា/g, 'ឯងនៅឯណា?');
  text = text.replace(/តើ\s*ឯង\s*នៅឯណា/g, 'ឯងនៅឯណា?');
  text = text.replace(/តើ\s*មានរឿងអ្វី\s*កើតឡើង/g, 'មានរឿងអីកើតឡើងហ្នឹង?');
  text = text.replace(/តើ\s*ពិតមែនទេ/g, 'ពិតមែនហ្អេស?');
  text = text.replace(/តើ\s*ត្រូវធ្វើ\s*(?:យ៉ាង)?ម៉េច/g, 'ត្រូវធ្វើម៉េចទៅ?');
  text = text.replace(/តើ\s*ហេតុអ្វី(?:\s*បានជា)?/g, 'ហេតុអីបានជា');
  text = text.replace(/តើ\s*អ្នក\s*សុខសប្បាយជាទេ/g, 'សុខសប្បាយជាទេ?');
  text = text.replace(/តើ\s*អ្នកណា(?:\s*គេ)?/g, 'អ្នកណាគេ');

  // Strip leading standalone "តើ" if followed by colloquial question
  text = text.replace(/^តើ\s*/, '');
  text = text.replace(/([.!?។]\s*)តើ\s*/g, '$1');

  // 2. Negative verbal contractions (មិន... -> អត់...)
  text = text.replace(/មិនដឹងទេ/g, 'អត់ដឹងទេ');
  text = text.replace(/មិនដឹង/g, 'អត់ដឹង');
  text = text.replace(/មិនចង់ទេ/g, 'អត់ចង់ទេ');
  text = text.replace(/មិនចង់/g, 'អត់ចង់');
  text = text.replace(/មិនទៅទេ/g, 'អត់ទៅទេ');
  text = text.replace(/មិនទៅ/g, 'អត់ទៅ');
  text = text.replace(/មិនអាចទេ/g, 'អត់បានទេ');
  text = text.replace(/មិនទាន់ទេ/g, 'អត់ទាន់ទេ');
  text = text.replace(/មិនទាន់/g, 'អត់ទាន់');
  text = text.replace(/មិនយល់ទេ/g, 'អត់យល់ទេ');
  text = text.replace(/មិនយល់/g, 'អត់យល់');
  text = text.replace(/មិនមែនទេ/g, 'អត់មែនទេ');
  text = text.replace(/មិនមានទេ/g, 'អត់មានទេ');
  text = text.replace(/មិនអីទេ/g, 'អត់អីទេ');

  // 3. Stiff pronouns & object references
  text = text.replace(/ធ្វើអ្វី/g, 'ធ្វើអី');
  text = text.replace(/រឿងអ្វី/g, 'រឿងអី');

  return text;
}
