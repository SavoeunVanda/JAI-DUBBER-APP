import { SubtitleSegment } from '../types';
import { smartAlignTimelineSegments } from './timeFormat';
import { cleanKhmerDialogueText } from './khmerCleaner';
// This module is the OFFLINE fallback, used only when the Express server is not
// reachable (e.g. the packaged standalone .exe). It has no ffmpeg, so unlike the
// server pipeline it must ask Gemini for timestamps and is correspondingly less
// precise. Kept deliberately self-contained.
const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.5-transcribe',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
] as const;

const FEMALE_VOICE = 'km-KH-SreymomNeural';
const MALE_VOICE = 'km-KH-PisethNeural';

const SUBTITLE_RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      startTime: { type: 'number', description: 'Seconds from the start of the audio when the speaker begins.' },
      endTime: { type: 'number', description: 'Seconds from the start of the audio when the speaker stops.' },
      text: { type: 'string', description: 'The Khmer translation, in Khmer script only.' },
      originalText: { type: 'string', description: 'The original spoken words, verbatim.' },
      gender: { type: 'string', enum: ['male', 'female'] },
      voiceProfile: { type: 'string', enum: [MALE_VOICE, FEMALE_VOICE] },
    },
    required: ['startTime', 'endTime', 'text', 'gender', 'voiceProfile'],
  },
} as const;

function buildFallbackPrompt(videoDuration?: number, videoTitle?: string): string {
  return [
    'You are an elite Cambodian film & drama dubbing master and translator (អ្នកដឹកនាំបញ្ចេញបញ្ចូលសំឡេងភាពយន្តភាគខ្មែរអាជីព).',
    `Carefully listen to this entire audio track${videoTitle ? ` from "${videoTitle}"` : ''} and transcribe/translate with extreme cinematic accuracy:`,
    videoDuration ? `[រយៈពេលកំណត់ និងបរិបទនៃសាច់រឿង (Duration & Scene Context)]\nTHE AUDIO IS EXACTLY ${videoDuration.toFixed(2)} SECONDS LONG (${Math.round(videoDuration * 1000)} ms). No timestamp may exceed this.` : '',
    '',
    'RULES FOR KHMER TRANSLATION & VOICEOVER (ភាសាខ្មែរពិតប្រាកដ និងត្រឹមត្រូវតាមក្បួនខ្នាត):',
    '1. COMPLETE COVERAGE (ហាមរំលងការសន្ទនា): Transcribe and translate 100% of all spoken dialogue throughout the whole audio from start to finish. Never skip, omit, merge, or leave out any dialogue line.',
    '2. CONCISE & DURATION-MATCHED DIALOGUE (ខ្លីខ្លឹម ចំៗ ហាមបន្លាយវែង): Dialogue MUST BE SHORT, PUNCHY, AND DIRECT to match the actor\'s lips and pacing. Word limits: 1s speech: 2-3 words, 2s speech: 4-6 words, 3s speech: 6-8 words. Never use verbose literary padding.',
    '3. NATURAL EVERYDAY SPOKEN KHMER (ភាសានិយាយសាមញ្ញ ងាយយល់ ខ្មែរធ្លាប់ឮ ហាមពាក្យចម្លែក): Translate idioms to natural spoken meaning (烦死了 -> "រំខានណាស់!", 闭嘴 -> "បិទមាត់ទៅ!", 给我滚 -> "ចេញទៅ!", 救命 -> "ជួយផង!"). Strictly NO Thai loan words (write "រំខាន", NEVER "រំាខាញ").',
    '4. ROYAL & HISTORICAL DRAMA VOCABULARY: Use "ទូលព្រះបង្គំ" or "ទូលបង្គំ" (NEVER "ទូលបង្គាប់"!), "ព្រះករុណា", "ព្រះអង្គ", "ខ្ញុំម្ចាស់", "ក្រាបទូល".',
    '5. 100% PURE KHMER CHARACTERS ONLY: "text" MUST be 100% pure Khmer text. No Chinese characters, Thai script, or English letters. Transliterate all names into Khmer script only.',
    '6. SPELL OUT ALL NUMBERS: Always write numbers in Khmer words ("មួយ", "ពីរ", "បី", "បួន"...).',
    `7. "gender": strictly "female" or "male", with "voiceProfile" set to ${FEMALE_VOICE} or ${MALE_VOICE} to match.`,
    '8. Precise timestamps ("startTime" and "endTime" in seconds matching vocal onset and offset).',
    '9. Return an empty array if there is no intelligible speech.',
  ]
    .filter(Boolean)
    .join('\n');
}

const CLIENT_MODELS = GEMINI_MODELS;

/**
 * Gemini accepts the key either as a ?key= query param or as an x-goog-api-key
 * header. We use the header so the secret never lands in browser history,
 * referrer strings, or any intermediary's request log.
 */
function geminiRequestInit(apiKey: string, body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey.trim(),
    },
    body: JSON.stringify(body),
    signal,
  };
}

/**
 * Validate a Gemini API Key directly from client/browser (ideal for standalone .exe / desktop build)
 */
export async function validateGeminiKeyDirect(apiKey: string): Promise<{ valid: boolean; message: string }> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return { valid: false, message: 'សូមបញ្ចូល API Key' };
  }

  let lastErrorMsg = 'API Key មិនត្រឹមត្រូវ ឬផុត Quota';

  for (const model of CLIENT_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(
        url,
        geminiRequestInit(trimmedKey, {
          contents: [{ parts: [{ text: 'Hello, respond with OK' }] }],
        })
      );

      const data = await response.json();
      if (response.ok && data.candidates && data.candidates.length > 0) {
        return {
          valid: true,
          message: `API Key ដំណើរការបានយ៉ាងល្អ (Direct Model: ${model})`
        };
      }

      if (data.error?.message) {
        lastErrorMsg = data.error.message;
        // If quota exceeded or invalid key
        if (data.error.status === 'RESOURCE_EXHAUSTED' || data.error.code === 429) {
          lastErrorMsg = 'API Key នេះផុត Quota ហើយ (Resource Exhausted / Rate Limit)';
        } else if (data.error.status === 'INVALID_ARGUMENT' || data.error.code === 400) {
          lastErrorMsg = 'API Key មិនត្រឹមត្រូវ (API_KEY_INVALID)';
        }
      }
    } catch (err: any) {
      lastErrorMsg = err?.message || 'មិនអាចភ្ជាប់ទៅកាន់ Google Gemini Server បានទេ (សូមពិនិត្យមើល Internet)';
    }
  }

  return { valid: false, message: lastErrorMsg };
}

/**
 * Direct Client-Side Gemini Transcription & Translation fallback
 */
export async function transcribeGeminiDirect(params: {
  prompt?: string;
  mediaData?: string;
  mimeType?: string;
  apiKeys: string[];
  geminiModel?: string;
  videoDuration?: number;
  currentTitle?: string;
  signal?: AbortSignal;
}): Promise<SubtitleSegment[]> {
  const {
    prompt,
    mediaData,
    mimeType,
    apiKeys,
    geminiModel,
    videoDuration,
    currentTitle,
    signal,
  } = params;

  if (!apiKeys || apiKeys.length === 0) {
    throw new Error('សូមបញ្ចូល Gemini API Key នៅក្នុង Settings ជាមុនសិន!');
  }
  // Audio-only, matching the server: never translate subtitle text as a stand-in
  // for dialogue we could not actually hear.
  if (!mediaData) {
    throw new Error('រកមិនឃើញសំឡេងពីវីដេអូទេ។ ការ Transcribe ធ្វើឡើងពីសំឡេងក្នុងវីដេអូតែម្តង។');
  }

  const isMultimodal = true;

  const systemPrompt = buildFallbackPrompt(videoDuration, currentTitle);
  const userMsg =
    prompt ||
    'Transcribe and translate every spoken line into Khmer script for video dubbing.';

  const contentsParts: any[] = [];
  if (mediaData) {
    let rawBase64 = mediaData;
    if (rawBase64.includes('base64,')) {
      rawBase64 = rawBase64.split('base64,')[1];
    }
    contentsParts.push({
      inlineData: {
        data: rawBase64.trim(),
        mimeType: mimeType || 'video/mp4',
      },
    });
  }
  contentsParts.push({ text: `${systemPrompt}

${userMsg}` });

  const requestBody = {
    contents: [{ parts: contentsParts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SUBTITLE_RESPONSE_SCHEMA,
    },
  };

  let lastErr: any = null;
  const modelsToTry = geminiModel ? [geminiModel] : CLIENT_MODELS;

  for (const apiKey of apiKeys) {
    for (const model of modelsToTry) {
      if (signal?.aborted) {
        throw new DOMException('Transcription aborted', 'AbortError');
      }
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const resp = await fetch(url, geminiRequestInit(apiKey, requestBody, signal));

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `HTTP error ${resp.status}`);
        }

        const data = await resp.json();
        let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (textResult.startsWith('```')) {
          textResult = textResult.replace(/^```(json)?/, '').replace(/```$/, '').trim();
        }
        if (!textResult) {
          throw new Error('Gemini returned an empty response body');
        }

        const parsed = JSON.parse(textResult);
        const rawList = Array.isArray(parsed) ? parsed : parsed.subtitles || parsed.segments || [];
        if (!rawList || rawList.length === 0) {
          // No speech found is a real answer, not a key failure — stop here
          // instead of burning the rest of the rotation on the same audio.
          return [];
        }

        const mappedSubs: SubtitleSegment[] = rawList
          .map((item: any, idx: number) => {
            let s = typeof item.startTime === 'number' ? item.startTime : parseFloat(item.startTime);
            let e = typeof item.endTime === 'number' ? item.endTime : parseFloat(item.endTime);
            if (isNaN(s) || s < 0) s = idx * 3.5;
            if (isNaN(e) || e <= s + 0.4) e = s + 3.0;
            const text = cleanKhmerDialogueText(item.text || item.originalText || '');
            const gender: 'male' | 'female' =
              String(item.gender || '').toLowerCase() === 'female' ? 'female' : 'male';
            return {
              id: `sub_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
              startTime: Math.max(0, Math.round(s * 100) / 100),
              endTime: Math.round(e * 100) / 100,
              text,
              originalText: item.originalText || '',
              gender,
              voiceProfile: gender === 'female' ? FEMALE_VOICE : MALE_VOICE,
              speed: 1.0,
              isChecked: true,
            } as SubtitleSegment;
          })
          .filter((sub: SubtitleSegment) => (sub.text || '').length > 0);

        return smartAlignTimelineSegments(mappedSubs, videoDuration || 0);
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        lastErr = err;
      }
    }
  }

  throw lastErr || new Error('មិនអាចបកប្រែតាម Gemini API បានទេ។ សូមពិនិត្យមើល API Key របស់អ្នក។');
}

/**
 * Direct Client-Side Audio TTS Synthesis Fallback (uses Google Translate TTS Khmer audio stream)
 */
export async function synthesizeKhmerTTSDirect(text: string): Promise<Blob> {
  const cleanText = ' ' + text.trim();
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=km&client=tw-ob&q=${encodeURIComponent(cleanText)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Client TTS failed with status ${resp.status}`);
  }
  return await resp.blob();
}
