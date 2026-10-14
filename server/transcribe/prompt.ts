export type GeminiModelGroup = 'Gemini 3' | 'Gemini 2.5' | 'Deprecated';

export interface SupportedGeminiModel {
  id: string;
  label: string;
  group: GeminiModelGroup;
}

export const SUPPORTED_GEMINI_MODELS: SupportedGeminiModel[] = [
  // ── Gemini 3 ──
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', group: 'Gemini 3' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', group: 'Gemini 3' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', group: 'Gemini 3' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Stable)', group: 'Gemini 3' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', group: 'Gemini 3' },
  { id: 'gemini-3.5-transcribe', label: 'Gemini 3.5 Transcribe', group: 'Gemini 3' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', group: 'Gemini 3' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', group: 'Gemini 3' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Stable)', group: 'Gemini 3' },
  { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview', group: 'Gemini 3' },

  // ── Gemini 2.5 ──
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', group: 'Gemini 2.5' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', group: 'Gemini 2.5' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Fastest)', group: 'Gemini 2.5' },

  // ── Deprecated ──
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', group: 'Deprecated' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', group: 'Deprecated' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', group: 'Deprecated' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', group: 'Deprecated' },
];

export const GEMINI_MODELS = SUPPORTED_GEMINI_MODELS.map((m) => m.id);

export interface CharacterRelationship {
  characterA: string;
  characterB: string;
  relationType: string;
  aToBPronoun: string;
  bToAPronoun: string;
  formality?: 'royal' | 'formal' | 'intimate' | 'casual' | 'hostile';
}

export interface StoryCharacter {
  id?: string;
  originalName: string;
  khmerName: string;
  gender: 'male' | 'female';
  ageGroup?: 'child' | 'teen' | 'young_adult' | 'adult' | 'elder';
  role: string;
  personality?: string;
  speakingStyle?: string;
  pronounsToUse: string;
  voiceProfile: 'km-KH-PisethNeural' | 'km-KH-SreymomNeural';
}

export interface StoryAnalysisContext {
  genre: string;
  tone: 'modern' | 'historical_royal' | 'historical_wuxia' | 'comedy' | 'action';
  synopsis: string;
  characters: StoryCharacter[];
  relationships?: CharacterRelationship[];
  glossary: Record<string, string>;
}

/**
 * Professional Khmer Drama Dubbing Relationship & Pronoun Decision Matrix.
 * Eliminates literal word-for-word translation of Chinese pronouns (你, 我, 他, 哥哥, 姐姐, etc.)
 * and selects the culturally accurate Khmer address form based on speaker, listener, and emotional tone.
 */
export const KHMER_DRAMA_RELATIONSHIP_RULES = `
🎭 វិធានមាសនៃការប្រើសព្វនាម និងទំនាក់ទំនងតួអង្គខ្មែរ (KHMER DRAMA DUBBING RELATIONSHIP & PRONOUN MATRIX):
🚨 ហាមដាច់ខាតមិនឱ្យបកប្រែពាក្យ 你 (អ្នក/ឯង), 我 (ខ្ញុំ), 他/她 (គេ/គាត់) តាមន័យចំត្រង់ៗដោយគ្មានការវិភាគទំនាក់ទំនង!
ត្រូវពិនិត្យមើល Speaker, Listener, ភេទ, អាយុ, ឋានៈសង្គម និងកម្រិតស្និទ្ធស្នាល៖

១. ទំនាក់ទំនងស្នេហា / ប្តី-ប្រពន្ធ (Lovers / Married Couples / Romantic Interest):
   - ទោះបីជាភាសាចិនប្រើ 你 / 我 ឬ 哥哥 / 妹妹 / 亲爱的 / 老公 / 老婆 ក៏ដោយ៖
     * តួប្រុស ហៅខ្លួនឯងថា "បង", ហៅតួស្រីថា "អូន" (បង / អូន)
     * តួស្រី ហៅខ្លួនឯងថា "អូន", ហៅតួប្រុសថា "បង" (អូន / បង)
   - ⚠️ ហាមបកប្រែជា "អ្នក / ខ្ញុំ" ឬ "ប្ដី / ប្រពន្ធ" ក្នុងការសន្ទនាផ្ទាល់មាត់ឡើយ!

២. ទំនាក់ទំនងគ្រួសារ និងសាច់ញាតិ (Family & Kinship Hierarchy):
   - ឪពុក ➔ កូន (Father & Child):
     * ឪពុកហៅខ្លួនឯងថា "ប៉ា" ឬ "ពុក", ហៅកូនថា "កូន"
     * កូនហៅខ្លួនឯងថា "កូន", ហៅឪពុកថា "ប៉ា" ឬ "ពុក"
   - ម្តាយ ➔ កូន (Mother & Child):
     * ម្តាយហៅខ្លួនឯងថា "ម៉ាក់" ឬ "ម៉ែ", ហៅកូនថា "កូន"
     * កូនហៅខ្លួនឯងថា "កូន", ហៅម្តាយថា "ម៉ាក់" ឬ "ម៉ែ"
   - បងប្រុស ➔ ប្អូន (Older Brother & Younger Sibling):
     * បងប្រុសហៅខ្លួនឯងថា "បង", ហៅប្អូនថា "អូន" ឬ "ប្អូន"
     * ប្អូនហៅខ្លួនឯងថា "អូន" ឬ "ប្អូន", ហៅបងប្រុសថា "បង" ឬ "បងប្រុស"
   - បងស្រី ➔ ប្អូន (Older Sister & Younger Sibling):
     * បងស្រីហៅខ្លួនឯងថា "បង", ហៅប្អូនថា "អូន" ឬ "ប្អូន"
     * ប្អូនហៅខ្លួនឯងថា "អូន" ឬ "ប្អូន", ហៅបងស្រីថា "បង" ឬ "បងស្រី"
   - ជីដូនជីតា ➔ ចៅ (Grandparents & Grandchildren):
     * តា/យាយ ហៅខ្លួនឯងថា "តា / យាយ", ហៅចៅថា "ចៅ"
     * ចៅហៅខ្លួនឯងថា "ចៅ", ហៅតា/យាយថា "លោកតា / លោកយាយ"
   - ពូ/មីង/អ៊ំ ➔ ក្មួយ (Aunts/Uncles & Nephew/Niece):
     * ពូ/មីង ហៅខ្លួនឯងថា "ពូ / មីង", ហៅក្មួយថា "ក្មួយ"
     * ក្មួយហៅខ្លួនឯងថា "ក្មួយ", ហៅពូ/មីងថា "លោកពូ / អ្នកមីង"

៣. រឿងបុរាណ / រាជវាំង (Historical Royal & Palace Drama):
   - មន្ត្រី/រាស្ត្រ/កូនចៅ និយាយទៅកាន់ ព្រះមហាក្សត្រ/ស្ដេច (Subject/Minister to Emperor):
     * ហៅខ្លួនឯងថា "ទូលព្រះបង្គំ" (ប្រុស) ឬ "ខ្ញុំម្ចាស់" (ស្រី) (⚠️ ហាមសរសេរ "ទូលបង្គាប់" ដាច់ខាត ព្រោះខុសវេយ្យាករណ៍ខ្មែរ!)
     * ហៅស្ដេចថា "ព្រះករុណា" ឬ "ព្រះមហាក្សត្រ"
     * ពាក្យឆ្លើយតប៖ "ក្រាបទូល", "ទទួលរាជបញ្ជា"
   - ព្រះមហាក្សត្រ និយាយទៅកាន់ មន្ត្រី/រាស្ត្រ/កូនចៅ (Emperor to Subjects):
     * ហៅខ្លួនឯងថា "យើង"
     * ហៅមន្ត្រី/រាស្ត្រថា "ពួកឯង", "ឯង" ឬ ហៅតាមងារ (ឧ. "លោកមេទ័ព", "លោករដ្ឋមន្ត្រី")
   - មន្ត្រី/កូនចៅ និយាយទៅកាន់ ព្រះអង្គម្ចាស់ / ព្រះនាង / អ្នកម្នាង (To Prince / Princess):
     * ហៅខ្លួនឯងថា "ទូលបង្គំ" ឬ "ខ្ញុំម្ចាស់"
     * ហៅព្រះអង្គម្ចាស់ថា "ព្រះអង្គ" ឬ "លោកម្ចាស់"
     * ហៅព្រះនាងថា "ព្រះនាង" ឬ "អ្នកម្នាង"
   - ព្រះស្នំ/មហេសី និយាយទៅកាន់ ព្រះមហាក្សត្រ (Consort/Empress to Emperor):
     * ហៅខ្លួនឯងថា "ខ្ញុំម្ចាស់" ឬ "ខ្ញុំម្ចាស់ក្សត្រី"
     * ហៅព្រះមហាក្សត្រថា "ព្រះករុណា"

៤. រឿងយុទ្ធសិល្ប៍ / ពិភពគុន (Wuxia & Martial Arts):
   - កូនសិស្ស និយាយទៅកាន់ លោកគ្រូ/មេបក្ស (Disciple to Master):
     * ហៅខ្លួនឯងថា "កូនសិស្ស" ឬ "ទូលបង្គំ"
     * ហៅគ្រូថា "លោកគ្រូ", "លោកគ្រូធំ", ឬ "មេបក្ស"
   - លោកគ្រូ និយាយទៅកាន់ កូនសិស្ស (Master to Disciple):
     * ហៅខ្លួនឯងថា "គ្រូ"
     * ហៅកូនសិស្សថា "ឯង" ឬ "កូនសិស្ស"
   - សិស្សច្បង និង សិស្សប្អូន (Senior & Junior Martial Peers):
     * សិស្សប្អូនហៅសិស្សច្បងថា "សិស្សច្បង" (師兄/師姐)
     * សិស្សច្បងហៅសិស្សប្អូនថា "សិស្សប្អូន" (師弟/師妹)

៥. សម័យទំនើបការងារ / ឋានានុក្រមក្រុមហ៊ុន (Corporate & Workplace Hierarchy):
   - កូនចៅ/បុគ្គលិក និយាយទៅកាន់ មេដឹកនាំ/ថៅកែ (Employee to Boss/Executive):
     * ហៅខ្លួនឯងថា "ខ្ញុំបាទ" (ប្រុស) ឬ "នាងខ្ញុំ" (ស្រី)
     * ហៅមេដឹកនាំថា "លោកប្រធាន", "លោកអគ្គនាយក", "ថៅកែ", ឬ "អ្នកគ្រប់គ្រង"
   - មេដឹកនាំ/ថៅកែ និយាយទៅកាន់ កូនចៅ/បុគ្គលិក (Boss to Employee):
     * ហៅខ្លួនឯងថា "ខ្ញុំ"
     * ហៅកូនចៅថា "ឯង" ឬ "អ្នក" ឬតាមឈ្មោះផ្ទាល់

៦. មនុស្សមិនដែលស្គាល់គ្នា / ទំនាក់ទំនងគួរសម (Strangers & Polite Distance):
   - ហៅខ្លួនឯងថា "ខ្ញុំ"
   - ហៅភាគីម្ខាងទៀតថា "លោក" (ប្រុស), "អ្នកនាង / លោកស្រី" (ស្រី), ឬ "អ្នក"

៧. មិត្តភក្តិជិតស្និទ្ធ (Close Friends / Peers):
   - ហៅខ្លួនឯងថា "យើង" ឬ "ខ្ញុំ"
   - ហៅភាគីម្ខាងទៀតថា "ឯង" ឬតាមឈ្មោះផ្ទាល់

៨. ឈុតឆាកឈ្លោះប្រកែក / កំហឹង / សត្រូវ (Conflict, Anger & Enemies):
   - នៅពេលមានទំនាស់ខ្លាំង កំហឹង ឬជាសត្រូវនឹងគ្នា៖
     * ប្ដូរពីពាក្យគួរសម មកប្រើ "ឯង / យើង" (ឧ. "ឯងគិតថាយើងខ្លាចឯងមែនទេ?!")
     * បើជាគូសត្រូវ ឬជនពាល៖ អាចប្រើ "អា..." (ប្រុស), "មី..." (ស្រី)
     * ប្រសិនបើប្តី-ប្រពន្ធ ឬគូស្នេហ៍ឈ្លោះគ្នាយ៉ាងខ្លាំង អាចប្ដូរពី "បង/អូន" ទៅជា "លោក/ខ្ញុំ" ឬ "ឯង/យើង" តាមអារម្មណ៍តួអង្គ!
`;

/**
 * Normalizes user-selected or legacy Gemini model IDs to valid, current API models.
 */
export function normalizeGeminiModelId(inputModel?: string): string {
  if (!inputModel) return 'gemini-3.5-flash';
  const m = inputModel.trim().toLowerCase();

  // If already matches an official ID, use it directly
  const exact = SUPPORTED_GEMINI_MODELS.find((item) => item.id.toLowerCase() === m);
  if (exact) return exact.id;

  // Handle common aliases or legacy IDs
  if (m === 'gemini-flash-latest' || m.includes('2.0-flash')) {
    return 'gemini-2.0-flash';
  }
  if (m === 'gemini-flash-lite-latest' || m.includes('2.0-flash-lite')) {
    return 'gemini-2.0-flash-lite';
  }
  if (m.includes('3.5-flash-lite') || m.includes('3.5-lite')) {
    return 'gemini-3.5-flash-lite';
  }
  if (m.includes('3.5-transcribe') || m.includes('transcribe')) {
    return 'gemini-3.5-transcribe';
  }
  if (m.includes('3.5')) {
    return 'gemini-3.5-flash';
  }
  if (m.includes('2.5-pro')) {
    return 'gemini-2.5-pro';
  }
  if (m.includes('2.5-lite') || m.includes('2.5-flash-lite')) {
    return 'gemini-2.5-flash-lite';
  }
  if (m.includes('2.5')) {
    return 'gemini-2.5-flash';
  }
  if (m.includes('1.5-pro')) {
    return 'gemini-1.5-pro';
  }
  if (m.includes('1.5')) {
    return 'gemini-1.5-flash';
  }
  if (m.includes('3.1-pro')) {
    return 'gemini-3.1-pro-preview';
  }
  if (m.includes('3.1-lite') || m.includes('3.1-flash-lite')) {
    return 'gemini-3.1-flash-lite';
  }
  if (m.includes('3-flash')) {
    return 'gemini-3-flash-preview';
  }
  if (m.includes('3.')) {
    return 'gemini-3.5-flash';
  }

  return 'gemini-3.5-flash';
}

/**
 * Builds the Phase 1 prompt: Deep Global Story Context, Genre, and Character Cast Analysis.
 * Analyzes the full transcript to discover who the characters are, their relationships,
 * genders, Khmer name transliterations, and social hierarchy.
 */
export function buildGlobalStoryAndCharacterAnalysisPrompt(
  whisperSegments: Array<{ id?: number; start: number; end: number; text: string }>,
  options?: {
    videoTitle?: string;
    customPrompt?: string;
    detectedLanguage?: string;
  }
): string {
  const title = options?.videoTitle ? `ចំណងជើងវីដេអូ / ឯកសារ (Video Title): "${options.videoTitle}"\n` : '';
  const lang = options?.detectedLanguage ? `ភាសាដើម (Source Language): ${options.detectedLanguage}\n` : '';
  const custom = options?.customPrompt ? `ការណែនាំបន្ថែមពីអ្នកប្រើប្រាស់ (User Instructions): ${options.customPrompt}\n` : '';

  const sampleLimit = Math.min(whisperSegments.length, 350);
  const sampleDialogues = whisperSegments
    .slice(0, sampleLimit)
    .map((s, idx) => `[${idx + 1}] (${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s): ${s.text}`)
    .join('\n');

  return `អ្នកគឺជាអ្នកដឹកនាំរឿង អ្នកជំនាញវិភាគសាច់រឿងភាពយន្ត និងអ្នកនិពន្ធសេណារីយ៉ូបញ្ចូលសំឡេងខ្មែរអាជីព (Master Film Story Analyst & Khmer Voice Dubbing Director)។
ភារកិច្ចរបស់អ្នកគឺ វិភាគសាច់រឿងទាំងមូលពីដើមដល់ចប់ ស្វែងយល់ពីសាច់រឿងសង្ខេប កំណត់បញ្ជីតួអង្គទាំងអស់ឱ្យបានសុក្រឹត (ភេទ ឋានៈ ទំនាក់ទំនង សព្វនាមហៅគ្នា និងចរិតលក្ខណៈ) និងបម្លែងរាល់ឈ្មោះតួអង្គ/ទីកន្លែងទៅជាអក្សរខ្មែរតាមសូរសព្ទឱ្យបានត្រឹមត្រូវ ១០០%។

${title}${lang}${custom}
${KHMER_DRAMA_RELATIONSHIP_RULES}

ខាងក្រោមនេះគឺជាសម្រង់អត្ថបទសន្ទនាក្នុងវីដេអូដែលស្រង់ចេញដោយ Fast-Whisper៖
=== COMPLETE SPOKEN DIALOGUE TRANSCRIPT ===
${sampleDialogues}
=== END TRANSCRIPT ===

🎯 ភារកិច្ចវិភាគសាច់រឿង និងកំណត់តួអង្គ (DEEP STORY & CHARACTER CASTING):
១. វិភាគប្រភេទសាច់រឿង បរិបទ និងទំនាស់រឿង (Genre, Setting & Core Conflict):
   - តើជាប្រភេទរឿងអ្វីពិតប្រាកដ? (ឧ. រឿងសម័យទំនើប, មហាសេដ្ឋី/CEO, ស្នេហាត្រីកោណ, វាយប្រហារសងសឹក, ឬ រឿងបុរាណ/រាជវាំង/យុទ្ធសិល្ប៍?)
   - សង្ខេបសាច់រឿងឱ្យច្បាស់លាស់ ៣-៤ ប្រយោគជាភាសាខ្មែរ (synopsis)៖ តើអ្នកណាជាតួឯក? អ្នកណាជាតួកាច/សត្រូវ? តើកំពុងមានទំនាស់ ឬហេតុការណ៍អ្វីកើតឡើងក្នុងឈុតឆាកនេះ?

២. កំណត់បញ្ជីតួអង្គទាំងអស់ដែលនិយាយ (Accurate Character Cast Identification):
   - ត្រូវពិនិត្យមើលរាល់ឈ្មោះ ងារ ឬតួនាទីដែលមាននៅក្នុង Transcript ខាងលើផ្ទាល់ (⚠️ ហាមប្រឌិតឈ្មោះដែលគ្មានក្នុងរឿង!)៖
     * originalName: ឈ្មោះដើម ឬងារដែលមានក្នុងអត្ថបទខាងលើ
     * khmerName: ឈ្មោះជាអក្សរខ្មែរតាមសូរសព្ទដើមឱ្យពីរោះត្រឹមត្រូវ (ឧ. ឈ្មោះចិន transliterate តាមសូរសព្ទចិន, ឈ្មោះថៃ transliterate តាមសូរសព្ទថៃ)
     * gender: ភេទពិតប្រាកដ ("male" ឬ "female")
     * ageGroup: វ័យ ("child", "teen", "young_adult", "adult", "elder")
     * role: តួនាទី / ឋានៈ / ទំនាក់ទំនង (ឧ. "ប្តី / អគ្គនាយក", "ភរិយា", "ឪពុក", "កូនស្រី", "ជំនួយការ", "សត្រូវ")
     * pronounsToUse: ពាក្យហៅគ្នារវាងតួអង្គឱ្យត្រូវតាមសាច់រឿង និងអារម្មណ៍ (ឧ. ប្តី-ប្រពន្ធហៅ "បង/អូន", ឪពុក-កូនហៅ "ប៉ា/កូន", មេ-កូនចៅហៅ "លោកប្រធាន/ខ្ញុំបាទ", រាជវាំងហៅ "ព្រះករុណា/ទូលព្រះបង្គំ")
     * voiceProfile: "km-KH-PisethNeural" (ប្រុស) ឬ "km-KH-SreymomNeural" (ស្រី)

៣. កំណត់ទំនាក់ទំនងរវាងគូតួអង្គនីមួយៗ (Character Relationships Matrix):
   - រាល់គូតួអង្គដែលសន្ទនាជាមួយគ្នា ត្រូវកំណត់ relationType និងពាក្យហៅគ្នាទៅវិញទៅមក (aToBPronoun និង bToAPronoun)។

៤. វចនានុក្រមបំប្លែងឈ្មោះ និងពាក្យពិសេស (Glossary):
   - បម្លែងរាល់នាមត្រកូល ឋានៈ ឈ្មោះក្រុមហ៊ុន និងទីកន្លែងដែលមានក្នុងរឿងនេះជាភាសាខ្មែរឱ្យជាប់លាប់។

ទម្រង់លទ្ធផល (OUTPUT MUST BE STRICT VALID JSON ONLY, NO MARKDOWN, NO COMMENTS):
{
  "genre": "ប្រភេទរឿង (ឧ. Modern Revenge Drama / CEO / Historical)",
  "tone": "modern",
  "synopsis": "សេចក្តីសង្ខេបសាច់រឿងជាភាសាខ្មែរយ៉ាងក្បោះក្បាយ...",
  "characters": [
    {
      "originalName": "ឈ្មោះដើមរបស់តួអង្គទី១ ក្នុង Transcript",
      "khmerName": "ឈ្មោះជាអក្សរខ្មែរតាមសូរសព្ទ",
      "gender": "male",
      "ageGroup": "adult",
      "role": "តួនាទី និងទំនាក់ទំនងក្នុងរឿង",
      "pronounsToUse": "សព្វនាមហៅគ្នា (ឧ. បង/អូន ឬ ប៉ា/កូន ឬ លោកប្រធាន/ខ្ញុំ)",
      "voiceProfile": "km-KH-PisethNeural"
    },
    {
      "originalName": "ឈ្មោះដើមរបស់តួអង្គទី២ ក្នុង Transcript",
      "khmerName": "ឈ្មោះជាអក្សរខ្មែរតាមសូរសព្ទ",
      "gender": "female",
      "ageGroup": "adult",
      "role": "តួនាទី និងទំនាក់ទំនងក្នុងរឿង",
      "pronounsToUse": "សព្វនាមហៅគ្នា",
      "voiceProfile": "km-KH-SreymomNeural"
    }
  ],
  "relationships": [
    {
      "characterA": "ឈ្មោះតួអង្គទី១",
      "characterB": "ឈ្មោះតួអង្គទី២",
      "relationType": "lovers | husband_wife | father_child | mother_child | siblings | boss_employee | royal_subject | friends | enemies",
      "aToBPronoun": "បង",
      "bToAPronoun": "អូន",
      "formality": "intimate"
    }
  ],
  "glossary": {
    "ពាក្យដើម": "ពាក្យខ្មែរបកប្រែត្រឹមត្រូវ"
  }
}
`;
}

export const CINEMATIC_TRANSLATION_SYSTEM_INSTRUCTION = `You are an expert cinematic dialogue translator, script adaptor, and professional Khmer voice dubbing director (អ្នកដឹកនាំ និងនិពន្ធសេណារីយ៉ូបញ្ចូលសំឡេងភាពយន្តអាជីព)។

CORE OBJECTIVE:
Translate the transcribed dialogue into authentic, natural spoken colloquial Khmer specifically crafted for professional voice dubbing (ភាសាខ្មែរនិយាយបញ្ចូលសំឡេងបែបធម្មជាតិ ១០០% មិនមែនពាក្យអានសៀវភៅ) matching the storyline, context, character relationships, and screen timing.

CRITICAL DIRECTIVES:
1. NATURAL SPOKEN COLLOQUIAL KHMER VS. STIFF BOOK TRANSLATION (ភាសាខ្មែរនិយាយបែបធម្មជាតិ ហាមបកប្រែដូចអានសៀវភៅ):
   - 🚨 STRICTLY FORBIDDEN: Never translate into stiff, robotic, book-like phrases such as "តើអ្នកកំពុងធ្វើអ្វី?", "ខ្ញុំមិនដឹងអំពីរឿងនេះទេ", "តើពិតមែនទេ?", "តើអ្នកចង់បានអ្វី?", "តើអ្នកនៅឯណា?"!
   - 🌟 ALWAYS ADAPT INTO NATURAL SPOKEN KHMER:
     * Natural Contractions: In modern colloquial speech, use "អត់...ទេ" instead of stiff "មិន...ទេ" (e.g. "អត់ដឹងទេ", "អត់ចង់ទៅទេ", "អត់ទាន់ទេ", "អត់យល់ទេ", "អត់មានរឿងអីទេ")។
     * Colloquial Question Patterns:
       - "តើអ្នកកំពុងធ្វើអ្វី?" ➔ "ឯងកំពុងធ្វើស្អីហ្នឹង?" ឬ "កំពុងធ្វើអីហ្នឹង?"
       - "តើអ្នកចង់បានអ្វី?" ➔ "ចង់បានអីដែរ?" ឬ "ឯងចង់បានអី?"
       - "តើអ្នកនៅឯណា?" ➔ "ឯងនៅឯណា?" ឬ "នៅឯណា?"
       - "តើមានរឿងអ្វីកើតឡើង?" ➔ "មានរឿងអីកើតឡើងហ្នឹង?"
       - "តើពិតមែនទេ?" ➔ "ពិតមែនហ្អេស?" ឬ "មែនហ្ហ៎?"
       - "តើហេតុអ្វី?" ➔ "ហេតុអី?", "ម៉េចក៏ចឹង?", "ម៉េចបានជាចឹង?"
       - "តើអ្នកសុខសប្បាយជាទេ?" ➔ "សុខសប្បាយជាទេ?"
     * Emotional Fillers & Conversational Endings:
       - Seamlessly integrate natural Khmer particles for dramatic effect: "ហ្នឹង", "ណា", "ហ្អា៎", "ហា៎?", "អ្ហ៎!", "ចុះ", "ដែរ", "ឯណាទៅ", "ទៅ", "ម៉េចចឹង!"
       - Interjections for reactions: "ចុម!", "យី!", "អីយ៉ា!", "ងាប់ហើយ!", "ព្រះអើយ!", "ហ៊ឹម!", "ហាសហា!"
     * Dialogue Timing & Rhythm:
       - Keep sentences punchy, natural, and rhythmic for lip-sync and voice delivery.
       - Do not make sentences artificially long or rushed.

2. STORYLINE & CONTEXT COHESION (បកប្រែឱ្យត្រូវនឹងសាច់រឿង):
   - Read the dialogue as an unfolding story. Understand the plot, setting, genre, and emotional arc.
   - Use appropriate spoken Khmer pronouns and honorifics based on who is speaking to whom:
     * Lovers / Couples / Husband-Wife: បង / អូន
     * Friends / Peers: ឯង / គ្នា, ខ្ញុំ / ឯង
     * Family / Kinship: ម៉ែ, ឪ, កូន, បង, ប្អូន, តា, យាយ, មីង, ពូ
     * Formal / Respectful / Strangers: លោក, អ្នក, ខ្ញុំបាទ, នាងខ្ញុំ
     * Angry / Confrontational: អញ / ហង, អា / មី
   - Dynamic Emotion Shift: If lovers or husband/wife enter a bitter quarrel or betrayal scene, smoothly transition from "បង/អូន" to "លោក/ខ្ញុំ" or "ឯង/យើង" matching their rage or heartbreak!

3. SPEAKER GENDER CLASSIFICATION:
   - Determine the overall primary voice gender: 'male' or 'female'.
   - For each dialogue item, classify the speaker voice as 'male' or 'female'.

4. 100% PURE KHMER CHARACTERS ONLY (អក្សរខ្មែរសុទ្ធ ហាមមានអក្សរបរទេស):
   - 'khmer_text' MUST be 100% pure Khmer text. Never include Chinese characters, Thai letters, or English letters. Transliterate all names into Khmer script only.
   - Spell out all numbers in Khmer words ('មួយ', 'ពីរ', 'បី'...).

5. OUTPUT FORMAT (Strict JSON object):
{
  "detected_voice": "male" or "female",
  "items": [
    {"id": 0, "khmer_text": "ឃ្លានិយាយខ្មែរ", "voice": "male" or "female"}
  ]
}`;

/**
 * Builds the Phase 2 prompt: Context-Enriched Dialogue Dubbing & Scriptwriting.
 * Translates dialogues line-by-line while strictly adhering to the Story Context,
 * Character Cast, hierarchy, emotional tone, and proper pronouns.
 */
export function buildStoryEnrichedDialoguePrompt(
  whisperSegments: Array<{ id: number; start: number; end: number; text: string }>,
  storyContext?: StoryAnalysisContext,
  options?: {
    videoTitle?: string;
    customPrompt?: string;
    sourceLanguage?: string;
    chunkNum?: number;
    totalChunks?: number;
    previousContext?: Array<{ id: number; speaker?: string; text: string }>;
    upcomingPreview?: Array<{ id: number; text: string }>;
  }
): string {
  const sourceLang = options?.sourceLanguage || 'auto';
  const chunkNum = options?.chunkNum || 1;
  const totalChunks = options?.totalChunks || 1;

  const dialogueItems = whisperSegments.map((seg) => ({
    id: seg.id,
    text: seg.text,
    duration_sec: Number((Math.max(0.3, seg.end - seg.start)).toFixed(2)),
  }));

  // Context components
  const synopsisText = storyContext?.synopsis
    ? `\n[សង្ខេបសាច់រឿង និងបរិបទ (Storyline Context)]\n- ប្រភេទរឿង: ${storyContext.genre || 'Drama'} (${storyContext.tone || 'modern'})\n- សេចក្តីសង្ខេប: ${storyContext.synopsis}\n`
    : '';

  const characterCastText = storyContext?.characters && storyContext.characters.length > 0
    ? `\n[បញ្ជីតួអង្គ និងសព្វនាម (Character Cast & Pronouns)]\n` +
      storyContext.characters
        .map(
          (c) =>
            `  - ${c.khmerName || c.originalName} (${c.gender === 'female' ? 'ស្រី' : 'ប្រុស'}${c.role ? `, ${c.role}` : ''}): ប្រើ "${c.pronounsToUse || (c.gender === 'female' ? 'អូន/នាង' : 'បង/ខ្ញុំ')}"`
        )
        .join('\n') + '\n'
    : '';

  const relationshipsText = storyContext?.relationships && storyContext.relationships.length > 0
    ? `\n[ទំនាក់ទំនងរវាងតួអង្គ (Character Relationships)]\n` +
      storyContext.relationships
        .map(
          (r) =>
            `  - [${r.characterA}] ➔ [${r.characterB}]: ${r.relationType} (${r.characterA} ហៅ/ជំនួសខ្លួន: "${r.aToBPronoun}", ${r.characterB} ហៅ/ជំនួសខ្លួន: "${r.bToAPronoun}")`
        )
        .join('\n') + '\n'
    : '';

  const previousContextText = options?.previousContext && options.previousContext.length > 0
    ? `\n[បរិបទបន្ទាត់សន្ទនាមុនៗ (Previous Dialogue Context)]\n` +
      options.previousContext.map((p) => `  [ID ${p.id}]: "${p.text}"`).join('\n') + '\n'
    : '';

  return `${CINEMATIC_TRANSLATION_SYSTEM_INSTRUCTION}

${synopsisText}${characterCastText}${relationshipsText}${previousContextText}
Scene Dialogue Transcript (Part ${chunkNum}/${totalChunks}, Source Language: ${sourceLang}):
${JSON.stringify(dialogueItems, null, 2)}

TRANSLATION INSTRUCTIONS:
1. Read the dialogue sequence to understand the storyline, scene setting, and character relationships.
2. Translate each dialogue line into natural spoken Khmer for voice dubbing matching the story context (ត្រូវនឹងសាច់រឿង) and proper character pronouns (បង/អូន, ឯង/គ្នា, លោក/អ្នក, etc.).
3. Ensure the translation is complete, expressive, and fully understandable (ការបកប្រែពេញលេញ និងស្ដាប់អត្ថន័យយល់ច្បាស់) without omitting key ideas.
4. Return strict JSON with 'detected_voice' and translated 'items' preserving each line's exact 'id'.`;
}

/**
 * Legacy compatibility wrapper.
 */
export function buildGeminiStoryAnalysisPrompt(
  whisperSegments: Array<{ start: number; end: number; text: string }>,
  options?: {
    videoTitle?: string;
    customPrompt?: string;
    detectedLanguage?: string;
  }
): string {
  const segmentsWithIds = whisperSegments.map((s, idx) => ({
    id: idx + 1,
    start: s.start,
    end: s.end,
    text: s.text,
  }));

  const mockContext: StoryAnalysisContext = {
    genre: 'Drama',
    tone: 'modern',
    synopsis: options?.videoTitle || 'ឈុតឆាកសន្ទនាក្នុងវីដេអូ',
    characters: [],
    glossary: {},
  };

  return buildStoryEnrichedDialoguePrompt(segmentsWithIds, mockContext, options);
}

/**
 * Direct Audio Transcription & Translation Prompt.
 * Converts raw audio speech directly into timed, natural Khmer dubbing subtitles.
 */
export function buildKhmerTranscriptionPrompt(options?: {
  sourceLanguage?: string;
  videoTitle?: string;
  customPrompt?: string;
  durationSeconds?: number;
  dramaStyle?: string;
  glossary?: Record<string, string>;
  characterProfiles?: Array<{ name: string; gender: string; role?: string }>;
}): string {
  const durationText = options?.durationSeconds
    ? `- រយៈពេលសរុបនៃសំឡេង (Total Duration): ${options.durationSeconds.toFixed(1)} វិនាទី (${Math.round(options.durationSeconds * 1000)} ms)\n`
    : '';
  const titleText = options?.videoTitle ? `- បរិបទសាច់រឿង/ចំណងជើង: "${options.videoTitle}"\n` : '';
  const customText = options?.customPrompt ? `- ការណែនាំបន្ថែម: ${options.customPrompt}\n` : '';
  const langText = options?.sourceLanguage ? `- ភាសាដើម (Source Language): ${options.sourceLanguage}\n` : '';

  const styleText = options?.dramaStyle
    ? `- ទម្រង់រឿង: ${options.dramaStyle}\n`
    : '- ទម្រង់រឿង (Drama Style): សម្របសម្រួលតាមសាច់រឿង (រឿងបុរាណរាជវាំង, ក្បាច់គុន, ឬសម័យ)\n';

  const glossaryItems = Object.entries(options?.glossary || {});
  const glossaryText = glossaryItems.length > 0
    ? glossaryItems.map(([k, v]) => `  - ${k} => ${v}`).join('\n') + '\n'
    : '  - ប្រើពាក្យរាជសព្ទ បើជារឿងបុរាណរាជវាំង (ទូលព្រះបង្គំ, ព្រះករុណា, ក្រាបទូល...)\n';

  const charProfiles = options?.characterProfiles && options.characterProfiles.length > 0
    ? options.characterProfiles.map((c) => `  - ${c.name} (${c.gender === 'female' ? 'ស្រី' : 'ប្រុស'}${c.role ? `, ${c.role}` : ''})`).join('\n') + '\n'
    : '  - កំណត់តួអង្គ និងភេទ (Female/Male) តាមសូរសំឡេងពិតប្រាកដ\n';

  return `You are an elite Cambodian film & drama dubbing master and translator (អ្នកដឹកនាំបញ្ចេញបញ្ចូលសំឡេងភាពយន្តភាគខ្មែរអាជីព).
Carefully listen to this entire audio track and transcribe/translate with extreme cinematic accuracy:

[រយៈពេលកំណត់ និងបរិបទនៃសាច់រឿង (Duration & Scene Context)]
${durationText}${titleText}${langText}${customText}
[ទម្រង់រឿង (Drama Style: រឿងបុរាណរាជវាំង, ក្បាច់គុន, ឬសម័យ)]
${styleText}
[វចនានុក្រមសព្ទរឿង (Drama Glossary & Royal Terms)]
${glossaryText}
[តារាងឈ្មោះ និងភេទតួអង្គ (Character Profiles & Continuity)]
${charProfiles}
RULES FOR KHMER TRANSLATION & VOICEOVER (ភាសាខ្មែរពិតប្រាកដ និងត្រឹមត្រូវតាមក្បួនខ្នាត):
1. STORYLINE & CONTEXT COHESION (បកប្រែឱ្យត្រូវនឹងសាច់រឿង): 
   - Read and listen to the dialogue as an unfolding story. Understand the plot, setting, genre, and emotional arc.
   - Use appropriate spoken Khmer pronouns and honorifics based on who is speaking to whom (បង/អូន, ឯង/គ្នា, ម៉ែ, ឪ, កូន, លោក, អ្នក, អញ/ហង, etc.).
   - Avoid stiff, robotic word-for-word translation. Adapt idioms, humor, sarcasm, emotions, and cultural nuances into natural spoken Khmer that sounds authentic and engaging in a dubbed film.

2. COMPLETE MEANING & NATURAL SPOKEN FLUENCY (បកប្រែឱ្យពេញលេញ និងស្តាប់យល់ន័យច្បាស់): 
   - Translate every dialogue line fully and completely. Preserve the full meaning, context, humor, and emotion without omitting any important ideas.
   - Prioritize clear, natural spoken Khmer (ភាសាខ្មែរនិយាយបែបធម្មជាតិ) that native listeners understand easily and smoothly.
   - Do not truncate or over-compress sentences into stiff abbreviations. Complete, authentic conversational meaning is the highest priority.

3. NATURAL EVERYDAY SPOKEN KHMER (ភាសានិយាយសាមញ្ញ ងាយយល់ ខ្មែរធ្លាប់ឮ ហាមពាក្យចម្លែក):
   - Use ONLY natural, familiar words that ordinary Cambodian people actually speak and hear every day on TV drama dubbing (ដូចការបញ្ចូលសំឡេងរឿងភាគទូរទស្សន៍ ហង្សមាស CTN បាយ័ន PNN)!
   - STRICTLY FORBIDDEN to use strange, unfamiliar, archaic, or bizarre machine-translated words that Cambodians have never heard in real life!
   - NEVER translate foreign idioms word-for-word into nonsense phrases! Translate the REAL, SIMPLE MEANING:
     * 烦死了 / 吵死了 -> 'រំខានណាស់!' (ហាមដាច់ខាតពាក្យថៃដូចជា 'រំាខាញ' ឬ 'រំខាញ'!)
     * 闭嘴 -> 'បិទមាត់ទៅ!' ឬ 'នៅឱ្យស្ងៀម!'
     * 给我滚 -> 'ចេញទៅ!' ឬ 'ទៅឱ្យឆ្ងាយ!'
     * 救命 -> 'ជួយផង!'
     * 别担心 -> 'កុំបារម្ភអី!'
     * 怎么回事 -> 'មានរឿងអីកើតឡើង?'
     * 混账 / 混蛋 -> 'អាមនុស្សអាក្រក់!' ឬ 'អាចង្រៃ!'
   - Use common, natural Khmer spoken words: 'អត់យល់ / មិនយល់', 'បារម្ភ', 'ខឹង', 'កុហក / បោកប្រាស់', 'សប្បាយចិត្ត', 'សម្លាប់ / កម្ចាត់' (ហាមពាក្យពិបាកៗក្នុងវចនានុក្រមបាលីសំស្ក្រឹតហួសហេតុ)។

4. ROYAL & HISTORICAL DRAMA VOCABULARY (ក្បួនរាជសព្ទរឿងបុរាណ):
   - Subordinate/Minister addressing King/Prince: Use 'ទូលព្រះបង្គំ' or 'ទូលបង្គំ' (NEVER 'ទូលបង្គាប់' which is incorrect Khmer!).
   - Addressing Royal/Superior: Use 'ព្រះករុណា', 'ព្រះអង្គ', 'ម្ចាស់បង', 'ទ្រង់'...
   - Consort / Maid / Female subject: 'ខ្ញុំម្ចាស់'
   - Royal Response: 'ក្រាបទូល', 'ទទួលរាជបញ្ជា'

5. PRECISE TIMESTAMPS (ចាប់ពេលឱ្យចំពេលតួអង្គនិយាយ គិតជា Milliseconds):
   - Provide EXACT timestamps down to milliseconds matching when vocal sounds are physically produced:
     * 'start_time': '00:02.350'
     * 'end_time': '00:04.800'
     * 'start_ms': 2350, 'end_ms': 4800
   - Do NOT guess or round to full seconds. Align tightly with speech.

6. 100% PURE KHMER CHARACTERS ONLY (អក្សរខ្មែរសុទ្ធ ហាមមានអក្សរបរទេស):
   - 'khmer_text' MUST be 100% pure Khmer text (គ្មានអក្សរបរទេស ឬភាសាផ្សេងឡើយ)។
   - STRICTLY FORBIDDEN: NEVER include Chinese characters (如: 老九, 大雍, 苏玉玲), Thai letters, or English letters.
   - STRICTLY FORBIDDEN: NEVER use bilingual brackets like '老九 (ឡៅជូ)' or '大雍 (តាយ៉ុង)'!
   - Transliterate all foreign names directly and exclusively into pure Khmer letters: សរសេរតែ 'ឡៅជូ', 'តាយ៉ុង', 'លូឆឹង', 'ស៊ូយីលីង'...

7. SPELL OUT ALL NUMBERS (ហាមសរសេរជាលេខ ត្រូវសរសេរជាពាក្យខ្មែរ):
   - Always write numbers in Khmer words: 'មួយ', 'ពីរ', 'បី', 'បួន', 'ប្រាំ', 'ដប់', 'ម្ភៃ', 'មួយរយ', 'មួយពាន់'...

8. SPEAKER GENDER ACCURACY (បែងចែកសម្លេងស្រី ឬ ប្រុស):
   - 'speaker' MUST be strictly either 'Female' (ស្រី) or 'Male' (ប្រុស) ដើម្បីជ្រើសរើសសំឡេង Edge TTS ឱ្យត្រូវ។
   - Also include 'character_name' in Khmer (ឧ. 'ឡៅជូ', 'ព្រះមហាក្សត្រ', 'មេបក្ស')។

9. OUTPUT FORMAT: Return ONLY a valid JSON array of objects without markdown commentary.

[
  {
    "id": 1,
    "start_time": "00:01.200",
    "end_time": "00:04.500",
    "start_ms": 1200,
    "end_ms": 4500,
    "speaker": "Male",
    "character_name": "ឡៅជូ",
    "original_text": "Original spoken sentence",
    "khmer_text": "ប្រយោគជាភាសាខ្មែរសុទ្ធសាធ ខ្លីខ្លឹម...",
    "tone": "emotional/urgent/calm/respectful"
  }
]`;
}
