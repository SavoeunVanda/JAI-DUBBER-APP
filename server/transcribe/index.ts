import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import { probeMedia, extractAudioTrack, extractAudioSlice } from './media';
import {
  GEMINI_MODELS,
  SUPPORTED_GEMINI_MODELS,
  StoryAnalysisContext,
  StoryCharacter,
  CharacterRelationship,
  normalizeGeminiModelId,
  buildGlobalStoryAndCharacterAnalysisPrompt,
  buildStoryEnrichedDialoguePrompt,
  buildKhmerTranscriptionPrompt,
  buildGeminiStoryAnalysisPrompt,
} from './prompt';
import { FOREIGN_OR_DIRTY_REGEX, cleanKhmerDialogueText } from './cleaner';
import { getFFmpegPath } from '../ffmpegBin';
import { runWhisperTranscription, isWhisperAvailable } from '../whisperBridge';
import { detectSegmentGender } from '../../src/utils/genderDetector';
import { detectAudioPitchGenders } from '../pitchBridge';

export class TranscribeError extends Error {
  code: string;
  httpStatus: number;

  constructor(message: string, code = 'TRANSCRIBE_ERROR', httpStatus = 500) {
    super(message);
    this.name = 'TranscribeError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface TranscribeSubtitleRow {
  id?: string;
  startTime: number;
  endTime: number;
  text: string;
  originalText?: string;
  meaning?: string;
  voiceProfile: string;
  gender: 'male' | 'female';
}

export interface TranscribeProgressEvent {
  stage:
    | 'preparing'
    | 'extracting'
    | 'probing'
    | 'detecting'
    | 'planned'
    | 'reading'
    | 'analyzing_story'
    | 'story_analyzed'
    | 'translating'
    | 'chunk'
    | 'chunkDone'
    | 'transcribing'
    | 'batchDone'
    | 'key'
    | 'model_switch'
    | 'waiting';
  message?: string;
  batch?: number;
  batches?: number;
  chunkIndex?: number;
  totalChunks?: number;
  completed?: number;
  rows?: TranscribeSubtitleRow[];
  keyIndex?: number;
  keyLabel?: string;
  model?: string;
}

export interface TranscribeOptions {
  engine?: 'fast-whisper' | 'srt' | 'measured';
  apiKeys: string[];
  preferredModel?: string;
  prompt?: string;
  videoTitle?: string;
  sourceLanguage?: string;
  isCancelled?: () => boolean;
  onProgress?: (event: TranscribeProgressEvent) => void;
  tuning?: Record<string, number>;
}

export interface TranscribeResult {
  rows: TranscribeSubtitleRow[];
  durationSeconds: number;
  utteranceCount: number;
  batchCount: number;
  emptyUtterances: number;
  usedKeyIndex: number;
  autoRotated: boolean;
}

export interface SpeechUtterance {
  start: number;
  end: number;
}

export interface DetectSpeechResult {
  durationSeconds: number;
  utterances: SpeechUtterance[];
  srtPreview?: string;
}

/**
 * Parses silences in an audio/video file using ffmpeg silencedetect filter.
 */
export async function detectSpeechTimings(
  filePath: string,
  overrides?: Record<string, number>
): Promise<DetectSpeechResult> {
  const probe = await probeMedia(filePath);
  const totalDuration = probe.durationSeconds || 0;

  const minSilenceSec = overrides?.minSilenceSeconds ?? 0.35;
  const maxUtteranceSec = overrides?.maxUtteranceSeconds ?? 10.0;
  const minUtteranceSec = overrides?.minUtteranceSeconds ?? 0.3;
  const leadIn = overrides?.leadInSeconds ?? 0.05;
  const tailOut = overrides?.tailOutSeconds ?? 0.05;

  return new Promise((resolve, reject) => {
    // Run ffmpeg silencedetect to locate quiet breaks between dialogue
    const ffmpegBin = getFFmpegPath();
    const cmd = `"${ffmpegBin}" -i "${filePath.replace(/"/g, '\\"')}" -af silencedetect=noise=-30dB:d=${minSilenceSec} -f null -`;
    exec(cmd, (err, _stdout, stderr) => {
      // ffmpeg output for silencedetect goes to stderr
      const silences: Array<{ start: number; end: number }> = [];
      const lines = (stderr || '').split('\n');
      let currentSilenceStart: number | null = null;

      for (const line of lines) {
        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        if (startMatch) {
          currentSilenceStart = parseFloat(startMatch[1]);
        }
        const endMatch = line.match(/silence_end:\s*([\d.]+)/);
        if (endMatch && currentSilenceStart !== null) {
          const end = parseFloat(endMatch[1]);
          silences.push({ start: currentSilenceStart, end });
          currentSilenceStart = null;
        }
      }

      // Convert silences into speech intervals
      const utterances: SpeechUtterance[] = [];
      let cursor = 0;

      for (const s of silences) {
        const speechStart = Math.max(0, cursor - leadIn);
        const speechEnd = Math.min(totalDuration, s.start + tailOut);
        if (speechEnd - speechStart >= minUtteranceSec) {
          // If the speech segment is excessively long, slice it into digestible pieces
          let chunkStart = speechStart;
          while (chunkStart < speechEnd) {
            const chunkEnd = Math.min(speechEnd, chunkStart + maxUtteranceSec);
            utterances.push({
              start: Math.round(chunkStart * 100) / 100,
              end: Math.round(chunkEnd * 100) / 100,
            });
            chunkStart = chunkEnd;
          }
        }
        cursor = s.end;
      }

      // Add final speech block if any
      if (cursor < totalDuration) {
        const speechStart = Math.max(0, cursor - leadIn);
        const speechEnd = totalDuration;
        if (speechEnd - speechStart >= minUtteranceSec) {
          let chunkStart = speechStart;
          while (chunkStart < speechEnd) {
            const chunkEnd = Math.min(speechEnd, chunkStart + maxUtteranceSec);
            utterances.push({
              start: Math.round(chunkStart * 100) / 100,
              end: Math.round(chunkEnd * 100) / 100,
            });
            chunkStart = chunkEnd;
          }
        }
      }

      // If no silences were detected or the whole audio was detected as one continuous stream
      if (utterances.length === 0 && totalDuration > 0) {
        let chunkStart = 0;
        const segmentSize = Math.min(totalDuration, maxUtteranceSec || 6.0);
        while (chunkStart < totalDuration) {
          const chunkEnd = Math.min(totalDuration, chunkStart + segmentSize);
          utterances.push({
            start: Math.round(chunkStart * 100) / 100,
            end: Math.round(chunkEnd * 100) / 100,
          });
          chunkStart = chunkEnd;
        }
      }

      // Format SRT preview for user inspection
      let srtPreview = '';
      utterances.forEach((u, idx) => {
        const formatSrtTime = (sec: number) => {
          const hrs = Math.floor(sec / 3600).toString().padStart(2, '0');
          const mins = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
          const s = Math.floor(sec % 60).toString().padStart(2, '0');
          const ms = Math.round((sec % 1) * 1000).toString().padStart(3, '0');
          return `${hrs}:${mins}:${s},${ms}`;
        };
        srtPreview += `${idx + 1}\n${formatSrtTime(u.start)} --> ${formatSrtTime(u.end)}\n[សំឡេងនិយាយ ${idx + 1}]\n\n`;
      });

      resolve({
        durationSeconds: totalDuration,
        utterances,
        srtPreview,
      });
    });
  });
}

/**
 * Preserves each spoken utterance as a separate subtitle segment based on the actor's vocal spaces/pauses
 * (បំបែក Segment នីមួយៗតាមចន្លោះសំឡេងនិយាយ ឬការផ្អាកដកដង្ហើមរបស់តួអង្គ).
 *
 * Each vocal utterance where the actor speaks between vocal spaces / breath breaks remains its own
 * distinct segment. Timestamps are cleanly aligned so segments do not collide or overlap on the timeline.
 */
export function separateSegmentsByVocalSpaces(
  rows: TranscribeSubtitleRow[]
): TranscribeSubtitleRow[] {
  if (!rows || rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => a.startTime - b.startTime);
  const result: TranscribeSubtitleRow[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const row = { ...sorted[i] };
    const text = (row.text || '').trim();
    if (!text) continue;

    // Ensure valid duration
    if (row.endTime <= row.startTime) {
      row.endTime = Number((row.startTime + 0.5).toFixed(2));
    }

    result.push(row);
  }

  // Handle segment timings:
  // Strictly prevent any overlap between consecutive segments so actors never talk over each other.
  // Leave a clean buffer of at least 0.05s before the next segment starts.
  for (let i = 0; i < result.length - 1; i++) {
    const current = result[i];
    const next = result[i + 1];

    // Ensure next starts after current starts
    if (next.startTime < current.startTime + 0.2) {
      next.startTime = Number((current.startTime + 0.2).toFixed(2));
    }

    // If current extends into next, clamp current.endTime
    if (current.endTime > next.startTime - 0.04) {
      current.endTime = Number((next.startTime - 0.05).toFixed(2));
      // Ensure current has a minimum duration of 0.25s
      if (current.endTime <= current.startTime) {
        current.endTime = Number((current.startTime + 0.25).toFixed(2));
        next.startTime = Number((current.endTime + 0.05).toFixed(2));
      }
    }

    // Ensure next.endTime is greater than next.startTime
    if (next.endTime <= next.startTime) {
      next.endTime = Number((next.startTime + 0.3).toFixed(2));
    }
  }

  return result;
}

/**
 * Backward compatibility alias: now separates segments strictly based on actor vocal spaces/pauses.
 */
export function mergeIntoParagraphSegments(
  rows: TranscribeSubtitleRow[],
  _maxGapSeconds = 0.2,
  _maxParagraphDuration = 9.5
): TranscribeSubtitleRow[] {
  return separateSegmentsByVocalSpaces(rows);
}

/**
 * Backward compatibility alias for mergeIntoParagraphSegments.
 */
export function mergeConsecutiveSpeakerTurns(
  rows: TranscribeSubtitleRow[],
  _maxTurnGapSeconds = 0.2
): TranscribeSubtitleRow[] {
  return separateSegmentsByVocalSpaces(rows);
}

/**
 * Transcribes and dubs video audio into Khmer subtitles with timestamp precision using Gemini API.
 */
export async function transcribeVideo(
  sourcePath: string,
  options: TranscribeOptions
): Promise<TranscribeResult> {
  const {
    apiKeys,
    preferredModel,
    prompt: customPrompt,
    videoTitle,
    sourceLanguage = 'English',
    isCancelled,
    onProgress,
  } = options;

  const envKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';

  // Normalize, clean quotes, whitespace, Bearer prefix, and filter empty keys
  const cleanedKeys = (apiKeys || [])
    .map((k) => String(k || '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim())
    .filter(Boolean);

  // If a key starts with ya29., it is a Google OAuth access token, not a Gemini API Key.
  // Filter out ya29. tokens if other keys exist.
  let candidateKeys = cleanedKeys.filter((k) => !k.startsWith('ya29.'));
  if (candidateKeys.length === 0 && cleanedKeys.length > 0) {
    candidateKeys = cleanedKeys;
  }
  if (envKey && !candidateKeys.includes(envKey)) {
    candidateKeys.push(envKey);
  }

  if (candidateKeys.length === 0) {
    throw new TranscribeError('សូមបញ្ចូល Google Gemini API Key ដើម្បី Transcribe', 'NO_API_KEY', 400);
  }

  // Lock strictly to user-selected model: use ONLY this model without switching
  const initialModel = normalizeGeminiModelId(preferredModel);

  // Note: gemini-3.5-transcribe is an Audio Speech-to-Text model (Live API) and strictly forbids
  // JSON mode on Google API ("JSON mode is not enabled for this model").
  // When running text translation or story analysis, route automatically to gemini-3.5-flash-lite.
  const isTranscribeModel = initialModel.toLowerCase().includes('transcribe');
  const translationModel = isTranscribeModel ? 'gemini-3.5-flash-lite' : initialModel;
  const candidateModels = [translationModel];
  let currentModelIdx = 0;

  onProgress?.({
    stage: 'probing',
    message: '🔍 កំពុងពិនិត្យមើលទ្រង់ទ្រាយវីដេអូ និងសំឡេង...',
  });

  const probe = await probeMedia(sourcePath);
  const totalDuration = probe.durationSeconds || 0;

  if (totalDuration <= 0) {
    throw new TranscribeError('មិនអាចស្វែងរកប្រវែងវីដេអូបានទេ', 'INVALID_MEDIA', 400);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jai_transcribe_'));

  try {
    onProgress?.({
      stage: 'extracting',
      message: '🎵 កំពុងស្រង់សំឡេងចេញពីវីដេអូ...',
    });

    const fullAudioPath = path.join(tempDir, 'full_audio.mp3');
    await extractAudioTrack(sourcePath, fullAudioPath);

    if (isCancelled?.()) {
      throw new Error('Cancelled');
    }

    const effectiveEngine = options.engine === 'srt' ? 'srt' : 'fast-whisper';

    if (effectiveEngine === 'fast-whisper') {
      try {
        const whisperStoryResult = await transcribeFastWhisperAndGeminiStory({
          fullAudioPath,
          totalDuration,
          candidateKeys,
          candidateModels,
          options,
        });
        if (whisperStoryResult.rows && whisperStoryResult.rows.length > 0) {
          return whisperStoryResult;
        }
        console.warn('Fast-Whisper returned 0 rows! Automatically falling back to Gemini Multimodal Audio SRT...');
      } catch (whisperErr: any) {
        console.warn('Fast-Whisper error, falling back to Gemini SRT:', whisperErr?.message || whisperErr);
      }
      onProgress?.({
        stage: 'model_switch',
        message: '⚠️ Fast-Whisper មិនបានផល — កំពុងប្ដូរទៅប្រើ Gemini AI ស្តាប់សំឡេងវីដេអូជាកង់ៗ (៥០វិ-១នាទី)...',
      });
      return await transcribeGeminiSrtAudio({
        fullAudioPath,
        totalDuration,
        tempDir,
        candidateKeys,
        candidateModels,
        options,
      });
    } else {
      return await transcribeGeminiSrtAudio({
        fullAudioPath,
        totalDuration,
        tempDir,
        candidateKeys,
        candidateModels,
        options,
      });
    }
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

/**
 * Automatically detects any missing text or foreign/Thai/Chinese characters in dialogue rows and translates them
 * into 100% pure Khmer text with phonetic character names transliteration.
 */
/**
 * Helper: robustly parses JSON from Gemini responses, handling markdown code fences,
 * preamble/postscript text, and both array and object formats.
 */
function robustJsonParse(rawText: string): any {
  if (!rawText) return null;
  const cleaned = rawText
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  // 1. Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {}

  // 2. Try array parse if brackets exist
  const startArr = cleaned.indexOf('[');
  const endArr = cleaned.lastIndexOf(']');
  if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
    try {
      return JSON.parse(cleaned.substring(startArr, endArr + 1));
    } catch {}
  }

  // 3. Try object parse if braces exist
  const startObj = cleaned.indexOf('{');
  const endObj = cleaned.lastIndexOf('}');
  if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
    try {
      return JSON.parse(cleaned.substring(startObj, endObj + 1));
    } catch {}
  }

  return null;
}

/**
 * Parses timestamps in various formats (float seconds, "HH:MM:SS", "MM:SS", "00:01:23,456", "1.5s").
 */
export function parseFlexibleTimestamp(val: any): number {
  if (typeof val === 'number') return Number.isFinite(val) ? Math.max(0, val) : 0;
  if (!val) return 0;
  const str = String(val).trim().replace(',', '.');
  if (str.includes(':')) {
    const parts = str.split(':').map((p) => parseFloat(p) || 0);
    if (parts.length === 3) {
      return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
    } else if (parts.length === 2) {
      return Math.max(0, parts[0] * 60 + parts[1]);
    }
  }
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

/**
 * Fallback parser extracting subtitle entries if Gemini returned SRT blocks instead of pure JSON.
 */
export function parseSrtSubtitlesFromText(text: string): any[] {
  if (!text || !text.includes('-->')) return [];
  const pattern = /(?:(\d+)\s*\r?\n)?(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}|\d{1,2}:\d{2}[,\.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}|\d{1,2}:\d{2}[,\.]\d{1,3})\s*\r?\n([\s\S]*?)(?=(?:\r?\n\s*\d+\s*\r?\n|\r?\n\s*\d{1,2}:\d{2}|\s*$))/g;
  const items: any[] = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const startStr = match[2];
    const endStr = match[3];
    const content = match[4].replace(/\r?\n/g, ' ').trim();
    if (content) {
      items.push({
        startTime: parseFlexibleTimestamp(startStr),
        endTime: parseFlexibleTimestamp(endStr),
        text: content,
      });
    }
  }
  return items;
}

/**
 * Automatically detects any missing text or foreign/Thai/Chinese characters in dialogue rows and translates them
 * into 100% pure Khmer text with phonetic character names transliteration.
 */
async function sanitizeAndTranslateForeignRows(
  rows: TranscribeSubtitleRow[],
  activeKeys: string[],
  currentModel: string,
  customGlossary?: Record<string, string>
): Promise<void> {
  const dirtyIndices: number[] = [];

  rows.forEach((r, idx) => {
    if (!r.text || r.text.trim().length === 0 || FOREIGN_OR_DIRTY_REGEX.test(r.text)) {
      dirtyIndices.push(idx);
    }
  });

  if (dirtyIndices.length > 0 && activeKeys.length > 0) {
    console.log(`[Sanitizer] Found ${dirtyIndices.length} rows with foreign/Thai/Chinese characters needing Khmer translation/cleanup.`);

    const dirtyItems = dirtyIndices
      .map((idx, i) => {
        const r = rows[idx];
        const sourceText = r.originalText || r.text || '';
        return `[Line ${i + 1}] ${sourceText}`;
      })
      .join('\n');

    const translatePrompt = `អ្នកគឺជាអ្នកបកប្រែសម្រិតសម្រាំងពាក្យពេចន៍ភាពយន្តជាភាសាខ្មែរសម្រាប់បញ្ចូលសំឡេង (Professional Film Dubbing Translator)។
សូមបកប្រែ ឬកែសម្រួលអត្ថបទសន្ទនាខាងក្រោមនេះទៅជាភាសាខ្មែរ ១០០% សុទ្ធសាធ (100% Pure Khmer Script Only - Unicode U+1780 ដល់ U+17FF)៖
=== DIALOGUES ===
${dirtyItems}
=== END ===

🚨 លក្ខខណ្ឌកំហិតដាច់ខាត (MANDATORY RULES):
១. ភាសាខ្មែរ ១០០% សុទ្ធសាធ (100% Pure Khmer Script Only):
   - ហាមដាច់ខាតមិនឱ្យមានអក្សរឡាតាំង/អង់គ្លេស/Pinyin សូម្បីតែមួយតួ (ដាច់ខាតមិនឱ្យមាន Qingyue, Lin, Xiao, Chen, Ye, CEO, etc.)!
   - ហាមដាច់ខាតមិនឱ្យមានអក្សរថៃ (Thai script) ឬអក្សរចិន (漢字) ដាច់ខាត!
   - ត្រូវតែជាអក្សរខ្មែរ ១០០% សុទ្ធសាធ សម្រាប់បញ្ចូលសំឡេង!
២. ឈ្មោះតួអង្គ ឈ្មោះទីកន្លែង និងឈ្មោះក្រុមហ៊ុនទាំងអស់ត្រូវតែសរសេរជាអក្សរខ្មែរតាមសូរសព្ទដើមឱ្យបានត្រឹមត្រូវ ១០០% (All Character Names and Places to Khmer Script Phonetically)៖
   - ឧទាហរណ៍៖ "Qingyue" ➔ "ឈីងយៀក" (ហាមសរសេរ "Qingyue ខ្ញុំ..." ដាច់ខាត! ត្រូវសរសេរ "ឈីងយៀក ខ្ញុំ...")
   - "Lin Tian" ➔ "លីនធាន", "Xiao Yan" ➔ "ស៊ាវយ៉ាន", "Su Yuling" ➔ "ស៊ូយីលីង", "Ye Chen" ➔ "យេឆឹង", "Gu Nan" ➔ "គូណាន"
   - ត្រូវបកប្រែពាក្យសន្ទនាឱ្យត្រូវតាមន័យ និងអារម្មណ៍សាច់រឿង (Natural film dubbing translation)។
៣. ត្រូវផ្ដល់ចម្លើយគ្រប់បន្ទាត់ពី Line 1 ដល់ Line ${dirtyIndices.length} ជា JSON Array:
[
  { "id": 1, "text": "អត្ថបទជាភាសាខ្មែរ ១០០% គ្មានអក្សរបរទេស", "gender": "male" | "female" }
]`;

    try {
      const client = new GoogleGenAI({ apiKey: activeKeys[0] });
      const effectiveModel = (currentModel || 'gemini-3.5-flash').toLowerCase().includes('transcribe')
        ? 'gemini-3.5-flash-lite'
        : (currentModel || 'gemini-3.5-flash');
      const res = await client.models.generateContent({
        model: effectiveModel,
        contents: [{ role: 'user', parts: [{ text: translatePrompt }] }],
        config: { responseMimeType: 'application/json' },
      });

      const parsed = robustJsonParse(res.text || '');
      let parsedList: any[] = [];
      if (Array.isArray(parsed)) parsedList = parsed;
      else if (parsed && typeof parsed === 'object') {
        for (const k of ['dialogues', 'lines', 'translations', 'subtitles', 'data', 'items']) {
          if (Array.isArray((parsed as any)[k])) {
            parsedList = (parsed as any)[k];
            break;
          }
        }
      }

      if (parsedList.length > 0) {
        dirtyIndices.forEach((targetRowIdx, i) => {
          const lineNum = i + 1;
          const match =
            parsedList.find((p: any) => Number(p.id) === lineNum || Number(p.line) === lineNum) ||
            parsedList[i];

          if (match && match.text && String(match.text).trim().length > 0) {
            rows[targetRowIdx].text = String(match.text).trim();
            if (match.gender === 'female' || match.gender === 'male') {
              rows[targetRowIdx].gender = match.gender;
              rows[targetRowIdx].voiceProfile =
                match.gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural';
            }
          }
        });
      }
    } catch (err) {
      console.warn('[Sanitizer] Secondary AI translation notice:', err);
    }
  }

  // Guaranteed clean pass: strictly clean dialogue text on EVERY row to ensure 100% Khmer
  rows.forEach((r) => {
    let cleaned = cleanKhmerDialogueText(r.text || r.originalText || '', customGlossary);
    if (!cleaned || cleaned.trim().length === 0) {
      cleaned = '...';
    }
    r.text = cleaned;
  });
}

/**
 * Phase 2A: Deep Global Story Context, Genre, and Character Cast Analysis.
 * Analyzes the full transcript to discover who the characters are, their relationships,
 * genders, Khmer name transliterations, and social hierarchy.
 */
async function analyzeStoryAndCharacters(params: {
  segments: Array<{ id: number; start: number; end: number; text: string }>;
  videoTitle?: string;
  customPrompt?: string;
  detectedLanguage?: string;
  activeKeys: string[];
  candidateModels: string[];
  isCancelled?: () => boolean;
  onProgress?: (event: any) => void;
}): Promise<{
  context: StoryAnalysisContext;
  activeKeys: string[];
  currentKeyIndex: number;
  currentModelIdx: number;
  autoRotated: boolean;
}> {
  const { segments, videoTitle, customPrompt, detectedLanguage, candidateModels, isCancelled, onProgress } = params;
  let activeKeys = [...params.activeKeys];
  let currentKeyIndex = 0;
  let currentModelIdx = 0;
  let autoRotated = false;

  const defaultContext: StoryAnalysisContext = {
    genre: 'Modern Drama',
    tone: 'modern',
    synopsis: videoTitle || 'ឈុតឆាកសន្ទនាក្នុងខ្សែភាពយន្ត',
    characters: [],
    glossary: {},
  };

  const storyPrompt = buildGlobalStoryAndCharacterAnalysisPrompt(segments, {
    videoTitle,
    customPrompt,
    detectedLanguage,
  });

  let attempts = 0;
  const maxAttempts = Math.max(12, activeKeys.length * candidateModels.length * 2);

  while (attempts < maxAttempts) {
    if (isCancelled?.()) throw new Error('Cancelled');
    if (activeKeys.length === 0) break;
    attempts++;

    currentKeyIndex = currentKeyIndex % activeKeys.length;
    const currentKey = activeKeys[currentKeyIndex];
    const rawModel = candidateModels[currentModelIdx] || 'gemini-3.5-flash';
    const currentModel = rawModel.toLowerCase().includes('transcribe') ? 'gemini-3.5-flash-lite' : rawModel;
    const client = new GoogleGenAI({ apiKey: currentKey });

    try {
      const response = await client.models.generateContent({
        model: currentModel,
        contents: [{ role: 'user', parts: [{ text: storyPrompt }] }],
        config: {
          responseMimeType: 'application/json',
          safetySettings: [
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
          ] as any,
        },
      });

      const parsed = robustJsonParse(response.text || '');
      if (parsed && typeof parsed === 'object') {
        const characters: StoryCharacter[] = Array.isArray(parsed.characters)
          ? parsed.characters.map((c: any) => ({
              originalName: String(c.originalName || '').trim(),
              khmerName: String(c.khmerName || c.name || '').trim(),
              gender: String(c.gender).toLowerCase() === 'female' ? ('female' as const) : ('male' as const),
              role: String(c.role || '').trim(),
              pronounsToUse: String(c.pronounsToUse || c.pronouns || '').trim(),
              voiceProfile:
                String(c.gender).toLowerCase() === 'female' ? ('km-KH-SreymomNeural' as const) : ('km-KH-PisethNeural' as const),
            }))
          : [];

        const relationships: CharacterRelationship[] = Array.isArray(parsed.relationships)
          ? parsed.relationships.map((r: any) => ({
              characterA: String(r.characterA || '').trim(),
              characterB: String(r.characterB || '').trim(),
              relationType: String(r.relationType || '').trim(),
              aToBPronoun: String(r.aToBPronoun || '').trim(),
              bToAPronoun: String(r.bToAPronoun || '').trim(),
              formality: r.formality,
            }))
          : [];

        const glossary: Record<string, string> =
          parsed.glossary && typeof parsed.glossary === 'object' && !Array.isArray(parsed.glossary)
            ? parsed.glossary
            : {};

        characters.forEach((c) => {
          if (c.originalName && c.khmerName && !glossary[c.originalName]) {
            glossary[c.originalName] = c.khmerName;
          }
        });

        const context: StoryAnalysisContext = {
          genre: String(parsed.genre || defaultContext.genre),
          tone:
            String(parsed.tone || '').includes('royal') || String(parsed.genre || '').includes('Royal')
              ? 'historical_royal'
              : String(parsed.tone || '').includes('wuxia') || String(parsed.genre || '').includes('Wuxia')
              ? 'historical_wuxia'
              : 'modern',
          synopsis: String(parsed.synopsis || defaultContext.synopsis),
          characters,
          relationships,
          glossary,
        };

        console.log(`[Story Analysis] Success! Genre: ${context.genre}, Characters: ${characters.length}, Relationships: ${relationships.length}, Glossary: ${Object.keys(glossary).length}`);
        return { context, activeKeys, currentKeyIndex, currentModelIdx, autoRotated };
      }
    } catch (err: any) {
      const errStr = String(err?.message || err);
      console.warn(`[Story Analysis] Attempt ${attempts} error with model ${currentModel}:`, errStr);

      const isAuth = errStr.includes('401') || errStr.includes('UNAUTHENTICATED') || errStr.includes('API_KEY_INVALID');
      const isQuota = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED');
      const isModel = errStr.includes('404') || errStr.includes('not found') || errStr.includes('is not supported');

      if (isAuth) {
        activeKeys = activeKeys.filter((k) => k !== currentKey);
        autoRotated = true;
        if (activeKeys.length > 0) {
          const nextIdx = currentKeyIndex % activeKeys.length;
          onProgress?.({
            stage: 'key',
            message: `⚠️ Key មិនត្រឹមត្រូវ (Auth Error) — បានដកចេញ និងប្តូរទៅ Key ${nextIdx + 1}...`,
            keyIndex: nextIdx + 1,
          });
          currentKeyIndex = nextIdx;
          continue;
        }
        break;
      }

      if (isQuota) {
        if (activeKeys.length > 1) {
          const failedIdx = currentKeyIndex + 1;
          currentKeyIndex = (currentKeyIndex + 1) % activeKeys.length;
          autoRotated = true;
          onProgress?.({
            stage: 'key',
            message: `🔄 Key ${failedIdx} ពេញកូតា — បានប្តូរទៅប្រើ Key ${currentKeyIndex + 1} (ម៉ូដែល ${currentModel})...`,
            keyIndex: currentKeyIndex + 1,
          });
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        const match = errStr.match(/retry in ([0-9.]+)s/i) || errStr.match(/retryDelay["']?:\s*["']?([0-9]+)s/i);
        const waitSec = match ? Math.min(30, Math.max(3, Math.ceil(parseFloat(match[1])))) : 10;
        onProgress?.({
          stage: 'waiting',
          message: `⏳ កូតា Gemini (${currentModel}) ពេញបណ្តោះអាសន្ន — កំពុងរង់ចាំ ${waitSec} វិនាទីដើម្បីបន្ត...`,
        });
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return { context: defaultContext, activeKeys, currentKeyIndex, currentModelIdx, autoRotated };
}

/**
 * Phase 1: Fast-Whisper extracts ground-truth timestamps and spoken dialogue with VAD.
 * Phase 2: Deep Story Context & Character Cast Analysis.
 * Phase 3: Story-Enriched Line-by-Line Dialogue Dubbing & Voice Assignment.
 */
async function transcribeFastWhisperAndGeminiStory(params: {
  fullAudioPath: string;
  totalDuration: number;
  candidateKeys: string[];
  candidateModels: string[];
  options: TranscribeOptions;
}): Promise<TranscribeResult> {
  const { fullAudioPath, totalDuration, candidateKeys, candidateModels, options } = params;
  const { videoTitle, prompt: customPrompt, sourceLanguage = 'auto', isCancelled, onProgress } = options;

  onProgress?.({
    stage: 'transcribing',
    message: '⚡ Fast-Whisper AI កំពុងស្ដាប់ និងស្រង់សំឡេងនិយាយក្នុងវីដេអូ (VAD Filter)...',
    chunkIndex: 1,
    totalChunks: 3,
    batch: 1,
    batches: 3,
  });

  const whisperLang =
    sourceLanguage &&
    sourceLanguage.toLowerCase() !== 'auto' &&
    sourceLanguage.toLowerCase() !== 'english'
      ? sourceLanguage
      : undefined;

  const whisperResult = await runWhisperTranscription(fullAudioPath, {
    model: 'large-v3-turbo',
    language: whisperLang,
    isCancelled,
    onProgress: (msg) => {
      onProgress?.({
        stage: 'transcribing',
        message: msg,
        chunkIndex: 1,
        totalChunks: 3,
        batch: 1,
        batches: 3,
      });
    },
  });

  const segments = whisperResult.segments || [];
  if (segments.length === 0) {
    onProgress?.({
      stage: 'chunkDone',
      message: 'ℹ️ រកមិនឃើញការសន្ទនាក្នុងវីដេអូនេះទេ (Whisper VAD មិនឃើញសំឡេងមនុស្សនិយាយ)',
      completed: 1,
      rows: [],
    });
    return {
      rows: [],
      durationSeconds: totalDuration,
      utteranceCount: 0,
      batchCount: 1,
      emptyUtterances: 0,
      usedKeyIndex: 0,
      autoRotated: false,
    };
  }

  // 1. Prepare numbered segments with 1-based global IDs
  const segmentsWithIds = segments.map((s, idx) => ({
    id: idx + 1,
    start: s.start,
    end: s.end,
    text: s.text,
  }));

  let activeKeys = [...candidateKeys];
  let currentKeyIndex = 0;
  let currentModelIdx = 0;
  let autoRotated = false;

  // 2. Phase 2: Deep Story, Character Cast & Relationship Analysis
  let storyContext: StoryAnalysisContext = {
    genre: 'General Drama',
    tone: 'modern',
    synopsis: videoTitle || '',
    characters: [],
    relationships: [],
    glossary: {},
  };

  if (segmentsWithIds.length >= 3 && activeKeys.length > 0) {
    onProgress?.({
      stage: 'analyzing_story',
      message: '🎭 Gemini AI កំពុងវិភាគសាច់រឿង កំណត់តួអង្គ ទំនាក់ទំនង និងសព្វនាម (Character & Pronoun Casting)...',
    });
    try {
      const storyRes = await analyzeStoryAndCharacters({
        segments: segmentsWithIds,
        videoTitle,
        customPrompt,
        detectedLanguage: whisperLang,
        activeKeys,
        candidateModels,
        isCancelled,
        onProgress,
      });
      storyContext = storyRes.context;
      activeKeys = storyRes.activeKeys;
      currentKeyIndex = storyRes.currentKeyIndex;
      currentModelIdx = storyRes.currentModelIdx;
      if (storyRes.autoRotated) autoRotated = true;
    } catch (storyErr: any) {
      console.warn('[Story Analysis] Graceful fallback to default context:', storyErr?.message || storyErr);
    }
  }

  // 4. បែងចែកជាកង់ៗ (Smart Chunk 35 Segments) ដើម្បីរក្សា Context បានល្អ និងមិនកាត់ផ្ដាច់
  const CHUNK_SIZE = 35;
  const batches: Array<typeof segmentsWithIds> = [];
  for (let i = 0; i < segmentsWithIds.length; i += CHUNK_SIZE) {
    batches.push(segmentsWithIds.slice(i, i + CHUNK_SIZE));
  }

  const totalBatches = batches.length;
  const allRows: TranscribeSubtitleRow[] = [];
  let lastContext: Array<{ id: number; speaker?: string; text: string }> = [];

  for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
    if (isCancelled?.()) throw new Error('Cancelled');

    const batchSegments = batches[bIdx];
    const nextBatch = batches[bIdx + 1];
    const upcomingPreview = nextBatch
      ? nextBatch.slice(0, 3).map((s) => ({ id: s.id, text: s.text }))
      : [];

    onProgress?.({
      stage: 'translating',
      message:
        totalBatches > 1
          ? `🤖 Gemini (${candidateModels[currentModelIdx]}) កំពុងបកប្រែពាក្យពេចន៍សន្ទនាជាភាសាខ្មែរ ផ្នែកទី ${bIdx + 1}/${totalBatches} (${batchSegments.length} បន្ទាត់ ចន្លោះ ៥០វិ-១នាទី)...`
          : `🤖 Gemini (${candidateModels[currentModelIdx]}) កំពុងបកប្រែពាក្យពេចន៍សន្ទនាជាភាសាខ្មែរ (${batchSegments.length} បន្ទាត់)...`,
      batch: bIdx + 1,
      batches: totalBatches,
      chunkIndex: bIdx + 1,
      totalChunks: totalBatches,
      completed: bIdx,
      keyIndex: currentKeyIndex + 1,
      model: candidateModels[currentModelIdx],
    });

    const dialoguePrompt = buildStoryEnrichedDialoguePrompt(batchSegments, storyContext, {
      videoTitle,
      customPrompt,
      sourceLanguage: whisperLang || 'auto',
      chunkNum: bIdx + 1,
      totalChunks: totalBatches,
      previousContext: lastContext,
      upcomingPreview,
    });

    let batchSuccess = false;
    let batchRows: TranscribeSubtitleRow[] = [];
    let attempts = 0;
    const maxAttempts = Math.max(25, activeKeys.length * candidateModels.length * 3);

    while (!batchSuccess && attempts < maxAttempts) {
      if (isCancelled?.()) throw new Error('Cancelled');
      if (activeKeys.length === 0) {
        throw new TranscribeError(
          'Gemini API Key មិនត្រឹមត្រូវ ឬអស់សុពលភាព។ សូមពិនិត្យមើល API Key ក្នុង Settings។',
          'AUTH_FAILED',
          401
        );
      }
      attempts++;

      currentKeyIndex = currentKeyIndex % activeKeys.length;
      const currentKey = activeKeys[currentKeyIndex];
      const rawModel = candidateModels[currentModelIdx] || 'gemini-3.5-flash';
      const currentModel = rawModel.toLowerCase().includes('transcribe') ? 'gemini-3.5-flash-lite' : rawModel;
      const client = new GoogleGenAI({ apiKey: currentKey });

      try {
        const response = await client.models.generateContent({
          model: currentModel,
          contents: [
            {
              role: 'user',
              parts: [{ text: dialoguePrompt }],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 8192,
            safetySettings: [
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
            ] as any,
          },
        });

        const parsed = robustJsonParse(response.text || '');
        let parsedRows: any[] = [];
        let detectedOverallVoice = 'male';
        if (Array.isArray(parsed)) {
          parsedRows = parsed;
        } else if (parsed && typeof parsed === 'object') {
          if (parsed.detected_voice) {
            detectedOverallVoice = String(parsed.detected_voice).toLowerCase().includes('fem') ? 'female' : 'male';
          }
          if (Array.isArray(parsed.items)) {
            parsedRows = parsed.items;
          } else {
            for (const key of ['items', 'dialogues', 'subtitles', 'translations', 'lines', 'data', 'rows']) {
              if (Array.isArray((parsed as any)[key])) {
                parsedRows = (parsed as any)[key];
                break;
              }
            }
          }
        }

        // Build robust numeric ID lookup map from Gemini's response
        const idMap = new Map<number, any>();
        for (const r of parsedRows) {
          if (!r || typeof r !== 'object') continue;
          const numId = typeof r.id === 'number' ? r.id : Number(String(r.id || '').replace(/[^0-9]/g, ''));
          if (!isNaN(numId) && numId > 0 && !idMap.has(numId)) {
            idMap.set(numId, r);
          }
        }

        // Align each batchSegment by 1:1 ID match (or fallback to relative index)
        // Strictly lock startTime and endTime to the Whisper segment boundaries so Gemini never modifies or shifts timestamps!
        batchRows = [];
        for (let sIdx = 0; sIdx < batchSegments.length; sIdx++) {
          const seg = batchSegments[sIdx];
          const matched = idMap.get(seg.id) || parsedRows[sIdx] || {};

          const khmerText = String(
            matched.khmer_text ||
            matched.text ||
            matched.dialogue ||
            matched.translation ||
            ''
          ).trim();

          // Match character by character_name or speakerName if available
          let resolvedSpeaker: string | undefined = undefined;
          const charNameInput = matched.character_name || matched.speakerName;
          let charMatchGender: 'male' | 'female' | undefined = undefined;
          if (charNameInput) {
            resolvedSpeaker = String(charNameInput).trim();
            const charMatch = storyContext.characters.find(
              (c) =>
                c.khmerName.toLowerCase().includes(String(charNameInput).toLowerCase()) ||
                (c.originalName && String(charNameInput).includes(c.originalName))
            );
            if (charMatch) {
              charMatchGender = charMatch.gender;
              resolvedSpeaker = charMatch.khmerName;
            }
          }

          const rawGender = String(matched.voice || matched.speaker || matched.gender || charMatchGender || '').toLowerCase();
          const detectedGender = detectSegmentGender({
            gender: rawGender || (charMatchGender ? charMatchGender : undefined),
            meaning: resolvedSpeaker || (charNameInput ? String(charNameInput).trim() : undefined),
            text: khmerText,
            originalText: seg.text,
          }, { forceRecompute: true });

          const gender: 'male' | 'female' = detectedGender;
          if (!resolvedSpeaker) {
            resolvedSpeaker = gender === 'female' ? 'តួស្រី' : 'តួប្រុស';
          }
          const voiceProfile = gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural';

          batchRows.push({
            id: `sub_${Date.now()}_${bIdx}_${sIdx}_${Math.random().toString(36).slice(2, 6)}`,
            startTime: Number(Number(seg.start).toFixed(2)),
            endTime: Number(Number(seg.end).toFixed(2)),
            text: khmerText,
            originalText: seg.text,
            gender,
            voiceProfile,
            meaning: resolvedSpeaker,
          });
        }

        // Run sanitizer with story glossary to guarantee 100% Khmer text & accurate transliterations
        await sanitizeAndTranslateForeignRows(batchRows, activeKeys, currentModel, storyContext.glossary);

        // Update rolling context for next batch (include speaker/character name for continuity)
        lastContext = batchRows.slice(-4).map((r, i) => ({
          id: batchSegments[batchSegments.length - 4 + i]?.id || i + 1,
          speaker: r.meaning || (r.gender === 'female' ? 'តួស្រី' : 'តួប្រុស'),
          text: r.text,
        }));

        batchSuccess = true;
      } catch (apiErr: any) {
        const errStr = String(apiErr?.message || apiErr);
        console.warn(`Gemini story error on batch ${bIdx} with key ${currentKeyIndex + 1} (${currentModel}):`, errStr);

        const isAuthError =
          errStr.includes('401') ||
          errStr.includes('UNAUTHENTICATED') ||
          errStr.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
          errStr.includes('API_KEY_INVALID') ||
          errStr.includes('PERMISSION_DENIED') ||
          errStr.includes('403');

        const isQuotaError =
          errStr.includes('429') ||
          errStr.includes('RESOURCE_EXHAUSTED') ||
          errStr.includes('quota') ||
          errStr.includes('rate-limit');

        const isServiceUnavailable =
          errStr.includes('503') ||
          errStr.includes('UNAVAILABLE') ||
          errStr.includes('high demand') ||
          errStr.includes('overloaded');

        const isModelError =
          errStr.includes('404') ||
          errStr.includes('not found') ||
          errStr.includes('no longer available') ||
          errStr.includes('is not supported');

        if (isAuthError) {
          const failedIdx = currentKeyIndex + 1;
          activeKeys = activeKeys.filter((k) => k !== currentKey);
          autoRotated = true;
          console.warn(`Key ${failedIdx} permanently removed from pool due to auth failure.`);

          if (activeKeys.length > 0) {
            currentKeyIndex = currentKeyIndex % activeKeys.length;
            onProgress?.({
              stage: 'key',
              message: `⚠️ Key ${failedIdx} មិនត្រឹមត្រូវ (Auth Error) — បានដកចេញ និងប្តូរទៅ Key ${currentKeyIndex + 1}...`,
              keyIndex: currentKeyIndex + 1,
            });
            await new Promise((r) => setTimeout(r, 500));
            continue;
          } else {
            throw new TranscribeError(
              'Gemini API Key មិនត្រឹមត្រូវ (Auth Error)។ សូមប្រើ Gemini API Key (AIzaSy...) ពី Google AI Studio។',
              'API_KEY_INVALID',
              401
            );
          }
        }

        if (isServiceUnavailable) {
          onProgress?.({
            stage: 'waiting',
            message: `⚡ Google Gemini (${currentModel}) កំពុងមមាញឹកបណ្តោះអាសន្ន (503) — កំពុងរង់ចាំ 2 វិនាទីដើម្បីបន្ត...`,
          });
          if (activeKeys.length > 1) {
            currentKeyIndex = (currentKeyIndex + 1) % activeKeys.length;
          }
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        if (isQuotaError) {
          if (activeKeys.length > 1) {
            const failedIdx = currentKeyIndex + 1;
            currentKeyIndex = (currentKeyIndex + 1) % activeKeys.length;
            autoRotated = true;
            onProgress?.({
              stage: 'key',
              message: `🔄 Key ${failedIdx} ពេញកូតា — បានប្តូរទៅប្រើ Key ${currentKeyIndex + 1} (ម៉ូដែល ${currentModel})...`,
              keyIndex: currentKeyIndex + 1,
            });
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }

          const match = errStr.match(/retry in ([0-9.]+)s/i) || errStr.match(/retryDelay["']?:\s*["']?([0-9]+)s/i);
          const waitSec = match ? Math.min(30, Math.max(3, Math.ceil(parseFloat(match[1])))) : 12;
          onProgress?.({
            stage: 'waiting',
            message: `⏳ កូតា Gemini (${currentModel}) ពេញបណ្តោះអាសន្ន — កំពុងរង់ចាំ ${waitSec} វិនាទីដើម្បីបន្ត...`,
          });
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }

        if (attempts >= maxAttempts) {
          console.warn(`Gemini Story Error on batch ${bIdx}: ${errStr}. Sanitizing fallback segments.`);
          batchRows = batchSegments.map((seg, sIdx) => ({
            id: `sub_${Date.now()}_${bIdx}_${sIdx}_${Math.random().toString(36).slice(2, 6)}`,
            startTime: seg.start,
            endTime: seg.end,
            text: '',
            originalText: seg.text,
            gender: 'male' as const,
            voiceProfile: 'km-KH-PisethNeural',
          }));
          await sanitizeAndTranslateForeignRows(batchRows, activeKeys, currentModel, storyContext.glossary);
          batchSuccess = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    if (batchRows.length > 0) {
      allRows.push(...batchRows);
    }

    onProgress?.({
      stage: 'chunkDone',
      message:
        totalBatches > 1
          ? `✅ បានបញ្ចប់ការបកប្រែផ្នែកទី ${bIdx + 1}/${totalBatches} (${allRows.length} បន្ទាត់)`
          : `✅ បានបញ្ចប់ការបកប្រែ ១ ភាគទាំងមូលដោយជោគជ័យ (${allRows.length} បន្ទាត់)`,
      batch: bIdx + 1,
      batches: totalBatches,
      completed: bIdx + 1,
      rows: [...allRows],
    });
  }

  allRows.sort((a, b) => a.startTime - b.startTime);
  const vocalSegmentRows = separateSegmentsByVocalSpaces(allRows);

  // Deep Acoustic Pitch Detection: Listen to audio waveforms (F0 fundamental frequency) to accurately distinguish male vs female
  try {
    if (fullAudioPath && fs.existsSync(fullAudioPath) && vocalSegmentRows.length > 0) {
      onProgress?.({
        stage: 'detecting',
        message: '🎵 កំពុងស្ដាប់រលកសំឡេងដើម (Acoustic Pitch Detection F0) ដើម្បីកំណត់សម្លេងប្រុស/ស្រី...',
      });
      const pitchResults = await detectAudioPitchGenders(
        fullAudioPath,
        vocalSegmentRows.map((r) => ({
          id: r.id || '',
          startTime: r.startTime,
          endTime: r.endTime,
          text: r.text,
          meaning: r.meaning,
          originalText: r.originalText,
        }))
      );
      if (pitchResults && pitchResults.length > 0) {
        const pitchMap = new Map<string, (typeof pitchResults)[0]>();
        for (const pr of pitchResults) {
          pitchMap.set(String(pr.id), pr);
        }
        for (const row of vocalSegmentRows) {
          if (row.id) {
            const match = pitchMap.get(String(row.id));
            if (match) {
              row.gender = match.gender;
              row.voiceProfile = match.voiceProfile;
            }
          }
        }
      }
    }
  } catch (pitchErr: any) {
    console.warn('[Pitch Detection Note]:', pitchErr?.message || pitchErr);
  }

  return {
    rows: vocalSegmentRows,
    durationSeconds: totalDuration,
    utteranceCount: vocalSegmentRows.length,
    batchCount: totalBatches,
    emptyUtterances: 0,
    usedKeyIndex: currentKeyIndex,
    autoRotated,
  };
}

/**
 * Direct Gemini audio chunking flow (Gemini SRT).
 */
async function transcribeGeminiSrtAudio(params: {
  fullAudioPath: string;
  totalDuration: number;
  tempDir: string;
  candidateKeys: string[];
  candidateModels: string[];
  options: TranscribeOptions;
}): Promise<TranscribeResult> {
  const { fullAudioPath, totalDuration, tempDir, candidateKeys, candidateModels, options } = params;
  const { videoTitle, prompt: customPrompt, sourceLanguage = 'English', isCancelled, onProgress } = options;

  // Transcribe in chunks of 50 seconds to 1 minute (55s) with 3.0s overlap
  // to ensure zero lost dialogue and razor-sharp timestamps!
  const CHUNK_DURATION = 55; // 55 seconds (between 50s and 60s)
  const OVERLAP_SEC = 3.0; // 3-second overlap to prevent words/sentences from being cut at chunk boundaries
  const totalChunks = Math.max(1, Math.ceil(totalDuration / CHUNK_DURATION));
  const allRows: TranscribeSubtitleRow[] = [];

  onProgress?.({
    stage: 'planned',
    message: `📋 បែងចែកជា ${totalChunks} ផ្នែកសម្រាប់ដំណើរការ (ចន្លោះ ៥០វិ - ១នាទី ក្នុងមួយផ្នែក)...`,
    batches: totalChunks,
    totalChunks,
  });

  let activeKeys = [...candidateKeys];
  let currentKeyIndex = 0;
  let currentModelIdx = 0;
  let autoRotated = false;

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    if (isCancelled?.()) {
      throw new Error('Cancelled');
    }

    const nominalStart = chunkIdx * CHUNK_DURATION;
    const nominalEnd = Math.min(totalDuration, (chunkIdx + 1) * CHUNK_DURATION);

    // Add overlap to slice so sentences crossing the boundary are not cut off
    const sliceStart = Math.max(0, nominalStart - (chunkIdx > 0 ? OVERLAP_SEC : 0));
    const sliceEnd = Math.min(totalDuration, nominalEnd + (chunkIdx < totalChunks - 1 ? OVERLAP_SEC : 0));
    const sliceLen = sliceEnd - sliceStart;

    onProgress?.({
      stage: 'chunk',
      message: `🎙️ Gemini (${candidateModels[currentModelIdx]}) កំពុងស្ដាប់ និងស្រង់សំឡេងផ្នែកទី ${chunkIdx + 1}/${totalChunks} (${nominalStart.toFixed(0)}s - ${nominalEnd.toFixed(0)}s)...`,
      batch: chunkIdx + 1,
      batches: totalChunks,
      chunkIndex: chunkIdx + 1,
      totalChunks,
      completed: chunkIdx,
    });

    const chunkAudioPath = path.join(tempDir, `chunk_${chunkIdx}.mp3`);
    await extractAudioSlice(fullAudioPath, sliceStart, sliceLen, chunkAudioPath);

    const audioBuffer = fs.readFileSync(chunkAudioPath);
    const audioBase64 = audioBuffer.toString('base64');

    const promptText = buildKhmerTranscriptionPrompt({
      sourceLanguage,
      videoTitle,
      customPrompt,
    });

    let chunkSuccess = false;
    let chunkRows: TranscribeSubtitleRow[] = [];
    let attempts = 0;
    const maxAttempts = Math.max(25, activeKeys.length * candidateModels.length * 3);

    while (!chunkSuccess && attempts < maxAttempts) {
      if (isCancelled?.()) throw new Error('Cancelled');
      if (activeKeys.length === 0) {
        throw new TranscribeError(
          'Gemini API Key មិនត្រឹមត្រូវ ឬអស់សុពលភាព។ សូមពិនិត្យមើល API Key ក្នុង Settings។',
          'AUTH_FAILED',
          401
        );
      }
      attempts++;

      currentKeyIndex = currentKeyIndex % activeKeys.length;
      const currentKey = activeKeys[currentKeyIndex];
      const currentModel = candidateModels[currentModelIdx];
      const client = new GoogleGenAI({ apiKey: currentKey });

      try {
        onProgress?.({
          stage: 'transcribing',
          message:
            totalChunks > 1
              ? `🤖 Gemini (${currentModel}) កំពុងបកប្រែជាភាសាខ្មែរ (ផ្នែក ${chunkIdx + 1}/${totalChunks})...`
              : `🤖 Gemini (${currentModel}) កំពុងបកប្រែជាភាសាខ្មែរ ១ ភាគទាំងមូលក្នុងពេលតែមួយ...`,
          batch: chunkIdx + 1,
          batches: totalChunks,
          keyIndex: currentKeyIndex + 1,
          model: currentModel,
        });

        const response = await client.models.generateContent({
          model: currentModel,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/mp3',
                    data: audioBase64,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 8192,
            safetySettings: [
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
            ] as any,
          },
        });

        let parsedRows: any[] = [];
        try {
          const rawParsed = robustJsonParse(response.text || '');
          if (Array.isArray(rawParsed)) {
            parsedRows = rawParsed;
          } else if (rawParsed && typeof rawParsed === 'object') {
            const candidateKeys = [
              'segments', 'subtitles', 'subtitle', 'dialogues', 'dialogue',
              'lines', 'line', 'transcription', 'translations', 'translation',
              'conversations', 'conversation', 'sentences', 'sentence',
              'result', 'results', 'output', 'data', 'items', 'rows', 'script'
            ];
            for (const k of candidateKeys) {
              if (Array.isArray((rawParsed as any)[k])) {
                parsedRows = (rawParsed as any)[k];
                break;
              }
            }
            if (parsedRows.length === 0) {
              for (const val of Object.values(rawParsed)) {
                if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
                  parsedRows = val;
                  break;
                }
              }
            }
            if (parsedRows.length === 0) {
              const vals = Object.values(rawParsed);
              if (vals.length > 0 && typeof vals[0] === 'object' && vals[0] !== null) {
                const sample = vals[0] as any;
                if ('text' in sample || 'startTime' in sample || 'start' in sample || 'dialogue' in sample || 'khmer' in sample) {
                  parsedRows = vals;
                }
              }
            }
          }
        } catch (jsonErr) {
          console.warn(`JSON parse error on chunk ${chunkIdx}:`, jsonErr);
        }

        // If JSON parsing yielded 0 rows, try SRT regex parsing fallback
        if (parsedRows.length === 0 && response.text && response.text.includes('-->')) {
          parsedRows = parseSrtSubtitlesFromText(response.text);
        }

        if (Array.isArray(parsedRows) && parsedRows.length > 0) {
          chunkRows = parsedRows
            .map((r, rIdx) => {
              if (!r || typeof r !== 'object') return null;

              const rawStart = r.startTime ?? r.start ?? r.start_time ?? r.from ?? r.timestamp ?? r.time ?? 0;
              const relStart = parseFlexibleTimestamp(rawStart);

              const rawEnd = r.endTime ?? r.end ?? r.end_time ?? r.to ?? undefined;
              const relEnd = rawEnd !== undefined ? parseFlexibleTimestamp(rawEnd) : (relStart + 2.0);

              const absStart = Math.max(0, sliceStart + relStart);
              const absEnd = Math.min(totalDuration, Math.max(absStart + 0.5, sliceStart + relEnd));

              // If starts before nominal window, it was captured by previous chunk
              if (chunkIdx > 0 && absStart < nominalStart) {
                return null;
              }
              // If starts after nominalEnd, it will be captured by next chunk
              if (chunkIdx < totalChunks - 1 && absStart >= nominalEnd) {
                return null;
              }

              const speakerInput = r.speakerName || r.speaker || r.character || r.role;
              const textContent = String(
                r.text ||
                r.khmer ||
                r.khmerText ||
                r.khmer_text ||
                r.dialogue ||
                r.translation ||
                r.subtitle ||
                r.line ||
                r.sentence ||
                r.content ||
                r.speech ||
                r.originalText ||
                r.sourceText ||
                ''
              ).trim();

              const origText = r.originalText || r.sourceText || r.source || r.chinese || r.english || undefined;

              const detectedGender = detectSegmentGender({
                gender: r.gender || r.speakerGender || r.sex || r.voice || r.voiceProfile,
                meaning: speakerInput,
                text: textContent,
                originalText: origText ? String(origText).trim() : undefined,
              }, { forceRecompute: true });

              const gender: 'male' | 'female' = detectedGender;
              const voiceProfile = gender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural';
              const speaker = speakerInput || (gender === 'female' ? 'តួស្រី' : 'តួប្រុស');

              return {
                id: `sub_${Date.now()}_${chunkIdx}_${rIdx}_${Math.random().toString(36).slice(2, 6)}`,
                startTime: Math.round(absStart * 100) / 100,
                endTime: Math.round(absEnd * 100) / 100,
                text: textContent,
                originalText: origText ? String(origText).trim() : undefined,
                gender,
                voiceProfile,
                meaning: String(speaker).trim(),
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null && r.text.length > 0);

          if (chunkRows.length > 0) {
            await sanitizeAndTranslateForeignRows(chunkRows, activeKeys, currentModel);
            chunkSuccess = true;
          } else {
            // Valid chunk response, but genuinely no speech dialogue (music, effects, silence)
            console.log(`Chunk ${chunkIdx + 1}/${totalChunks} returned 0 dialogue lines (non-speech segment).`);
            chunkSuccess = true;
          }
        }
      } catch (apiErr: any) {
        const errStr = String(apiErr?.message || apiErr);
        console.warn(`Gemini call error on chunk ${chunkIdx} with key ${currentKeyIndex + 1} (${currentModel}):`, errStr);

        const isAuthError =
          errStr.includes('401') ||
          errStr.includes('UNAUTHENTICATED') ||
          errStr.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
          errStr.includes('API_KEY_INVALID') ||
          errStr.includes('PERMISSION_DENIED') ||
          errStr.includes('403');

        const isQuotaError =
          errStr.includes('429') ||
          errStr.includes('RESOURCE_EXHAUSTED') ||
          errStr.includes('quota') ||
          errStr.includes('rate-limit');

        const isServiceUnavailable =
          errStr.includes('503') ||
          errStr.includes('UNAVAILABLE') ||
          errStr.includes('high demand') ||
          errStr.includes('overloaded');

        const isModelError =
          errStr.includes('404') ||
          errStr.includes('not found') ||
          errStr.includes('no longer available') ||
          errStr.includes('is not supported');

        if (isAuthError) {
          const failedIdx = currentKeyIndex + 1;
          activeKeys = activeKeys.filter((k) => k !== currentKey);
          autoRotated = true;
          console.warn(`Key ${failedIdx} permanently removed from pool due to auth failure.`);

          if (activeKeys.length > 0) {
            currentKeyIndex = currentKeyIndex % activeKeys.length;
            onProgress?.({
              stage: 'key',
              message: `⚠️ Key ${failedIdx} មិនត្រឹមត្រូវ (Auth Error) — បានដកចេញ និងប្តូរទៅ Key ${currentKeyIndex + 1}...`,
              keyIndex: currentKeyIndex + 1,
            });
            await new Promise((r) => setTimeout(r, 500));
            continue;
          } else {
            throw new TranscribeError(
              'Gemini API Key មិនត្រឹមត្រូវ (Auth Error)។ សូមប្រើ Gemini API Key (AIzaSy...) ពី Google AI Studio។',
              'API_KEY_INVALID',
              401
            );
          }
        }

        if (isServiceUnavailable) {
          onProgress?.({
            stage: 'waiting',
            message: `⚡ Google Gemini (${currentModel}) កំពុងមមាញឹកបណ្តោះអាសន្ន (503) — កំពុងរង់ចាំ 2 វិនាទីដើម្បីបន្ត...`,
          });
          if (activeKeys.length > 1) {
            currentKeyIndex = (currentKeyIndex + 1) % activeKeys.length;
          }
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        if (isQuotaError) {
          if (activeKeys.length > 1) {
            const failedIdx = currentKeyIndex + 1;
            currentKeyIndex = (currentKeyIndex + 1) % activeKeys.length;
            autoRotated = true;
            onProgress?.({
              stage: 'key',
              message: `🔄 Key ${failedIdx} ពេញកូតា — បានប្តូរទៅប្រើ Key ${currentKeyIndex + 1} (ម៉ូដែល ${currentModel})...`,
              keyIndex: currentKeyIndex + 1,
            });
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }

          const match = errStr.match(/retry in ([0-9.]+)s/i) || errStr.match(/retryDelay["']?:\s*["']?([0-9]+)s/i);
          const waitSec = match ? Math.min(30, Math.max(3, Math.ceil(parseFloat(match[1])))) : 12;
          onProgress?.({
            stage: 'waiting',
            message: `⏳ កូតា Gemini (${currentModel}) ពេញបណ្តោះអាសន្ន — កំពុងរង់ចាំ ${waitSec} វិនាទីដើម្បីបន្ត...`,
          });
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }

        if (attempts >= maxAttempts) {
          throw new TranscribeError(`Gemini API Error: ${errStr}`, 'API_ERROR', 500);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    if (chunkRows.length > 0) {
      allRows.push(...chunkRows);
    }

    onProgress?.({
      stage: 'chunkDone',
      message:
        totalChunks > 1
          ? `✅ បានបញ្ចប់ផ្នែកទី ${chunkIdx + 1}/${totalChunks} (${allRows.length} បន្ទាត់)`
          : allRows.length > 0
          ? `✅ បានបញ្ចប់ការបកប្រែ ១ ភាគទាំងមូលដោយជោគជ័យ (${allRows.length} បន្ទាត់)`
          : `ℹ️ មិនមានការសន្ទនាក្នុងវីដេអូនេះទេ (០ បន្ទាត់)`,
      batch: chunkIdx + 1,
      batches: totalChunks,
      completed: chunkIdx + 1,
      rows: [...allRows],
    });
  }

  allRows.sort((a, b) => a.startTime - b.startTime);
  const vocalSegmentRows = separateSegmentsByVocalSpaces(allRows);

  // Deep Acoustic Pitch Detection: Listen to audio waveforms (F0 fundamental frequency) to accurately distinguish male vs female
  try {
    if (fullAudioPath && fs.existsSync(fullAudioPath) && vocalSegmentRows.length > 0) {
      const pitchResults = await detectAudioPitchGenders(
        fullAudioPath,
        vocalSegmentRows.map((r) => ({
          id: r.id || '',
          startTime: r.startTime,
          endTime: r.endTime,
          text: r.text,
          meaning: r.meaning,
          originalText: r.originalText,
        }))
      );
      if (pitchResults && pitchResults.length > 0) {
        const pitchMap = new Map<string, (typeof pitchResults)[0]>();
        for (const pr of pitchResults) {
          pitchMap.set(String(pr.id), pr);
        }
        for (const row of vocalSegmentRows) {
          if (row.id) {
            const match = pitchMap.get(String(row.id));
            if (match) {
              row.gender = match.gender;
              row.voiceProfile = match.voiceProfile;
            }
          }
        }
      }
    }
  } catch (pitchErr: any) {
    console.warn('[Pitch Detection Note]:', pitchErr?.message || pitchErr);
  }

  return {
    rows: vocalSegmentRows,
    durationSeconds: totalDuration,
    utteranceCount: vocalSegmentRows.length,
    batchCount: totalChunks,
    emptyUtterances: 0,
    usedKeyIndex: currentKeyIndex,
    autoRotated,
  };
}

