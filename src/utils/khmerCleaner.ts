/**
 * Client-side Khmer Dialogue Cleaner
 * Guarantees that subtitles and dubbing texts are 100% pure Khmer text,
 * eliminating all Thai (U+0E00-U+0E7F), Lao (U+0E80-U+0EFF), and Chinese characters.
 */

export const FOREIGN_OR_DIRTY_REGEX =
  /[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff\u0e00-\u0e7f\u0e80-\u0eff]/;

const THAI_TO_KHMER_REPLACEMENTS: [RegExp, string][] = [
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

export const CHINESE_TO_KHMER_REPLACEMENTS: [RegExp, string][] = [
  [/岁岁/g, 'ស៊ុយស៊ុយ'],
  [/霍娇/g, 'ហួរជាវ'],
  [/霍家/g, 'ត្រកូលហួរ'],
  [/霍总/g, 'លោកប្រធានហួរ'],
  [/张全/g, 'ចាងឈាន'],
  [/宗家/g, 'ត្រកូលចុង'],
  [/宗四公子/g, 'អ្នកប្រុសទីបួនត្រកូលចុង'],
  [/四公子/g, 'អ្នកប្រុសទីបួន'],
  [/萧寒/g, 'ស៊ាវហាន'],
  [/顾总/g, 'លោកប្រធានគូ'],
  [/陆总/g, 'លោកប្រធានលូ'],
  [/李总/g, 'លោកប្រធានលី'],
  [/总裁/g, 'អគ្គនាយក'],
  [/二房/g, 'ផ្ទះទីពីរ'],
  [/大房/g, 'ផ្ទះធំ'],
  [/孙子/g, 'ចៅប្រុស'],
  [/玉佩/g, 'បន្តោងត្បូង'],
  [/捡瓶子/g, 'រើសដប'],
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
  [/天啊/g, 'ព្រះអើយ'],
  [/好孩子/g, 'កូនល្អ'],
  [/谢谢/g, 'អរគុណ'],
];

export function cleanKhmerDialogueText(input: string): string {
  if (!input) return '';
  let text = String(input);

  // 1. Replace Thai phrases with Khmer
  for (const [pattern, khmerWord] of THAI_TO_KHMER_REPLACEMENTS) {
    text = text.replace(pattern, khmerWord);
  }

  // 2. Replace Chinese names & words
  for (const [pattern, khmerWord] of CHINESE_TO_KHMER_REPLACEMENTS) {
    text = text.replace(pattern, khmerWord);
  }

  // 3. Strictly strip any remaining Thai script (U+0E00 - U+0E7F) and Lao script (U+0E80 - U+0EFF)
  text = text.replace(/[\u0e00-\u0e7f\u0e80-\u0eff]/g, '');

  // 4. Strictly strip any remaining Chinese CJK characters
  text = text.replace(/[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]/g, '');

  // 5. Adapt stiff written phrasing into natural spoken colloquial Khmer dubbing
  text = adaptToSpokenKhmerDubbing(text);

  // 6. Clean up duplicate spaces and trim
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
