/**
 * Subtitle Paging & Dynamic Auto Chunking Utility
 * Automatically displays 1 line for short subtitles and 2 lines per page for long subtitles,
 * smoothly progressing through all sentences throughout the segment duration.
 *
 * CRITICAL RULE FOR KHMER & MULTILINGUAL TEXT:
 * ONLY break at space boundaries or punctuation (។, !, ?, …) to prevent breaking words
 * or detaching vowels/subscripts (no dotted circles ◌).
 */

export interface SubtitlePageChunk {
  text: string;
  lines: string[];
  startTime: number;
  endTime: number;
}

const KHMER_CLUSTER_REGEX = /[\u1780-\u17B3](?:\u17D2[\u1780-\u17A2]|[\u17B6-\u17D3\u17DD])*|[^\u1780-\u17D3\u17DD]+/gu;

let kmWordSegmenter: Intl.Segmenter | null = null;
try {
  if (typeof Intl !== 'undefined' && typeof (Intl as any).Segmenter === 'function') {
    kmWordSegmenter = new Intl.Segmenter('km', { granularity: 'word' });
  }
} catch {
  kmWordSegmenter = null;
}

/**
 * Splits text into lines safely without breaking Khmer words, subscripts, or exceeding line width.
 * Uses Intl.Segmenter for linguistic word boundaries and orthographic clusters as fallback.
 */
export function splitTextIntoLines(
  text: string,
  approxCharsPerLine: number = 22
): string[] {
  if (!text) return [];
  const clean = text.trim();
  if (!clean) return [];

  const maxChars = Math.max(16, approxCharsPerLine);
  const paragraphs = clean.split(/\r?\n+/);
  const allLines: string[] = [];

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // First break by explicit sentence/clause delimiters if any
    const rawTokens = trimmedPara.split(/(\s+|[។!?…]+)/g).filter(Boolean);
    const words: string[] = [];

    for (const part of rawTokens) {
      if (!part.trim()) continue;

      if (kmWordSegmenter) {
        // Use Intl.Segmenter to find true linguistic word boundaries
        const segments = Array.from(kmWordSegmenter.segment(part)).map((s) => s.segment);
        for (const seg of segments) {
          if (!seg.trim()) continue;
          if (seg.length > maxChars) {
            // Further decompose giant unbroken tokens into orthographic clusters
            const clusters = seg.match(KHMER_CLUSTER_REGEX) || [seg];
            let sub = '';
            for (const c of clusters) {
              if ((sub + c).length <= maxChars) {
                sub += c;
              } else {
                if (sub) words.push(sub);
                sub = c;
              }
            }
            if (sub) words.push(sub);
          } else {
            words.push(seg);
          }
        }
      } else {
        // Fallback: decompose any token longer than maxChars into orthographic clusters
        if (part.length > maxChars) {
          const clusters = part.match(KHMER_CLUSTER_REGEX) || [part];
          let sub = '';
          for (const c of clusters) {
            if ((sub + c).length <= maxChars) {
              sub += c;
            } else {
              if (sub) words.push(sub);
              sub = c;
            }
          }
          if (sub) words.push(sub);
        } else {
          words.push(part);
        }
      }
    }

    let currentLine = '';
    for (const word of words) {
      if (!currentLine) {
        currentLine = word;
      } else {
        const candidate = `${currentLine}${word}`;
        if (candidate.length <= maxChars) {
          currentLine = candidate;
        } else {
          allLines.push(currentLine.trim());
          currentLine = word;
        }
      }
    }
    if (currentLine && currentLine.trim()) {
      allLines.push(currentLine.trim());
    }
  }

  return allLines.filter((l) => l.trim().length > 0);
}

/**
 * Automatically calculates the active subtitle chunk for the current playback time.
 * - maxLines = 0 (Default / Auto): displays all lines together in the unified subtitle box.
 * - maxLines = 1: displays 1 single line per page.
 * - maxLines = 2: groups lines into 2 lines per page.
 */
export function getActiveSubtitlePagedText(
  fullText: string,
  startTime: number,
  endTime: number,
  currentTime: number,
  approxCharsPerLine: number = 36,
  maxLines: number = 0
): string {
  if (!fullText) return '';

  const lines = splitTextIntoLines(fullText, approxCharsPerLine);
  if (lines.length <= 1) {
    return lines[0] || fullText;
  }

  // If maxLines is 0 (All lines / Auto), display the complete multi-line block
  if (maxLines === 0) {
    return lines.join('\n');
  }

  const chunkSize = maxLines === 1 ? 1 : 2;
  if (lines.length <= chunkSize) {
    return lines.join('\n');
  }

  // Group lines into chunks based on chunkSize
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    chunks.push(lines.slice(i, i + chunkSize));
  }

  if (chunks.length <= 1) {
    return lines.slice(0, chunkSize).join('\n');
  }

  // Calculate weighted duration per chunk based on character length
  const totalChars = chunks.reduce(
    (sum, c) => sum + c.join('').replace(/\s/g, '').length,
    0
  ) || 1;

  const duration = Math.max(0.1, endTime - startTime);

  let accumulatedChars = 0;
  let activeIndex = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkChars = chunks[i].join('').replace(/\s/g, '').length || 1;
    const chunkStartRatio = accumulatedChars / totalChars;
    const chunkEndRatio = (accumulatedChars + chunkChars) / totalChars;
    accumulatedChars += chunkChars;

    const chunkStartTime = startTime + chunkStartRatio * duration;
    const chunkEndTime = startTime + chunkEndRatio * duration;

    if (currentTime >= chunkStartTime && (currentTime < chunkEndTime || i === chunks.length - 1)) {
      activeIndex = i;
      break;
    }
  }

  return chunks[activeIndex].join('\n');
}

/**
 * How many characters fit on one subtitle line.
 *
 * The preview and the exporter MUST agree on this. They each used to compute it
 * inline, with slightly different constants (a floor of 22 vs 20, and a default
 * font size of 16 vs 15), so the same subtitle wrapped at different points in
 * the editor than it did in the exported file — which changes which line is
 * longest, how many lines there are, and therefore the size of the background
 * box. One definition, used by both.
 */
export function subtitleCharsPerLine(widthPercent?: number, fontSize?: number): number {
  const width = widthPercent || 80;
  const size = fontSize || 15;
  return Math.max(16, Math.min(22, Math.round((width / 100) * (360 / size))));
}

/**
 * The subtitle background box geometry, in the CSS pixels the preview uses.
 *
 * The preview draws the box with a plain CSS `padding`, and its span is
 * `w-full` inside a container of `widthPercent`, so the box is ALWAYS that
 * fraction of the frame — it does not shrink to fit a short line. The exporter
 * has to reproduce both facts or the burned-in box comes out a different size
 * from the one that was styled.
 */
export interface SubtitleBoxMetrics {
  /** Horizontal padding either side of the text, in preview pixels. */
  paddingX: number;
  /** Vertical padding above and below the text, in preview pixels. */
  paddingY: number;
  /** Multiplier applied to font size for line spacing (Tailwind leading-relaxed). */
  lineHeightRatio: number;
}

export const SUBTITLE_LINE_HEIGHT_RATIO = 1.625;

/**
 * Mirrors getSubStyleCSS() in VideoPlayer.tsx. `presetPadding` is the preset's
 * own CSS padding string when one applies, e.g. "2px 8px".
 */
export function subtitleBoxMetrics(
  styleType: string | undefined,
  presetPadding: string | undefined,
  hasBackground: boolean
): SubtitleBoxMetrics {
  const lineHeightRatio = SUBTITLE_LINE_HEIGHT_RATIO;

  if (presetPadding) {
    const parsed = parseCssPadding(presetPadding);
    if (parsed) return { ...parsed, lineHeightRatio };
  }
  // VideoPlayer: styleType 'box' sets padding '4px 12px'.
  if (styleType === 'box') return { paddingX: 12, paddingY: 4, lineHeightRatio };
  // VideoPlayer: any other background colour falls back to '2px 10px'.
  if (hasBackground) return { paddingX: 10, paddingY: 2, lineHeightRatio };
  return { paddingX: 10, paddingY: 2, lineHeightRatio };
}

/** Parses the "Ypx Xpx" shorthand the presets use. */
function parseCssPadding(padding: string): { paddingX: number; paddingY: number } | null {
  const parts = padding.trim().split(/\s+/).map((v) => parseFloat(v));
  if (parts.some((v) => !Number.isFinite(v))) return null;
  if (parts.length === 1) return { paddingY: parts[0], paddingX: parts[0] };
  if (parts.length >= 2) return { paddingY: parts[0], paddingX: parts[1] };
  return null;
}
