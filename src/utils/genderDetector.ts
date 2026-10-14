/**
 * Auto-detects whether a subtitle dialogue line is spoken by a Male (ប្រុស) or Female (ស្រី) speaker.
 * Analyzes:
 * 1. Spoken Khmer linguistics: affirmations (ចា៎, ចាស vs បាទ), female/male pronouns (នាងខ្ញុំ, ខ្ញុំបាទ), honorifics.
 * 2. Character name / speaker role in `meaning` field (តួស្រី, តួប្រុស, មាតា, ម្ចាស់ក្សត្រី, លោកម្ចាស់, 王妃, 公子, etc.).
 * 3. Original foreign text if available (Chinese 姑娘, 姐姐, 丫鬟, 女, 她 vs 公子, 哥哥, 大人, 男, 他; English she/he).
 * 4. Multi-segment character name consistency & conversational dialogue flow.
 */

export interface SegmentGenderInput {
  id?: string | number;
  gender?: 'male' | 'female' | string;
  meaning?: string;
  text?: string;
  originalText?: string;
  voiceProfile?: string;
  startTime?: number;
  endTime?: number;
  speed?: number;
  isChecked?: boolean;
}

export interface DetectGenderOptions {
  /**
   * If true, existing `seg.gender` is re-evaluated rather than treated as an override,
   * allowing linguistic & character detection to properly classify lines.
   */
  forceRecompute?: boolean;
}

/**
 * Computes individual linguistic and contextual gender scores for a single segment.
 * Returns { femaleScore, maleScore, reason }.
 */
export function evaluateSegmentScores(seg: SegmentGenderInput): {
  femaleScore: number;
  maleScore: number;
  reason: string;
} {
  let femaleScore = 0;
  let maleScore = 0;
  const reasons: string[] = [];

  const text = (seg.text || '').toLowerCase().trim();
  const meaning = (seg.meaning || '').toLowerCase().trim();
  const orig = (seg.originalText || '').toLowerCase().trim();

  // 1. Khmer text affirmations & exclusive markers
  if (text) {
    // 100% Female exclusive affirmations & greetings
    if (
      /ចា៎ះ?/u.test(text) ||
      /ចាស៎?/u.test(text) ||
      /ចាសបង/u.test(text) ||
      /ចាសលោក/u.test(text) ||
      /ចាសពុក/u.test(text) ||
      /ចាសម៉ែ/u.test(text) ||
      /ចាសម៉ាក់/u.test(text) ||
      /ចាសម្ចាស់/u.test(text) ||
      /ចាសចៅហ្វាយ/u.test(text)
    ) {
      femaleScore += 12;
      reasons.push('khmer_affirmation_female');
    }

    // 100% Male exclusive affirmations
    if (
      /បាទ៎?/u.test(text) ||
      /បាទបង/u.test(text) ||
      /បាទលោក/u.test(text) ||
      /បាទពុក/u.test(text) ||
      /បាទម៉ែ/u.test(text) ||
      /បាទម្ចាស់/u.test(text) ||
      /បាទលោកម្ចាស់/u.test(text) ||
      /បាទចៅហ្វាយ/u.test(text)
    ) {
      maleScore += 12;
      reasons.push('khmer_affirmation_male');
    }

    // Female pronouns & self-references
    if (/នាងខ្ញុំ/u.test(text) || /ខ្ញុំម្ចាស់/u.test(text) || /កូនស្រី/u.test(text)) {
      femaleScore += 10;
      reasons.push('khmer_pronoun_female');
    }
    if (/ខ្ញុំបាទ/u.test(text) || /កូនប្រុស/u.test(text)) {
      maleScore += 10;
      reasons.push('khmer_pronoun_male');
    }

    // Female speech patterns in dialogue (addressing self as អូន to older/partner)
    if (/អូន(?:ស្រឡាញ់|គិតថា|ដឹង|សុំទោស|យល់ព្រម|មិនចង់|ទៅ|មក|ខ្លាច|ឃ្លាន|ហត់|ព្រម|សុំ)/u.test(text)) {
      femaleScore += 8;
      reasons.push('khmer_romantic_female');
    }
    // Male speech patterns (addressing self as បង to partner)
    if (/បង(?:ស្រឡាញ់អូន|សន្យា|សុំទោសអូន|គិតថាអូន)/u.test(text)) {
      maleScore += 8;
      reasons.push('khmer_romantic_male');
    }

    // Female honorifics / roles in Khmer text
    if (
      /អ្នកនាង/u.test(text) ||
      /កញ្ញា/u.test(text) ||
      /ព្រះនាង/u.test(text) ||
      /ម្ចាស់ក្សត្រី/u.test(text) ||
      /មាតា/u.test(text) ||
      /ម៉ាក់/u.test(text) ||
      /ម៉ែ/u.test(text) ||
      /យាយ/u.test(text) ||
      /មីង/u.test(text) ||
      /បងស្រី/u.test(text) ||
      /អូនស្រី/u.test(text) ||
      /ក្មួយស្រី/u.test(text) ||
      /ភរិយា/u.test(text) ||
      /ប្រពន្ធ/u.test(text) ||
      /កូនក្រមុំ/u.test(text) ||
      /នារី/u.test(text) ||
      /ស្ត្រី/u.test(text) ||
      /តួស្រី/u.test(text) ||
      /នាងស្នំ/u.test(text) ||
      /ព្រះស្នំ/u.test(text) ||
      /មហេសី/u.test(text)
    ) {
      femaleScore += 6;
      reasons.push('khmer_role_female');
    }

    // Male honorifics / roles in Khmer text
    if (
      /លោកម្ចាស់/u.test(text) ||
      /ឯកឧត្តម/u.test(text) ||
      /ស្ដេច/u.test(text) ||
      /ព្រះមហាក្សត្រ/u.test(text) ||
      /ព្រះរាជា/u.test(text) ||
      /បិតា/u.test(text) ||
      /លោកពុក/u.test(text) ||
      /ពុក/u.test(text) ||
      /លោកតា/u.test(text) ||
      /លោកពូ/u.test(text) ||
      /ពូ/u.test(text) ||
      /ចៅហ្វាយ/u.test(text) ||
      /មេបញ្ជាការ/u.test(text) ||
      /មេទ័ព/u.test(text) ||
      /លោកគ្រូ/u.test(text) ||
      /ស្វាមី/u.test(text) ||
      /ប្តី/u.test(text) ||
      /កម្លោះ/u.test(text) ||
      /បុរស/u.test(text) ||
      /តួប្រុស/u.test(text) ||
      /បងប្រុស/u.test(text) ||
      /អាប្អូន/u.test(text)
    ) {
      maleScore += 6;
      reasons.push('khmer_role_male');
    }
  }

  // 2. Character Name / Speaker Role Analysis (`meaning` field)
  if (meaning) {
    if (
      meaning.includes('ស្រី') ||
      meaning.includes('female') ||
      meaning.includes('woman') ||
      meaning.includes('girl') ||
      meaning.includes('queen') ||
      meaning.includes('princess') ||
      meaning.includes('mother') ||
      meaning.includes('daughter') ||
      meaning.includes('sister') ||
      meaning.includes('maid') ||
      meaning.includes('concubine') ||
      meaning.includes('consort') ||
      meaning.includes('lady') ||
      meaning.includes('heroine') ||
      meaning.includes('sreymom') ||
      meaning.includes('wife') ||
      meaning.includes('កញ្ញា') ||
      meaning.includes('អ្នកនាង') ||
      meaning.includes('ម្ចាស់ក្សត្រី') ||
      meaning.includes('ព្រះនាង') ||
      meaning.includes('មាតា') ||
      meaning.includes('ម៉ែ') ||
      meaning.includes('ម៉ាក់') ||
      meaning.includes('យាយ') ||
      meaning.includes('មីង') ||
      meaning.includes('ភរិយា') ||
      meaning.includes('ប្រពន្ធ') ||
      meaning.includes('តួស្រី') ||
      meaning.includes('女') ||
      meaning.includes('姑娘') ||
      meaning.includes('小姐') ||
      meaning.includes('妃') ||
      meaning.includes('后') ||
      meaning.includes('姐') ||
      meaning.includes('妹') ||
      meaning.includes('妈') ||
      meaning.includes('娘') ||
      meaning.includes('妾') ||
      meaning.includes('婢') ||
      meaning.includes('昭')
    ) {
      femaleScore += 14;
      reasons.push('meaning_speaker_female');
    }

    if (
      meaning.includes('ប្រុស') ||
      meaning.includes('male') ||
      meaning.includes('man') ||
      meaning.includes('boy') ||
      meaning.includes('king') ||
      meaning.includes('prince') ||
      meaning.includes('father') ||
      meaning.includes('son') ||
      meaning.includes('brother') ||
      meaning.includes('lord') ||
      meaning.includes('emperor') ||
      meaning.includes('general') ||
      meaning.includes('hero') ||
      meaning.includes('sir') ||
      meaning.includes('piseth') ||
      meaning.includes('husband') ||
      meaning.includes('លោកម្ចាស់') ||
      meaning.includes('ស្ដេច') ||
      meaning.includes('បិតា') ||
      meaning.includes('ពុក') ||
      meaning.includes('តា') ||
      meaning.includes('ពូ') ||
      meaning.includes('ស្វាមី') ||
      meaning.includes('ប្តី') ||
      meaning.includes('កម្លោះ') ||
      meaning.includes('តួប្រុស') ||
      meaning.includes('男') ||
      meaning.includes('公子') ||
      meaning.includes('少爷') ||
      meaning.includes('王') ||
      meaning.includes('皇') ||
      meaning.includes('爷') ||
      meaning.includes('兄') ||
      meaning.includes('弟') ||
      meaning.includes('爹') ||
      meaning.includes('哥') ||
      meaning.includes('将')
    ) {
      maleScore += 14;
      reasons.push('meaning_speaker_male');
    }
  }

  // 3. Original Foreign Dialogue Text (Chinese / English)
  if (orig) {
    if (
      orig.includes('姑娘') ||
      orig.includes('小姐') ||
      orig.includes('姐姐') ||
      orig.includes('妹妹') ||
      orig.includes('妈妈') ||
      orig.includes('母亲') ||
      orig.includes('阿娘') ||
      orig.includes('娘亲') ||
      orig.includes('夫人') ||
      orig.includes('太太') ||
      orig.includes('老婆') ||
      orig.includes('娘子') ||
      orig.includes('王妃') ||
      orig.includes('皇后') ||
      orig.includes('贵妃') ||
      orig.includes('娘娘') ||
      orig.includes('公主') ||
      orig.includes('郡主') ||
      orig.includes('丫鬟') ||
      orig.includes('侍女') ||
      orig.includes('婢女') ||
      orig.includes('女') ||
      orig.includes('她') ||
      orig.includes('臣妾') ||
      orig.includes('奴婢') ||
      orig.includes('民女') ||
      orig.includes('妾身') ||
      orig.includes('林昭') ||
      orig.includes('昭昭') ||
      orig.includes('苏玉玲') ||
      /\b(she|her|hers|woman|women|girl|girls|lady|ladies|miss|mrs|ms|queen|princess|mother|mom|daughter|sister|female|heroine|maid|actress|wife)\b/i.test(orig)
    ) {
      femaleScore += 10;
      reasons.push('orig_text_female');
    }

    if (
      orig.includes('公子') ||
      orig.includes('少爷') ||
      orig.includes('哥哥') ||
      orig.includes('弟弟') ||
      orig.includes('兄弟') ||
      orig.includes('大哥') ||
      orig.includes('爸爸') ||
      orig.includes('父亲') ||
      orig.includes('爹') ||
      orig.includes('大人') ||
      orig.includes('老爷') ||
      orig.includes('王爷') ||
      orig.includes('皇上') ||
      orig.includes('陛下') ||
      orig.includes('殿下') ||
      orig.includes('将军') ||
      orig.includes('侯爷') ||
      orig.includes('师傅') ||
      orig.includes('师兄') ||
      orig.includes('男') ||
      orig.includes('他') ||
      orig.includes('微臣') ||
      orig.includes('属下') ||
      orig.includes('末将') ||
      orig.includes('奴才') ||
      /\b(he|him|his|man|men|boy|boys|sir|mr|king|prince|father|dad|son|brother|male|hero|lord|actor|husband|emperor|general)\b/i.test(orig)
    ) {
      maleScore += 10;
      reasons.push('orig_text_male');
    }
  }

  return {
    femaleScore,
    maleScore,
    reason: reasons.join(','),
  };
}

/**
 * Detects gender for a single segment.
 * If forceRecompute is false and segment already has explicit gender metadata,
 * preserves existing gender. Otherwise uses deep linguistic and character scoring.
 */
export function detectSegmentGender(
  seg: SegmentGenderInput,
  options?: DetectGenderOptions
): 'male' | 'female' {
  const forceRecompute = !!options?.forceRecompute;

  // If not forcing recomputation, check if an explicit gender is already set
  if (!forceRecompute && seg.gender) {
    const g = String(seg.gender).toLowerCase().trim();
    if (g === 'female' || g.includes('fem') || g.includes('ស្រី') || g.includes('woman') || g.includes('girl')) {
      return 'female';
    }
    if (g === 'male' || g.includes('ប្រុស') || g.includes('man') || g.includes('boy')) {
      return 'male';
    }
  }

  // Evaluate scores based on Khmer linguistics, character roles, foreign text
  const { femaleScore, maleScore } = evaluateSegmentScores(seg);

  if (femaleScore > maleScore) {
    return 'female';
  }
  if (maleScore > femaleScore) {
    return 'male';
  }

  // Tiebreaker or unclassified: check voiceProfile or previous gender if present
  if (seg.voiceProfile) {
    if (seg.voiceProfile.includes('Sreymom')) return 'female';
    if (seg.voiceProfile.includes('Piseth')) return 'male';
  }
  if (seg.gender) {
    const g = String(seg.gender).toLowerCase().trim();
    if (g.includes('fem') || g.includes('ស្រី')) return 'female';
  }

  return 'male'; // standard fallback
}

/**
 * Multi-pass global gender detection across all subtitle segments:
 * 1. Evaluates all segments for high-confidence linguistic & role markers.
 * 2. Learns character names from `meaning` field (e.g. "昭昭" is female) and propagates
 *    consistent voice assignment to all lines spoken by that character.
 * 3. Smooths dialogue turns in conversational back-and-forth sequences.
 * 4. Returns updated segments with accurate `gender` and `voiceProfile`.
 */
export function detectAllSegmentsGender<T extends SegmentGenderInput>(
  segments: T[],
  options?: DetectGenderOptions
): T[] {
  if (!segments || segments.length === 0) return [];

  // Pass 1: Score each segment and accumulate character name evidence
  const segmentScores = segments.map((seg) => evaluateSegmentScores(seg));
  const charFemaleEvidence = new Map<string, number>();
  const charMaleEvidence = new Map<string, number>();

  segments.forEach((seg, idx) => {
    const charName = (seg.meaning || '').trim();
    if (charName && charName !== 'តួស្រី' && charName !== 'តួប្រុស') {
      const score = segmentScores[idx];
      if (score.femaleScore > score.maleScore) {
        charFemaleEvidence.set(charName, (charFemaleEvidence.get(charName) || 0) + score.femaleScore);
      } else if (score.maleScore > score.femaleScore) {
        charMaleEvidence.set(charName, (charMaleEvidence.get(charName) || 0) + score.maleScore);
      }
    }
  });

  // Pass 2: Determine resolved gender for each segment
  const resolvedGenders: Array<'male' | 'female'> = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const score = segmentScores[i];
    const charName = (seg.meaning || '').trim();

    // A. Character name propagation from accumulated evidence
    if (charName && (charFemaleEvidence.has(charName) || charMaleEvidence.has(charName))) {
      const fVotes = charFemaleEvidence.get(charName) || 0;
      const mVotes = charMaleEvidence.get(charName) || 0;
      if (fVotes > mVotes) {
        resolvedGenders.push('female');
        continue;
      }
      if (mVotes > fVotes) {
        resolvedGenders.push('male');
        continue;
      }
    }

    // B. Direct high-confidence segment score
    if (score.femaleScore > score.maleScore) {
      resolvedGenders.push('female');
      continue;
    }
    if (score.maleScore > score.femaleScore) {
      resolvedGenders.push('male');
      continue;
    }

    // C. Meaning direct keyword match
    const meaning = (seg.meaning || '').toLowerCase();
    if (meaning.includes('ស្រី') || meaning.includes('female') || meaning.includes('sreymom') || meaning.includes('女')) {
      resolvedGenders.push('female');
      continue;
    }
    if (meaning.includes('ប្រុស') || meaning.includes('male') || meaning.includes('piseth') || meaning.includes('男')) {
      resolvedGenders.push('male');
      continue;
    }

    // D. Dialogue turn heuristic:
    // If this line is adjacent (< 3.0s gap) to a confirmed female line in an alternating exchange,
    // and this line does not repeat the same speaker, check dialogue flow
    const prevGender = i > 0 ? resolvedGenders[i - 1] : null;
    const prevSeg = i > 0 ? segments[i - 1] : null;
    const timeGap = prevSeg && typeof seg.startTime === 'number' && typeof prevSeg.endTime === 'number'
      ? seg.startTime - prevSeg.endTime
      : 99;

    // If rapid conversation (< 2.5s gap) and previous line was female, but this line has no female words:
    // Check if previous line had female affirmations like "ចាស" and this line has questions/statements
    if (timeGap >= 0 && timeGap < 2.5 && prevGender === 'female' && score.femaleScore === 0) {
      // Alternating dialogue response -> male speaker
      resolvedGenders.push('male');
      continue;
    }

    // E. Default to male fallback
    resolvedGenders.push('male');
  }

  // Update segments with resolved gender and corresponding voice profile
  return segments.map((seg, idx) => {
    const gender = resolvedGenders[idx];
    const voiceProfile: 'km-KH-PisethNeural' | 'km-KH-SreymomNeural' =
      gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural';
    return {
      ...seg,
      gender,
      voiceProfile,
    };
  });
}
