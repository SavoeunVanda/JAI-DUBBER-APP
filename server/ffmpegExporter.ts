import { exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import zlib from 'zlib';
import { getFFmpegPath, getFFprobePath } from './ffmpegBin';

export interface FFmpegExportSegment {
  id?: string;
  startTime: number;
  endTime: number;
  text: string;
  speed?: number;
  audioBase64?: string;
  audioUrl?: string;
}

export interface SubtitleStyleOption {
  fontFamily?: 'Nokora' | 'Battambang' | 'Hanuman' | 'Moul' | 'Content' | string;
  fontSize?: number;
  color?: string;
  styleType?: string;
  position?: 'top' | 'mid' | 'bot' | 'bottom';
  xPercent?: number;
  yPercent?: number;
  widthPercent?: number;
  bgColor?: string;
  bgOpacity?: number;
  maxLines?: number;
  previewWidth?: number;
}

export interface BlurBoxOption {
  id?: string;
  x?: number;
  y?: number;
  xPercent?: number;
  yPercent?: number;
  width?: number;
  height?: number;
  widthPercent?: number;
  heightPercent?: number;
  blurAmount?: number;
  borderRadius?: number;
  feather?: number;
  rotation?: number;
  opacity?: number;
}

export interface TextOverlayOption {
  id?: string;
  text: string;
  fontFamily?: string;
  x?: number;
  y?: number;
  xPercent?: number;
  yPercent?: number;
  fontSize?: number;
  color?: string;
  bgColor?: string;
  backgroundColor?: string;
  hasBg?: boolean;
  width?: number;
  widthPercent?: number;
  height?: number;
  heightPercent?: number;
  borderRadius?: number;
  feather?: number;
  rotation?: number;
  opacity?: number;
}

export interface RenderedOverlayInput {
  kind?: 'subtitle' | 'text' | 'image';
  startTime: number;
  endTime: number;
  pngBase64: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  refWidth?: number;
  refHeight?: number;
  xPercent?: number;
  yPercent?: number;
  animation?: string;
  animationSpeed?: number;
}

export interface FFmpegExportOptions {
  videoFilePath?: string;
  videoBuffer?: Buffer;
  videoUrl?: string;
  subtitles: FFmpegExportSegment[];
  burnSubtitles?: boolean;
  subtitleStyle?: SubtitleStyleOption;
  renderedOverlays?: RenderedOverlayInput[];
  blurBoxes?: BlurBoxOption[];
  textOverlays?: TextOverlayOption[];
  imageOverlays?: any[];
  muteOriginalAudio?: boolean;
  originalAudioVolume?: number;
  encoder?: 'h264_nvenc' | 'libx264' | 'copy' | 'auto';
  aspectRatio?: '16:9' | '9:16';
  fileName?: string;
  targetFilePath?: string;
  returnBuffer?: boolean;
  isolatedBgmPath?: string;
  previewWidth?: number;
}

// Convert CSS Colors (Hex #RRGGBB, #RGB, #RRGGBBAA, rgba, rgb) to ASS &HAABBGGRR format
export function parseColorToAss(colorStr?: string, defaultColor = '&H00FFFFFF', defaultAlpha = 0): string {
  if (!colorStr || colorStr === 'transparent') {
    return '&HFF000000'; // fully transparent
  }
  colorStr = colorStr.trim();

  // If rgba(r, g, b, a) or rgb(r, g, b)
  if (colorStr.startsWith('rgb')) {
    const match = colorStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (match) {
      const r = Math.max(0, Math.min(255, parseInt(match[1], 10)));
      const g = Math.max(0, Math.min(255, parseInt(match[2], 10)));
      const b = Math.max(0, Math.min(255, parseInt(match[3], 10)));
      const opacity = match[4] !== undefined ? parseFloat(match[4]) : 1.0;
      // In ASS: Alpha 0 = opaque, 255 = transparent
      const assAlpha = Math.max(0, Math.min(255, Math.round((1.0 - opacity) * 255)));
      const aHex = assAlpha.toString(16).padStart(2, '0').toUpperCase();
      const bHex = b.toString(16).padStart(2, '0').toUpperCase();
      const gHex = g.toString(16).padStart(2, '0').toUpperCase();
      const rHex = r.toString(16).padStart(2, '0').toUpperCase();
      return `&H${aHex}${bHex}${gHex}${rHex}`;
    }
  }

  // Hex color #RRGGBB, #RGB or #RRGGBBAA
  let clean = colorStr.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length === 6) {
    const r = clean.substring(0, 2).toUpperCase();
    const g = clean.substring(2, 4).toUpperCase();
    const b = clean.substring(4, 6).toUpperCase();
    const aHex = Math.max(0, Math.min(255, defaultAlpha)).toString(16).padStart(2, '0').toUpperCase();
    return `&H${aHex}${b}${g}${r}`;
  }
  if (clean.length === 8) {
    const r = clean.substring(0, 2).toUpperCase();
    const g = clean.substring(2, 4).toUpperCase();
    const b = clean.substring(4, 6).toUpperCase();
    const aVal = parseInt(clean.substring(6, 8), 16);
    const assAlpha = Math.max(0, Math.min(255, 255 - aVal));
    const aHex = assAlpha.toString(16).padStart(2, '0').toUpperCase();
    return `&H${aHex}${b}${g}${r}`;
  }

  return defaultColor;
}

// Format seconds into ASS timestamp H:MM:SS.CC (e.g. 0:01:23.45)
export function formatAssTime(seconds: number): string {
  const safeSec = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = Math.floor(safeSec % 60);
  const centis = Math.floor((safeSec - Math.floor(safeSec)) * 100);

  const mStr = String(mins).padStart(2, '0');
  const sStr = String(secs).padStart(2, '0');
  const cStr = String(centis).padStart(2, '0');
  return `${hrs}:${mStr}:${sStr}.${cStr}`;
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Creates an in-memory PNG alpha mask with exact border radius, anti-aliased edges,
 * feathering, and opacity to match the CSS glassmorphism preview in VideoPlayer.
 */
export function createRoundedMaskPng(
  width: number,
  height: number,
  radius: number,
  feather: number = 0,
  opacity: number = 1.0
): Buffer {
  const w = Math.max(2, width);
  const h = Math.max(2, height);
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const featherPx = Math.max(0, feather);
  const raw = Buffer.alloc(h * (1 + w * 4));
  let offset = 0;

  for (let y = 0; y < h; y++) {
    raw[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < w; x++) {
      let dx = 0;
      let dy = 0;
      if (x < r) dx = r - x;
      else if (x > w - 1 - r) dx = x - (w - 1 - r);
      if (y < r) dy = r - y;
      else if (y > h - 1 - r) dy = y - (h - 1 - r);

      let alpha = 1.0;
      if (dx > 0 && dy > 0) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        const distOutside = dist - r;
        if (distOutside > 0) {
          alpha = 0;
        } else if (distOutside > -1.5) {
          alpha = (-distOutside) / 1.5;
        }
      }

      if (featherPx > 0 && alpha > 0) {
        const edgeDist = Math.min(x, w - 1 - x, y, h - 1 - y);
        if (edgeDist < featherPx) {
          alpha *= Math.max(0, Math.min(1, edgeDist / featherPx));
        }
      }

      const finalAlpha = Math.max(0, Math.min(255, Math.round(alpha * opacity * 255)));
      // Note: FFmpeg alphamerge copies the LUMA (grayscale) of the second input into the alpha channel.
      // Therefore, R, G, B must equal finalAlpha (white=opaque, black=transparent).
      raw[offset++] = finalAlpha; // R (Luma)
      raw[offset++] = finalAlpha; // G (Luma)
      raw[offset++] = finalAlpha; // B (Luma)
      raw[offset++] = 255;        // A
    }
  }

  const compressed = zlib.deflateSync(raw);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8; // Bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  return Buffer.concat([
    sig,
    makePngChunk('IHDR', ihdrData),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0))
  ]);
}

// Check if NVENC is available on host machine
let isNvencAvailableCache: boolean | null = null;
export async function checkNvencAvailable(): Promise<boolean> {
  if (isNvencAvailableCache !== null) return isNvencAvailableCache;
  return new Promise((resolve) => {
    const ffmpegBin = getFFmpegPath();
    exec(`"${ffmpegBin}" -v error -f lavfi -i color=s=64x64 -t 0.05 -c:v h264_nvenc -f null -`, (err) => {
      isNvencAvailableCache = !err;
      resolve(isNvencAvailableCache);
    });
  });
}

// Ensure Khmer fonts are downloaded and cached for libass
export async function ensureKhmerFonts(): Promise<string> {
  const fontDir = path.join(os.homedir(), '.local', 'share', 'fonts', 'khmer');
  if (!fs.existsSync(fontDir)) {
    fs.mkdirSync(fontDir, { recursive: true });
  }

  // 1. Check local bundled font directories first to avoid unnecessary network calls
  const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const bundledFontDirs = [
    path.join(process.cwd(), 'public', 'fonts'),
    path.join(baseDir, '..', 'public', 'fonts'),
    path.join(baseDir, 'public', 'fonts'),
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'app', 'public', 'fonts') : null,
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'public', 'fonts') : null,
  ].filter(Boolean) as string[];

    for (const bDir of bundledFontDirs) {
    if (fs.existsSync(bDir)) {
      try {
        const files = fs.readdirSync(bDir);
        for (const file of files) {
          if (file.endsWith('.ttf')) {
            const dest = path.join(fontDir, file);
            if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
              fs.copyFileSync(path.join(bDir, file), dest);
            }
          }
        }
      } catch {}
    }
  }

  // If local bundled fonts are already present, return immediately (fast & offline)
  try {
    const existingFonts = fs.readdirSync(fontDir).filter((f) => f.endsWith('.ttf'));
    if (existingFonts.length >= 5) {
      return fontDir;
    }
  } catch {}

  const fontFiles = [
    { name: 'Battambang-Regular.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/battambang/Battambang-Regular.ttf' },
    { name: 'Battambang-Bold.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/battambang/Battambang-Bold.ttf' },
    { name: 'Hanuman-Regular.ttf', url: 'https://raw.githubusercontent.com/danhhong/Hanuman/master/Release/ttf/Hanuman-Regular.ttf' },
    { name: 'Hanuman-Bold.ttf', url: 'https://raw.githubusercontent.com/danhhong/Hanuman/master/Release/ttf/Hanuman-Bold.ttf' },
    { name: 'Nokora-Regular.ttf', url: 'https://raw.githubusercontent.com/danhhong/Nokora/master/Release/ttf/Nokora-Regular.ttf' },
    { name: 'Nokora-Bold.ttf', url: 'https://raw.githubusercontent.com/danhhong/Nokora/master/Release/ttf/Nokora-Bold.ttf' },
    { name: 'KantumruyPro-Regular.ttf', url: 'https://raw.githubusercontent.com/sovichet/kantumruy-pro/main/fonts/ttf/KantumruyPro-Regular.ttf' },
    { name: 'KantumruyPro-Bold.ttf', url: 'https://raw.githubusercontent.com/sovichet/kantumruy-pro/main/fonts/ttf/KantumruyPro-Bold.ttf' },
    { name: 'Content-Regular.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/content/Content-Regular.ttf' },
    { name: 'Content-Bold.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/content/Content-Bold.ttf' },
    { name: 'Moul-Regular.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/moul/Moul-Regular.ttf' },
    { name: 'Moulpali-Regular.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/moulpali/Moulpali-Regular.ttf' },
    { name: 'Nokora.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/nokora/Nokora%5Bwght%5D.ttf' },
    { name: 'Hanuman.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/hanuman/Hanuman%5Bwght%5D.ttf' },
    { name: 'KantumruyPro.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/kantumruypro/KantumruyPro%5Bwght%5D.ttf' },
    { name: 'Siemreap.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/siemreap/Siemreap.ttf' },
    { name: 'Bokor.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/bokor/Bokor-Regular.ttf' },
    { name: 'Bayon-Regular.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/bayon/Bayon-Regular.ttf' },
    { name: 'Dangrek-Regular.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/dangrek/Dangrek-Regular.ttf' },
    { name: 'Koulen-Regular.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/koulen/Koulen-Regular.ttf' },
    { name: 'Fasthand-Regular.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/fasthand/Fasthand-Regular.ttf' },
    { name: 'Preahvihear.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/preahvihear/Preahvihear-Regular.ttf' },
    { name: 'Chenla.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/chenla/Chenla.ttf' },
    { name: 'Freehand-Regular.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/freehand/Freehand-Regular.ttf' },
  ];

  let downloadedAny = false;
  for (const f of fontFiles) {
    const dest = path.join(fontDir, f.name);
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
      try {
        const resp = await fetch(f.url);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          await fs.promises.writeFile(dest, Buffer.from(buf));
          downloadedAny = true;
        }
      } catch (err) {
        console.warn(`Could not download font ${f.name}:`, err);
      }
    }
  }

  if (downloadedAny) {
    exec(`fc-cache -f "${fontDir}"`, () => {});
  }
  return fontDir;
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

// Split text into lines at space/punctuation boundaries to avoid splitting Khmer words
function splitKhmerTextIntoLines(text: string, approxCharsPerLine: number = 22): string[] {
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

// Helper to generate an ASS \p1 cubic-bezier rounded rectangle from (0, 0) to (width, height)
function getRoundedBoxDrawing(width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, Math.round(width / 2), Math.round(height / 2)));
  const k = Math.round(r * 0.5523);
  return `m ${r} 0 l ${width - r} 0 b ${width - r + k} 0 ${width} ${r - k} ${width} ${r} l ${width} ${height - r} b ${width} ${height - r + k} ${width - r + k} ${height} ${width - r} ${height} l ${r} ${height} b ${r - k} ${height} 0 ${height - r + k} 0 ${height - r} l 0 ${r} b 0 ${r - k} ${r - k} 0 ${r} 0`;
}

// Generate styled ASS subtitle and text overlay file content matching the editor preview 1:1
export function generateAssSubtitles(
  subtitles: FFmpegExportSegment[],
  style: SubtitleStyleOption = {},
  textOverlays: TextOverlayOption[] = [],
  aspectRatio: '16:9' | '9:16' = '16:9',
  videoDuration: number = 3600,
  actualWidth?: number,
  actualHeight?: number
): string {
  const isPortrait = aspectRatio === '9:16' || (actualWidth && actualHeight && actualWidth < actualHeight);
  const playResX = actualWidth && actualWidth > 0 ? actualWidth : (isPortrait ? 720 : 1280);
  const playResY = actualHeight && actualHeight > 0 ? actualHeight : (isPortrait ? 1280 : 720);
  const uiRefWidth = style.previewWidth && style.previewWidth > 50 ? style.previewWidth : 336;

  // Proportional font sizing matching Khmer text metrics in the web player
  // In preview, 15px font fills ~65% of frame width for standard 2-line subtitles.
  // In ASS, baseAssSize is 7.3% of width for portrait (e.g. 53 for 720p, 79 for 1080p)
  // and 5.2% of height for landscape (e.g. 38 for 720p, 56 for 1080p).
  const rawFontSize = style.fontSize || 15;
  const baseAssSize = isPortrait
    ? Math.round(playResX * 0.073)
    : Math.round(playResY * 0.052);
  const fontSize = Math.max(22, Math.round(baseAssSize * (rawFontSize / 15)));
  const lineHeight = Math.round(fontSize * 1.55);

  // Position calculation - default to center horizontal (50%) and 70% vertical (covering original subtitles)
  const xPercent = style.xPercent !== undefined ? style.xPercent : 50;
  let yPercent = style.yPercent;
  if (yPercent === undefined) {
    if (style.position === 'top') yPercent = 10;
    else if (style.position === 'mid') yPercent = 50;
    else yPercent = 70; // bot (default covering original Chinese subtitles)
  }
  const subPosX = Math.round((xPercent / 100) * playResX);
  const subPosY = Math.round((yPercent / 100) * playResY);

  const styleType = style.styleType || 'box';

  // Subtitle Style Specs & Font mapping
  const rawFont = (style.fontFamily || 'Battambang').trim();
  const cleanFont = (rawFont.toLowerCase() === 'battambang' || rawFont.toLowerCase() === 'battambong') ? 'Battambang' : rawFont;
  let fontName = 'Battambang';
  if (cleanFont.includes('Freehand')) fontName = 'Freehand';
  else if (cleanFont.includes('Moul') && !cleanFont.includes('Moulpali')) fontName = 'Moul';
  else if (cleanFont.includes('Moulpali')) fontName = 'Moulpali';
  else if (cleanFont.includes('Kantumruy')) fontName = 'Kantumruy Pro';
  else if (cleanFont.includes('Nokora')) fontName = 'Nokora';
  else if (cleanFont.includes('Hanuman')) fontName = 'Hanuman';
  else if (cleanFont.includes('Content')) fontName = 'Content';
  else if (cleanFont.includes('Siemreap')) fontName = 'Siemreap';
  else if (cleanFont.includes('Bokor')) fontName = 'Bokor';
  else if (cleanFont.includes('Bayon')) fontName = 'Bayon';
  else if (cleanFont.includes('Dangrek')) fontName = 'Dangrek';
  else if (cleanFont.includes('Koulen')) fontName = 'Koulen';
  else if (cleanFont.includes('Fasthand')) fontName = 'Fasthand';
  else if (cleanFont.includes('Preahvihear')) fontName = 'Preahvihear';
  else if (cleanFont.includes('Chenla')) fontName = 'Chenla';
  else if (cleanFont) fontName = cleanFont;

  const BOX_PRESETS: Record<string, { textColor: string; bgColor: string }> = {
    black_lightgray_box: { textColor: '#000000', bgColor: '#9ca3af' },
    white_darkgray_box: { textColor: '#ffffff', bgColor: '#374151' },
    black_yellow_box: { textColor: '#000000', bgColor: '#facc15' },
    white_purple_box: { textColor: '#ffffff', bgColor: '#8b5cf6' },
    purple_white_box: { textColor: '#7c3aed', bgColor: '#ffffff' },
    black_white_box: { textColor: '#000000', bgColor: '#ffffff' },
    white_black_box: { textColor: '#ffffff', bgColor: '#000000' },
    green_black_box: { textColor: '#22c55e', bgColor: '#000000' },
  };

  const isBoxPreset = Boolean(BOX_PRESETS[styleType]);
  const hasBox = styleType === 'box' || isBoxPreset || (Boolean(style.bgColor) && style.bgColor !== 'transparent');

  // Background Box properties
  const boxWidthPercent = style.widthPercent !== undefined ? style.widthPercent : 88;
  const boxWidth = Math.round((boxWidthPercent / 100) * playResX);
  const cornerRadius = Math.max(8, Math.round(fontSize * 0.25));

  let effectiveBgHex = '#000000';
  if (style.bgColor && style.bgColor !== 'transparent') {
    effectiveBgHex = style.bgColor;
  } else if (BOX_PRESETS[styleType]?.bgColor) {
    effectiveBgHex = BOX_PRESETS[styleType].bgColor;
  }

  const bgOpacity = style.bgOpacity !== undefined ? style.bgOpacity : 100;
  const alphaVal = Math.max(0, Math.min(255, Math.round((1 - bgOpacity / 100) * 255)));
  const boxAssAlpha = alphaVal.toString(16).padStart(2, '0').toUpperCase();
  const boxAssColor = parseColorToAss(effectiveBgHex, '&H00000000').substring(4, 10);
  const boxBorderTag = (styleType === 'box' || styleType === 'white_black_box') ? '\\bord1\\3c&HFFFFFF&\\3a&HD9&' : '\\bord0';

  // Primary Text Color
  let primaryColor = '&H00FFFFFF';
  let textBgr = 'FFFFFF';
  if (BOX_PRESETS[styleType]?.textColor) {
    primaryColor = parseColorToAss(BOX_PRESETS[styleType].textColor, '&H00FFFFFF');
    textBgr = primaryColor.substring(4, 10);
  } else if (style.color) {
    primaryColor = parseColorToAss(style.color, '&H00FFFFFF');
    textBgr = primaryColor.substring(4, 10);
  } else if (styleType === 'yellow') {
    primaryColor = '&H0015CCFA';
    textBgr = '15CCFA';
  } else {
    primaryColor = '&H00FFFFFF';
    textBgr = 'FFFFFF';
  }

  // Text Stroke & Drop Shadow (Layer 1)
  let outlineColor = '&H80000000';
  let backColor = '&H80000000';
  let borderStyle = 1;
  let outlineWidth = 1;
  let shadowWidth = 1;

  if (!hasBox) {
    if (styleType === 'none') {
      borderStyle = 1;
      outlineWidth = 0;
      shadowWidth = 0;
    } else if (styleType === 'white_black_stroke' || styleType === 'yellow_black_stroke' || styleType === 'yellow') {
      borderStyle = 1;
      primaryColor = styleType === 'white_black_stroke' ? '&H00FFFFFF' : (style.color ? parseColorToAss(style.color, '&H0015CCFA') : '&H0015CCFA');
      outlineColor = '&H00000000';
      outlineWidth = Math.max(3, Math.round(fontSize * 0.12));
      shadowWidth = Math.max(2, Math.round(fontSize * 0.05));
    } else if (styleType === 'white_outline') {
      borderStyle = 1;
      primaryColor = '&H00FFFFFF';
      outlineColor = '&H00000000';
      outlineWidth = Math.max(2, Math.round(fontSize * 0.08));
      shadowWidth = 0;
    } else if (styleType === 'white_shadow') {
      borderStyle = 1;
      primaryColor = '&H00FFFFFF';
      outlineColor = '&H00000000';
      outlineWidth = 0;
      shadowWidth = Math.max(3, Math.round(fontSize * 0.08));
    } else if (styleType === 'white_glow') {
      borderStyle = 1;
      primaryColor = '&H00FFFFFF';
      outlineColor = '&H00000000';
      outlineWidth = Math.max(2, Math.round(fontSize * 0.06));
      shadowWidth = Math.max(3, Math.round(fontSize * 0.08));
    } else if (styleType === 'red_white_outline') {
      borderStyle = 1;
      primaryColor = '&H004444EF';
      outlineColor = '&H00FFFFFF';
      outlineWidth = Math.max(2, Math.round(fontSize * 0.07));
      shadowWidth = 0;
    } else if (styleType === 'orange_white_outline') {
      borderStyle = 1;
      primaryColor = '&H001673F9';
      outlineColor = '&H00FFFFFF';
      outlineWidth = Math.max(2, Math.round(fontSize * 0.07));
      shadowWidth = 0;
    } else if (styleType === 'blue_white_outline') {
      borderStyle = 1;
      primaryColor = '&H00F6823B';
      outlineColor = '&H00FFFFFF';
      outlineWidth = Math.max(2, Math.round(fontSize * 0.07));
      shadowWidth = 0;
    } else if (styleType === 'green_black_stroke') {
      borderStyle = 1;
      primaryColor = '&H005EC522';
      outlineColor = '&H00000000';
      outlineWidth = Math.max(2, Math.round(fontSize * 0.07));
      shadowWidth = 0;
    } else if (styleType === 'green_darkgreen_stroke') {
      borderStyle = 1;
      primaryColor = '&H005EC522';
      outlineColor = '&H002D5314';
      outlineWidth = Math.max(2, Math.round(fontSize * 0.07));
      shadowWidth = 0;
    } else if (styleType === 'yellow_red_shadow') {
      borderStyle = 1;
      primaryColor = '&H0015CCFA';
      outlineColor = '&H002626DC';
      outlineWidth = Math.max(2, Math.round(fontSize * 0.05));
      shadowWidth = Math.max(3, Math.round(fontSize * 0.06));
    } else if (styleType === 'pink_neon') {
      borderStyle = 1;
      outlineColor = '&H009948EC';
      outlineWidth = Math.max(3, Math.round(fontSize * 0.08));
      shadowWidth = Math.max(3, Math.round(fontSize * 0.08));
    } else if (styleType === 'yellow_neon') {
      borderStyle = 1;
      outlineColor = '&H0008B3EA';
      outlineWidth = Math.max(3, Math.round(fontSize * 0.08));
      shadowWidth = Math.max(3, Math.round(fontSize * 0.08));
    } else if (styleType === 'green_neon') {
      borderStyle = 1;
      outlineColor = '&H005EC522';
      outlineWidth = Math.max(3, Math.round(fontSize * 0.08));
      shadowWidth = Math.max(3, Math.round(fontSize * 0.08));
    }
  }

  const marginLR = Math.max(20, Math.round(playResX * 0.05));

  // Build ASS Header & Styles
  let ass = `[Script Info]
Title: JAI DUBBER Subtitles & Overlays
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: ${playResX}
PlayResY: ${playResY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: SubBoxStyle,Arial,20,&H00000000,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: KhmerSubMain,${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},-1,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},${shadowWidth},5,${marginLR},${marginLR},10,1
`;

  // Add individual styles for each Text Overlay Item
  textOverlays.forEach((overlay, idx) => {
    const oFontSize = Math.max(isPortrait ? 36 : 30, Math.round(((overlay.fontSize || 22) / uiRefWidth) * playResX));
    const oColor = parseColorToAss(overlay.color || '#ffffff', '&H00FFFFFF');
    const hasBg = overlay.hasBg !== false && overlay.bgColor !== 'transparent' && overlay.backgroundColor !== '';
    const effectiveBg = overlay.bgColor || overlay.backgroundColor || 'rgba(0, 0, 0, 0.65)';
    const oBgColor = hasBg ? parseColorToAss(effectiveBg, '&H59000000') : '&H00000000';
    const oBorderStyle = hasBg ? 3 : 1;
    const oOutline = hasBg ? Math.max(10, Math.round(oFontSize * 0.22)) : 2;
    const oShadow = hasBg ? 0 : 2;

    const oRawFont = (overlay.fontFamily || style.fontFamily || 'Battambang').trim();
    let oFontName = 'Battambang';
    if (oRawFont.includes('Moul') && !oRawFont.includes('Moulpali')) oFontName = 'Moul';
    else if (oRawFont.includes('Moulpali')) oFontName = 'Moulpali';
    else if (oRawFont.includes('Kantumruy')) oFontName = 'Kantumruy Pro';
    else if (oRawFont.includes('Nokora')) oFontName = 'Nokora';
    else if (oRawFont.includes('Hanuman')) oFontName = 'Hanuman';
    else if (oRawFont.includes('Content')) oFontName = 'Content';
    else if (oRawFont.includes('Siemreap')) oFontName = 'Siemreap';
    else if (oRawFont.includes('Bokor')) oFontName = 'Bokor';
    else if (oRawFont.includes('Bayon')) oFontName = 'Bayon';
    else if (oRawFont.includes('Dangrek')) oFontName = 'Dangrek';
    else if (oRawFont.includes('Koulen')) oFontName = 'Koulen';
    else if (oRawFont.includes('Fasthand')) oFontName = 'Fasthand';
    else if (oRawFont.includes('Preahvihear')) oFontName = 'Preahvihear';
    else if (oRawFont.includes('Chenla')) oFontName = 'Chenla';
    else if (oRawFont) oFontName = oRawFont;

    ass += `Style: OverlayStyle_${idx},${oFontName},${oFontSize},${oColor},&H000000FF,${oBgColor},${oBgColor},-1,0,0,0,100,100,0,0,${oBorderStyle},${oOutline},${oShadow},5,10,10,10,1\n`;
  });

  ass += `\n[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Approximate characters per line for wrapping cleanly within boxWidth
  const approxChars = Math.max(16, Math.min(22, Math.round((boxWidth - fontSize * 1.0) / (fontSize * 0.52))));
  const maxLines = style.maxLines !== undefined ? style.maxLines : 0;

  let textTags = `\\b1\\bord1.2\\3c&H${textBgr}&\\shad1.5\\4a&H60&\\an5\\pos(${subPosX},${subPosY})`;
  if (!hasBox) {
    if (styleType === 'white_black_stroke' || styleType === 'yellow_black_stroke' || styleType === 'green_black_stroke' || styleType === 'yellow') {
      textTags = `\\b1\\bord3.5\\3c&H000000&\\shad2\\an5\\pos(${subPosX},${subPosY})`;
    } else if (styleType === 'white_outline' || styleType === 'outline') {
      textTags = `\\b1\\bord2.5\\3c&H000000&\\shad0\\an5\\pos(${subPosX},${subPosY})`;
    } else if (styleType === 'white_shadow') {
      textTags = `\\b1\\bord1\\3c&H${textBgr}&\\shad3.5\\4a&H00&\\an5\\pos(${subPosX},${subPosY})`;
    } else if (styleType === 'white_glow') {
      textTags = `\\b1\\bord2\\3c&H000000&\\shad3\\4a&H20&\\an5\\pos(${subPosX},${subPosY})`;
    } else if (styleType === 'yellow_red_shadow') {
      textTags = `\\b1\\bord1.5\\3c&H000000&\\shad3\\4c&H0000DC&\\an5\\pos(${subPosX},${subPosY})`;
    } else if (styleType === 'pink_neon') {
      textTags = `\\b1\\bord2\\3c&HEC4899&\\shad3\\an5\\pos(${subPosX},${subPosY})`;
    } else {
      textTags = `\\b1\\bord1.2\\3c&H${textBgr}&\\shad1.5\\an5\\pos(${subPosX},${subPosY})`;
    }
  }

  // Add Subtitles with Dynamic Paging matching Web Preview
  for (const seg of subtitles) {
    if (!seg.text || !seg.text.trim()) continue;
    const startSec = Number.isFinite(Number(seg.startTime)) && Number(seg.startTime) >= 0 ? Number(seg.startTime) : 0;
    const endSec = Number.isFinite(Number(seg.endTime)) && Number(seg.endTime) > startSec ? Number(seg.endTime) : startSec + 1.0;
    const segDuration = Math.max(0.1, endSec - startSec);

    // Break lines cleanly without breaking Khmer words/subscripts
    const lines = splitKhmerTextIntoLines(seg.text, approxChars);

    if (maxLines === 0 || lines.length <= (maxLines === 1 ? 1 : 2)) {
      // Complete multi-line block (Auto/Show All mode)
      const startStr = formatAssTime(startSec);
      const endStr = formatAssTime(endSec);
      const currentLines = maxLines === 0 ? lines : lines.slice(0, maxLines);
      const wrappedText = currentLines.join('\\N').replace(/,/g, '‚');

      if (hasBox) {
        const boxHeight = Math.round(currentLines.length * lineHeight + Math.round(fontSize * 0.35));
        const boxDrawing = getRoundedBoxDrawing(boxWidth, boxHeight, cornerRadius);
        const boxLeft = subPosX - Math.round(boxWidth / 2);
        const boxTop = subPosY - Math.round(boxHeight / 2);
        ass += `Dialogue: 0,${startStr},${endStr},SubBoxStyle,,0,0,0,,{\\an7\\pos(${boxLeft},${boxTop})\\p1${boxBorderTag}\\shad0\\1c&H${boxAssColor}&\\1a&H${boxAssAlpha}&}${boxDrawing}{\\p0}\n`;
      }
      ass += `Dialogue: 1,${startStr},${endStr},KhmerSubMain,,0,0,0,,{${textTags}}${wrappedText}\n`;
    } else {
      // Paging mode: 1 or 2 lines per chunk across the segment duration
      const chunkSize = maxLines === 1 ? 1 : 2;
      const chunks: string[][] = [];
      for (let i = 0; i < lines.length; i += chunkSize) {
        chunks.push(lines.slice(i, i + chunkSize));
      }

      const totalChars = chunks.reduce(
        (sum, c) => sum + c.join('').replace(/\s/g, '').length,
        0
      ) || 1;

      let accumulatedChars = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunkChars = chunks[i].join('').replace(/\s/g, '').length || 1;
        const chunkStartRatio = accumulatedChars / totalChars;
        const chunkEndRatio = (accumulatedChars + chunkChars) / totalChars;
        accumulatedChars += chunkChars;

        const pageStartTime = startSec + chunkStartRatio * segDuration;
        const pageEndTime = startSec + chunkEndRatio * segDuration;

        const startStr = formatAssTime(pageStartTime);
        const endStr = formatAssTime(pageEndTime);
        const wrappedText = chunks[i].join('\\N').replace(/,/g, '‚');

        if (hasBox) {
          const boxHeight = Math.round(chunks[i].length * lineHeight + Math.round(fontSize * 0.35));
          const boxDrawing = getRoundedBoxDrawing(boxWidth, boxHeight, cornerRadius);
          const boxLeft = subPosX - Math.round(boxWidth / 2);
          const boxTop = subPosY - Math.round(boxHeight / 2);
          ass += `Dialogue: 0,${startStr},${endStr},SubBoxStyle,,0,0,0,,{\\an7\\pos(${boxLeft},${boxTop})\\p1${boxBorderTag}\\shad0\\1c&H${boxAssColor}&\\1a&H${boxAssAlpha}&}${boxDrawing}{\\p0}\n`;
        }
        ass += `Dialogue: 1,${startStr},${endStr},KhmerSubMain,,0,0,0,,{${textTags}}${wrappedText}\n`;
      }
    }
  }

  // Add Persistent Text Overlays (Layer 2)
  const maxEndTime = formatAssTime(Math.max(videoDuration || 3600, 3600));

  textOverlays.forEach((overlay, idx) => {
    if (!overlay.text || !overlay.text.trim()) return;

    const oxPercent = overlay.xPercent !== undefined ? overlay.xPercent : (overlay.x !== undefined ? overlay.x : 50);
    const oyPercent = overlay.yPercent !== undefined ? overlay.yPercent : (overlay.y !== undefined ? overlay.y : 20);
    const oPosX = Math.round((oxPercent / 100) * playResX);
    const oPosY = Math.round((oyPercent / 100) * playResY);

    const oWidthPct = overlay.widthPercent || overlay.width || 60;
    const oApproxChars = Math.max(18, Math.floor((oWidthPct / 100) * (isPortrait ? 30 : 50)));

    const oLines = splitKhmerTextIntoLines(overlay.text, oApproxChars);
    const oWrappedText = oLines.join('\\N').replace(/,/g, '‚');

    let tags = `\\q2\\an5\\pos(${oPosX},${oPosY})`;
    if (overlay.rotation && overlay.rotation !== 0) {
      tags += `\\frz${-overlay.rotation}`;
    }
    if (overlay.opacity !== undefined && overlay.opacity < 100) {
      const alphaVal = Math.max(0, Math.min(255, Math.round((1 - overlay.opacity / 100) * 255)));
      const alphaHex = alphaVal.toString(16).padStart(2, '0').toUpperCase();
      tags += `\\alpha&H${alphaHex}&`;
    }

    ass += `Dialogue: 2,0:00:00.00,${maxEndTime},OverlayStyle_${idx},,0,0,0,,{${tags}}${oWrappedText}\n`;
  });

  return ass;
}

// Probe accurate video duration, dimensions, and streams using ffprobe
async function probeVideoInfo(filePath: string): Promise<{ duration: number; width: number; height: number; hasAudio: boolean; codecName?: string; codecTag?: string }> {
  return new Promise((resolve) => {
    const ffprobeBin = getFFprobePath();
    exec(
      `"${ffprobeBin}" -v error -show_entries stream=codec_type,codec_name,codec_tag_string,width,height:format=duration -of json "${filePath}"`,
      (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
          try {
            const data = JSON.parse(stdout);
            const duration = parseFloat(data?.format?.duration || '0') || 0;
            const videoStream = data?.streams?.find((s: any) => s.codec_type === 'video');
            const audioStream = data?.streams?.find((s: any) => s.codec_type === 'audio');
            const width = parseInt(videoStream?.width || '0', 10) || 0;
            const height = parseInt(videoStream?.height || '0', 10) || 0;
            const hasAudio = !!audioStream;
            const codecName = videoStream?.codec_name || '';
            const codecTag = videoStream?.codec_tag_string || '';
            return resolve({ duration, width, height, hasAudio, codecName, codecTag });
          } catch {}
        }
        resolve({ duration: 0, width: 0, height: 0, hasAudio: false });
      }
    );
  });
}

/**
 * Renders all individual TTS audio segments into a SINGLE unified dialogue audio track.
 * Uses a time-windowed slice architecture so that:
 * 1. adelay buffer never exceeds ~90-120 seconds (preventing out-of-memory crashes on 2+ hour videos).
 * 2. Only actual elapsed time is generated (saving dozens of gigabytes of disk space and hours of rendering).
 * 3. Windows are concatenated seamlessly using FFmpeg concat demuxer with stream copy (-c copy).
 */
async function createUnifiedDialogueTrack(
  ffmpegBin: string,
  tempDir: string,
  audioSegments: Array<{ index: number; seg: FFmpegExportSegment; filePath: string }>,
  totalDuration: number,
  onProgress?: (progress: number, text: string) => void
): Promise<string | null> {
  if (!audioSegments || audioSegments.length === 0) return null;

  const unifiedWavPath = path.join(tempDir, 'unified_khmer_dialogue.wav');
  const safeDuration = Math.max(1, totalDuration > 0 ? totalDuration : 60);

  const sorted = [...audioSegments]
    .filter((s) => fs.existsSync(s.filePath) && fs.statSync(s.filePath).size >= 64)
    .sort((a, b) => (Number(a.seg.startTime) || 0) - (Number(b.seg.startTime) || 0));

  if (sorted.length === 0) return null;

  // Partition the timeline into chronological windows [wStart, wEnd]
  interface AudioWindow {
    wStart: number;
    wEnd: number;
    items: typeof sorted;
  }

  const windows: AudioWindow[] = [];
  let currentTime = 0;
  let idx = 0;

  while (currentTime < safeDuration) {
    if (idx >= sorted.length) {
      // Remainder of video is silence
      windows.push({ wStart: currentTime, wEnd: safeDuration, items: [] });
      currentTime = safeDuration;
      break;
    }

    const firstItem = sorted[idx];
    const firstStart = Math.max(0, Number(firstItem.seg.startTime) || 0);

    // If there is a silence gap of > 10 seconds before the next segment
    if (firstStart > currentTime + 10.0) {
      windows.push({ wStart: currentTime, wEnd: firstStart, items: [] });
      currentTime = firstStart;
      continue;
    }

    const wStart = currentTime;
    const items: typeof sorted = [];
    let maxExpectedEnd = wStart;

    while (idx < sorted.length) {
      const item = sorted[idx];
      const sStart = Math.max(wStart, Number(item.seg.startTime) || 0);
      const rawSpeed = Number(item.seg.speed);
      const speed = Number.isFinite(rawSpeed) && rawSpeed >= 0.5 && rawSpeed <= 3.0 ? rawSpeed : 1.0;

      const statedDur = (Number(item.seg.endTime) || 0) - sStart;
      const sDur = statedDur > 0.2 ? statedDur / speed : 2.5;
      const sEnd = sStart + sDur;

      const wouldExceedTime = (sEnd - wStart > 90);
      const wouldExceedCount = (items.length >= 25);

      if (items.length > 0 && (wouldExceedTime || wouldExceedCount)) {
        if (sStart >= maxExpectedEnd || sEnd - wStart >= 120 || items.length >= 30) {
          break;
        }
      }

      items.push(item);
      maxExpectedEnd = Math.max(maxExpectedEnd, sEnd);
      idx++;
    }

    // Determine window end boundary
    let wEnd: number;
    if (idx < sorted.length) {
      const nextStart = Number(sorted[idx].seg.startTime) || 0;
      if (nextStart > maxExpectedEnd) {
        wEnd = nextStart;
      } else {
        wEnd = Math.max(maxExpectedEnd, wStart + 1.0);
      }
    } else {
      wEnd = safeDuration;
    }

    wEnd = Math.min(safeDuration, Math.max(wStart + 0.5, wEnd));
    windows.push({ wStart, wEnd, items });
    currentTime = wEnd;
  }

  const windowFiles: string[] = [];

  for (let i = 0; i < windows.length; i++) {
    const win = windows[i];
    const winDur = win.wEnd - win.wStart;
    const partPath = path.join(tempDir, `part_${i}.wav`);

    if (onProgress && windows.length > 1) {
      const pct = Math.round(30 + ((i + 1) / windows.length) * 12);
      onProgress(pct, `🎙️ កំពុងបញ្ចូល និងតម្រឹមសំឡេង Dialogue (${i + 1}/${windows.length})...`);
    }

    if (win.items.length === 0) {
      // Pure silence window
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegBin, [
          '-y',
          '-f', 'lavfi',
          '-i', `aevalsrc=0:channel_layout=stereo:sample_rate=48000:d=${winDur.toFixed(3)}`,
          '-c:a', 'pcm_s16le',
          '-ar', '48000',
          '-ac', '2',
          partPath
        ]);
        let errLog = '';
        proc.stderr.on('data', (d) => { errLog += d.toString(); });
        proc.on('close', (c) => {
          if (c === 0 && fs.existsSync(partPath)) {
            windowFiles.push(partPath);
            resolve();
          } else {
            reject(new Error(`Failed to generate silence part ${i}: ${errLog}`));
          }
        });
        proc.on('error', reject);
      });
    } else {
      const audioInputArgs: string[] = [];
      const filterParts: string[] = [];

      filterParts.push(`aevalsrc=0:channel_layout=stereo:sample_rate=48000:d=${winDur.toFixed(3)}[base]`);

      win.items.forEach((item, itemIdx) => {
        audioInputArgs.push('-i', item.filePath);
        const rawStart = Number(item.seg.startTime) || 0;
        const safeStart = Math.max(0, Math.min(winDur, rawStart - win.wStart));
        const delayMs = Math.round(safeStart * 1000);

        const rawSpeed = Number(item.seg.speed);
        const speed = Number.isFinite(rawSpeed) && rawSpeed >= 0.5 && rawSpeed <= 3.0 ? rawSpeed : 1.0;

        let segFilter = `[${itemIdx}:a]`;
        if (Math.abs(speed - 1.0) > 0.02) {
          if (speed > 2.0) {
            segFilter += `atempo=2.0,atempo=${(speed / 2.0).toFixed(3)},`;
          } else if (speed < 0.5) {
            segFilter += `atempo=0.5,atempo=${(speed / 0.5).toFixed(3)},`;
          } else {
            segFilter += `atempo=${speed.toFixed(3)},`;
          }
        }
        segFilter += `aformat=sample_rates=48000:channel_layouts=stereo,adelay=${delayMs}|${delayMs},apad,volume=1.0[delayed_${itemIdx}]`;
        filterParts.push(segFilter);
      });

      const mixInputs = ['[base]', ...win.items.map((_, idx) => `[delayed_${idx}]`)].join('');
      filterParts.push(`${mixInputs}amix=inputs=${win.items.length + 1}:duration=first:dropout_transition=0:normalize=0,aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${winDur.toFixed(3)}[sub_out]`);

      const filterComplex = filterParts.join(';');

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegBin, [
          '-y',
          ...audioInputArgs,
          '-filter_complex', filterComplex,
          '-map', '[sub_out]',
          '-c:a', 'pcm_s16le',
          '-ar', '48000',
          '-ac', '2',
          partPath
        ]);
        let errLog = '';
        proc.stderr.on('data', (d) => { errLog += d.toString(); });
        proc.on('close', (c) => {
          if (c === 0 && fs.existsSync(partPath)) {
            windowFiles.push(partPath);
            resolve();
          } else {
            console.warn(`[createUnifiedDialogueTrack] Window ${i} [${win.wStart.toFixed(1)}s-${win.wEnd.toFixed(1)}s] failed (code ${c}):`, errLog);
            reject(new Error(`Failed to render dialogue subtrack window ${i}`));
          }
        });
        proc.on('error', reject);
      });
    }
  }

  // If there's only 1 window, directly use it
  if (windowFiles.length === 1) {
    const single = windowFiles[0];
    if (fs.existsSync(single)) {
      try {
        await fs.promises.rename(single, unifiedWavPath);
      } catch {
        await fs.promises.copyFile(single, unifiedWavPath);
        fs.promises.unlink(single).catch(() => {});
      }
      return unifiedWavPath;
    }
  }

  // Concatenate all window parts sequentially using FFmpeg concat demuxer (lossless stream copy)
  const partsListFile = path.join(tempDir, 'dialogue_parts.txt');
  const listContent = windowFiles
    .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n');
  await fs.promises.writeFile(partsListFile, listContent, 'utf-8');

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegBin, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', partsListFile,
      '-c', 'copy',
      unifiedWavPath
    ]);
    let errLog = '';
    proc.stderr.on('data', (d) => { errLog += d.toString(); });
    proc.on('close', (c) => {
      if (c === 0 && fs.existsSync(unifiedWavPath)) {
        windowFiles.forEach((st) => fs.promises.unlink(st).catch(() => {}));
        fs.promises.unlink(partsListFile).catch(() => {});
        resolve();
      } else {
        console.warn('[createUnifiedDialogueTrack] Concat failed:', errLog);
        reject(new Error(`Failed to concatenate dialogue parts: ${errLog}`));
      }
    });
    proc.on('error', reject);
  });

  return unifiedWavPath;
}


// Main FFmpeg Export Execution
export async function runFFmpegExport(
  options: FFmpegExportOptions,
  onProgress?: (progress: number, text: string) => void
): Promise<{ outputPath: string; buffer: Buffer; encoderUsed: string; savedToTarget: boolean }> {
  const isStreamCopy = options.burnSubtitles === false || options.encoder === 'copy';
  const fontDir = !isStreamCopy ? await ensureKhmerFonts() : '';

  const tempDir = path.join(os.tmpdir(), `jai_export_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    onProgress?.(10, '⚡ កំពុងរៀបចំ Video & Audio Files សម្រាប់ FFmpeg...');

    // 1. Write or copy input video file
    let videoPath = path.join(tempDir, 'input_video.mp4');
    if (options.videoFilePath && fs.existsSync(options.videoFilePath)) {
      videoPath = options.videoFilePath;
    } else if (options.videoBuffer) {
      await fs.promises.writeFile(videoPath, options.videoBuffer);
    } else if (options.videoUrl && options.videoUrl.startsWith('http')) {
      const resp = await fetch(options.videoUrl);
      const buf = await resp.arrayBuffer();
      await fs.promises.writeFile(videoPath, Buffer.from(buf));
    } else {
      throw new Error('Video source not provided or invalid');
    }

    // Probe exact video duration and dimensions
    const videoInfo = await probeVideoInfo(videoPath);
    const videoDuration = Number.isFinite(videoInfo.duration) && videoInfo.duration > 0 ? videoInfo.duration : 0;
    console.log(`[FFmpeg Export] Source Video: ${videoInfo.width}x${videoInfo.height}, Codec: ${videoInfo.codecName || 'none'} (${videoInfo.codecTag || 'none'}), Duration: ${videoDuration.toFixed(2)}s (StreamCopy: ${isStreamCopy})`);

    // Check for unsupported proprietary codec (ByteDance bvc2 / ByteVC2)
    const isBvc2 = videoInfo.codecTag?.toLowerCase() === 'bvc2' || (!videoInfo.codecName && videoInfo.codecTag?.toLowerCase().includes('bvc'));
    if (isBvc2) {
      throw new Error(
        `វីដេអូនេះប្រើប្រាស់ Codec ផ្តាច់មុខ bvc2 (ByteDance/Hongguo) ដែលមិនមែនជាទម្រង់ស្ដង់ដារ MP4 (H.264/H.265) ឡើយ។ FFmpeg និង Media Player ទូទៅមិនអាច Decode ឬ Render រូបភាពបានទេ។ សូមទាញយកភាគនេះឡើងវិញពី Hongguo Downloader ដោយជ្រើសរើស Quality 720p។`
      );
    }

    // Determine aspect ratio if not explicitly specified
    let effectiveAspectRatio = options.aspectRatio;
    if (!effectiveAspectRatio) {
      if (videoInfo.width > 0 && videoInfo.height > 0) {
        effectiveAspectRatio = videoInfo.width < videoInfo.height ? '9:16' : '16:9';
      } else {
        effectiveAspectRatio = '16:9';
      }
    }

    // Check if pixel-perfect Canvas text overlays are provided
    const validTextCanvasOverlays = (options.renderedOverlays || []).filter(
      (o) => o.kind === 'text' && o.pngBase64
    );
    const textOverlaysForAss = validTextCanvasOverlays.length > 0 ? [] : (options.textOverlays || []);

    // 2. Generate and write ASS subtitles and text overlay file (Only if re-encoding with burned subtitles)
    const assPath = path.join(tempDir, 'subtitles.ass');
    if (!isStreamCopy) {
      const assContent = generateAssSubtitles(
        options.subtitles,
        options.subtitleStyle,
        textOverlaysForAss,
        effectiveAspectRatio,
        videoDuration,
        videoInfo.width,
        videoInfo.height
      );
      await fs.promises.writeFile(assPath, assContent, 'utf-8');
    }

    // 3. Process Khmer TTS Audio segments & write each to disk
    onProgress?.(25, '🎙️ កំពុងដំណើរការ Khmer Voice Track & Timestamp Sync...');
    const validAudioSegments: Array<{ index: number; seg: FFmpegExportSegment; filePath: string }> = [];

    const sortedSegments = [...options.subtitles]
      .filter((s) => s.text && s.text.trim())
      .sort((a, b) => (Number(a.startTime) || 0) - (Number(b.startTime) || 0));

    for (let i = 0; i < sortedSegments.length; i++) {
      const seg = sortedSegments[i];
      if (!seg.audioBase64 && !seg.audioUrl) continue;

      const audioFilePath = path.join(tempDir, `tts_audio_${i}.mp3`);
      try {
        if (seg.audioBase64 && typeof seg.audioBase64 === 'string' && seg.audioBase64.trim()) {
          let clean = seg.audioBase64.trim();
          if (clean.includes('base64,')) clean = clean.split('base64,')[1];
          const buf = Buffer.from(clean, 'base64');
          if (buf.length > 0) {
            await fs.promises.writeFile(audioFilePath, buf);
          }
        } else if (seg.audioUrl && typeof seg.audioUrl === 'string' && seg.audioUrl.startsWith('data:')) {
          const clean = seg.audioUrl.split('base64,')[1];
          if (clean) {
            const buf = Buffer.from(clean, 'base64');
            if (buf.length > 0) {
              await fs.promises.writeFile(audioFilePath, buf);
            }
          }
        } else if (seg.audioUrl && typeof seg.audioUrl === 'string' && seg.audioUrl.startsWith('http')) {
          const resp = await fetch(seg.audioUrl);
          if (resp.ok) {
            const buf = await resp.arrayBuffer();
            if (buf.byteLength > 0) {
              await fs.promises.writeFile(audioFilePath, Buffer.from(buf));
            }
          }
        }

        // Strictly verify that the audio file was written and has valid audio size (not 0 bytes)
        if (fs.existsSync(audioFilePath) && fs.statSync(audioFilePath).size >= 64) {
          validAudioSegments.push({ index: i, seg, filePath: audioFilePath });
        } else {
          console.warn(`[FFmpeg Export] Audio file ${audioFilePath} is missing or 0 bytes, skipping.`);
        }
      } catch (e) {
        console.warn(`[FFmpeg Export] Failed to write audio for seg ${i}:`, e);
      }
    }

    // 4. Pre-render unified dialogue track (Eliminates packet starvation & amix dropout bugs)
    const ffmpegBin = getFFmpegPath();
    let unifiedDialoguePath: string | null = null;
    if (validAudioSegments.length > 0) {
      onProgress?.(35, '🎙️ កំពុងបញ្ចូល និងតម្រឹមសំឡេង Khmer Dialogue...');
      unifiedDialoguePath = await createUnifiedDialogueTrack(
        ffmpegBin,
        tempDir,
        validAudioSegments,
        videoDuration,
        onProgress
      );
    }

    // Common Audio Input & Filter Construction
    const mainAudioInputArgs: string[] = [];
    const mainAudioFilterParts: string[] = [];
    let currentInputIdx = 1; // 0 is always videoPath

    let dialogueInputIdx = -1;
    if (unifiedDialoguePath && fs.existsSync(unifiedDialoguePath)) {
      mainAudioInputArgs.push('-i', unifiedDialoguePath);
      dialogueInputIdx = currentInputIdx++;
    }

    const hasIsolatedBgm = Boolean(options.isolatedBgmPath && fs.existsSync(options.isolatedBgmPath));
    let isolatedBgmIndex = -1;
    if (hasIsolatedBgm && options.isolatedBgmPath) {
      mainAudioInputArgs.push('-i', options.isolatedBgmPath);
      isolatedBgmIndex = currentInputIdx++;
    }

    const fullAudioDuration = Math.max(1, videoDuration > 0 ? videoDuration : 60);
    const canUseOriginalAudio = options.muteOriginalAudio === false && (videoInfo.hasAudio || hasIsolatedBgm);

    if (canUseOriginalAudio) {
      const rawVol = Number(options.originalAudioVolume);
      const defaultVol = hasIsolatedBgm ? 0.3 : 0.25;
      const origVol = Number.isFinite(rawVol) ? Math.max(0, Math.min(2.0, rawVol)) : defaultVol;

      if (hasIsolatedBgm) {
        mainAudioFilterParts.push(`[${isolatedBgmIndex}:a]volume=${origVol.toFixed(3)},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[bgm_out]`);
      } else {
        mainAudioFilterParts.push(`[0:a]volume=${origVol.toFixed(3)},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[bgm_out]`);
      }

      if (dialogueInputIdx !== -1) {
        mainAudioFilterParts.push(`[${dialogueInputIdx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[tts_out]`);
        mainAudioFilterParts.push(`[bgm_out][tts_out]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`);
      } else {
        mainAudioFilterParts.push(`[bgm_out]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`);
      }
    } else if (dialogueInputIdx !== -1) {
      mainAudioFilterParts.push(`[${dialogueInputIdx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`);
    } else {
      mainAudioFilterParts.push(`aevalsrc=0:channel_layout=stereo:sample_rate=48000:d=${fullAudioDuration.toFixed(3)}[aout]`);
    }

    onProgress?.(45, isStreamCopy ? '⚙️ កំពុងដំណើរការ Voice & Audio Mixing...' : '⚙️ កំពុងដំណើរការ Blur Masks, Overlays និង Voice Mix...');

    const outputPath = path.join(tempDir, 'rendered_output.mp4');
    const durationLimitArgs = videoDuration > 0 ? ['-t', videoDuration.toFixed(3)] : [];
    let encoder = isStreamCopy ? 'copy' : 'libx264';
    let ffmpegArgs: string[] = [];

    if (isStreamCopy) {
      // --- FAST STREAM COPY (LOSSLESS 100% ORIGINAL QUALITY) ---
      encoder = 'copy (Lossless 100%)';

      ffmpegArgs = [
        '-y',
        '-fflags', '+genpts',
        '-i', videoPath,
        ...mainAudioInputArgs,
        '-filter_complex', mainAudioFilterParts.join(';'),
        '-map', '0:v:0',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-fps_mode', 'passthrough',
        '-c:a', 'aac',
        '-profile:a', 'aac_low',
        '-b:a', '320k',
        '-ar', '48000',
        '-ac', '2',
        ...durationLimitArgs,
        '-avoid_negative_ts', 'make_zero',
        '-max_muxing_queue_size', '8192',
        '-movflags', '+faststart',
        '-brand', 'mp42',
        outputPath
      ];

      onProgress?.(60, '⚡ FFmpeg កំពុងចម្លង Video (Lossless 100%) & បញ្ចូលសំឡេង...');
      console.log('[FFmpeg Export Lossless] Command prepared with -c:v copy');
    } else {
      // --- STANDARD RE-ENCODE PIPELINE: Subtitle burning / Blur / Text Overlays ---
      const filterParts: string[] = [];
      let currentVideoStream = '0:v';

      const blurMaskInputArgs: string[] = [];
      const validBlurBoxes = (options.blurBoxes || []).filter(
        (b) => (b.widthPercent || b.width || 0) > 0 && (b.heightPercent || b.height || 0) > 0
      );

      const vW = videoInfo.width || 1080;
      const vH = videoInfo.height || 1920;
      const refPreviewW = options.previewWidth || options.subtitleStyle?.previewWidth || 480;
      const scaleFactor = vW / refPreviewW;

      validBlurBoxes.forEach((box, bIdx) => {
        const x = box.xPercent !== undefined ? box.xPercent : (box.x !== undefined ? box.x : 50);
        const y = box.yPercent !== undefined ? box.yPercent : (box.y !== undefined ? box.y : 50);
        const w = box.widthPercent !== undefined ? box.widthPercent : (box.width !== undefined ? box.width : 30);
        const h = box.heightPercent !== undefined ? box.heightPercent : (box.height !== undefined ? box.height : 18);
        const blur = box.blurAmount !== undefined ? box.blurAmount : 14;

        const leftPct = Math.max(0, Math.min(96, x - w / 2));
        const topPct = Math.max(0, Math.min(96, y - h / 2));
        const widthPct = Math.min(100 - leftPct, Math.max(2, w));
        const heightPct = Math.min(100 - topPct, Math.max(2, h));

        const blurRadius = Math.max(8, Math.min(36, Math.round(blur * 1.3)));

        const splitBase = `b${bIdx}_base`;
        const splitCrop = `b${bIdx}_crop`;
        const patchBlurred = `b${bIdx}_blurred`;
        const patchMasked = `b${bIdx}_masked`;
        const nextVideo = `v_blur_${bIdx}`;

        const cropW = Math.max(2, Math.floor((vW * (widthPct / 100)) / 2) * 2);
        const cropH = Math.max(2, Math.floor((vH * (heightPct / 100)) / 2) * 2);
        const cropX = Math.max(0, Math.floor((vW * (leftPct / 100)) / 2) * 2);
        const cropY = Math.max(0, Math.floor((vH * (topPct / 100)) / 2) * 2);

        const cropExpr = `w=${cropW}:h=${cropH}:x=${cropX}:y=${cropY}`;
        const overlayExpr = `x=${cropX}:y=${cropY}`;

        // Scale border radius and feather from preview coordinates to video resolution
        const cornerRadius = Math.round((box.borderRadius !== undefined ? box.borderRadius : 16) * scaleFactor);
        const feather = Math.round((box.feather || 0) * scaleFactor);
        const opacity = (box.opacity !== undefined ? box.opacity : 100) / 100;

        // Generate rounded corner alpha mask PNG
        const maskPngPath = path.join(tempDir, `blur_mask_${bIdx}.png`);
        const maskBuffer = createRoundedMaskPng(cropW, cropH, cornerRadius, feather, opacity);
        fs.writeFileSync(maskPngPath, maskBuffer);

        const maskInputIdx = currentInputIdx++;
        blurMaskInputArgs.push('-loop', '1', '-i', maskPngPath);

        filterParts.push(`[${currentVideoStream}]split=2[${splitBase}][${splitCrop}]`);
        filterParts.push(`[${splitCrop}]crop=${cropExpr},boxblur=luma_radius=${blurRadius}:luma_power=3,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.3:t=fill[${patchBlurred}]`);
        filterParts.push(`[${maskInputIdx}:v]scale=${cropW}:${cropH}[mask_scaled_${bIdx}]`);
        filterParts.push(`[${patchBlurred}][mask_scaled_${bIdx}]alphamerge[${patchMasked}]`);
        filterParts.push(`[${splitBase}][${patchMasked}]overlay=${overlayExpr}[${nextVideo}]`);

        currentVideoStream = nextVideo;
      });

      const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
      const safeFontDir = fontDir.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

      const hasSubtitles = options.subtitles && options.subtitles.some((s) => s.text && s.text.trim());
      const hasTextOverlaysInAss = textOverlaysForAss.length > 0 && textOverlaysForAss.some((t) => t.text && t.text.trim());

      const additionalOverlayInputs: string[] = [];

      // Burn Subtitles and Text Overlays using libass with HarfBuzz complex shaping (100% Vector Quality & Khmer Shaping)
      if (hasSubtitles || hasTextOverlaysInAss) {
        onProgress?.(50, '🎨 កំពុងដំណើរការ Subtitles ជាមួយ Khmer Complex HarfBuzz Shaping Engine...');
        const nextVideo = 'v_sub_ass';
        filterParts.push(`[${currentVideoStream}]ass='${safeAssPath}':fontsdir='${safeFontDir}':shaping=complex:alpha=1[${nextVideo}]`);
        currentVideoStream = nextVideo;
      }

      // Add text overlays from canvas (if any, e.g. titles/watermarks)
      if (validTextCanvasOverlays.length > 0) {
        onProgress?.(55, '🎨 កំពុងបិទភ្ជាប់ Text Overlays គុណភាពខ្ពស់ (Canvas Pixel-Perfect)...');
        for (let tIdx = 0; tIdx < validTextCanvasOverlays.length; tIdx++) {
          const txt = validTextCanvasOverlays[tIdx];
          let cleanData = txt.pngBase64;
          if (cleanData.includes('base64,')) {
            cleanData = cleanData.split('base64,')[1];
          }
          const txtPngPath = path.join(tempDir, `txt_overlay_${tIdx}.png`);
          await fs.promises.writeFile(txtPngPath, Buffer.from(cleanData, 'base64'));

          const txtInputIdx = currentInputIdx++;
          additionalOverlayInputs.push('-loop', '1', '-i', txtPngPath);

          const nextVideo = `v_txt_${tIdx}`;
          const scaledTxtTag = `txt_scaled_${tIdx}`;
          const tStart = Number(txt.startTime) || 0;
          const tEnd = Number(txt.endTime) || (videoDuration > 0 ? videoDuration : 3600);
          const targetW = videoInfo.width || 1080;
          const targetH = videoInfo.height || 1920;
          const hasAnim = txt.animation && txt.animation !== 'none';

          if (hasAnim) {
            const cropW = Math.max(16, Math.round((txt.width || 400) / 2) * 2);
            const cropH = Math.max(16, Math.round((txt.height || 120) / 2) * 2);
            const speed = Math.max(1, Math.min(10, txt.animationSpeed || 5));
            const T = Math.max(3, 22 - speed * 1.8);
            const xPct = txt.xPercent !== undefined ? txt.xPercent : 50;
            const yPct = txt.yPercent !== undefined ? txt.yPercent : 20;

            let xExpr = `(W*${xPct}/100)-(w/2)`;
            let yExpr = `(H*${yPct}/100)-(h/2)`;

            switch (txt.animation) {
              case 'up':
                xExpr = `(W*${xPct}/100)-(w/2)`;
                yExpr = `H-mod(t*((H+h)/${T.toFixed(2)}),H+h)`;
                break;
              case 'down':
                xExpr = `(W*${xPct}/100)-(w/2)`;
                yExpr = `-h+mod(t*((H+h)/${T.toFixed(2)}),H+h)`;
                break;
              case 'left_to_right':
                xExpr = `-w+mod(t*((W+w)/${T.toFixed(2)}),W+w)`;
                yExpr = `(H*${yPct}/100)-(h/2)`;
                break;
              case 'right_to_left':
                xExpr = `W-mod(t*((W+w)/${T.toFixed(2)}),W+w)`;
                yExpr = `(H*${yPct}/100)-(h/2)`;
                break;
              case 'bounce_vertical':
                xExpr = `(W*${xPct}/100)-(w/2)`;
                yExpr = `(H-h)*(0.5-0.5*cos(2*PI*t/${T.toFixed(2)}))`;
                break;
              case 'bounce_horizontal':
                xExpr = `(W-w)*(0.5-0.5*cos(2*PI*t/${T.toFixed(2)}))`;
                yExpr = `(H*${yPct}/100)-(h/2)`;
                break;
              case 'bounce_all':
                xExpr = `(W-w)*(0.5-0.5*cos(2*PI*t/${T.toFixed(2)}))`;
                yExpr = `(H-h)*(0.5-0.5*cos(2*PI*t/${(T * 1.37).toFixed(2)}))`;
                break;
            }

            filterParts.push(`[${txtInputIdx}:v]scale=${cropW}:${cropH}[${scaledTxtTag}]`);
            filterParts.push(
              `[${currentVideoStream}][${scaledTxtTag}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${tStart.toFixed(3)},${tEnd.toFixed(3)})':eof_action=repeat[${nextVideo}]`
            );
          } else {
            filterParts.push(`[${txtInputIdx}:v]scale=${targetW}:${targetH}[${scaledTxtTag}]`);
            filterParts.push(
              `[${currentVideoStream}][${scaledTxtTag}]overlay=0:0:enable='between(t,${tStart.toFixed(3)},${tEnd.toFixed(3)})':eof_action=repeat[${nextVideo}]`
            );
          }
          currentVideoStream = nextVideo;
        }
      }

      const overlayInputArgs: string[] = [];
      const validImageOverlays: Array<{ filePath: string; xPercent: number; yPercent: number; widthPercent: number }> = [];

      if (options.imageOverlays && options.imageOverlays.length > 0) {
        const toProcess = options.imageOverlays.slice(0, 4);
        for (let iIdx = 0; iIdx < toProcess.length; iIdx++) {
          const item = toProcess[iIdx];
          const rawData = item.imageUrl || item.data || '';
          if (!rawData || (!rawData.startsWith('data:') && !rawData.includes('base64,'))) continue;
          const clean = rawData.includes('base64,') ? rawData.split('base64,')[1] : rawData;
          const imgPath = path.join(tempDir, `img_overlay_${iIdx}.png`);
          try {
            fs.writeFileSync(imgPath, Buffer.from(clean, 'base64'));
            validImageOverlays.push({
              filePath: imgPath,
              xPercent: item.xPercent !== undefined ? item.xPercent : (item.x !== undefined ? item.x : 50),
              yPercent: item.yPercent !== undefined ? item.yPercent : (item.y !== undefined ? item.y : 20),
              widthPercent: item.widthPercent || item.width || 25,
            });
          } catch {}
        }
      }

      validImageOverlays.forEach((ov, oIdx) => {
        overlayInputArgs.push('-loop', '1', '-i', ov.filePath);
        const inputIdx = currentInputIdx++;
        const nextVideo = `v_img_${oIdx}`;
        const scaledTag = `img_scaled_${oIdx}`;
        const targetW = videoInfo.width || 1920;
        const targetImgW = Math.max(16, Math.round((targetW * (ov.widthPercent / 100)) / 2) * 2);
        filterParts.push(`[${inputIdx}:v]scale=${targetImgW}:-1[${scaledTag}]`);
        filterParts.push(
          `[${currentVideoStream}][${scaledTag}]overlay=x='(W*${ov.xPercent}/100)-(w/2)':y='(H*${ov.yPercent}/100)-(h/2)':eof_action=repeat[${nextVideo}]`
        );
        currentVideoStream = nextVideo;
      });

      filterParts.push(`[${currentVideoStream}]setpts=PTS-STARTPTS,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p[vout]`);

      const fullFilterComplex = [...filterParts, ...mainAudioFilterParts].join(';');

      const nvencAvailable = await checkNvencAvailable();
      encoder = 'libx264';
      let encoderArgs: string[] = [
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '17',
        '-profile:v', 'high',
        '-level:v', '4.2',
        '-pix_fmt', 'yuv420p',
        '-color_primaries', 'bt709',
        '-color_trc', 'bt709',
        '-colorspace', 'bt709'
      ];

      if ((options.encoder === 'h264_nvenc' || options.encoder === 'auto') && nvencAvailable) {
        encoder = 'h264_nvenc';
        encoderArgs = [
          '-c:v', 'h264_nvenc',
          '-preset', 'p6',
          '-cq', '18',
          '-spatial-aq', '1',
          '-temporal-aq', '1',
          '-rc-lookahead', '32',
          '-profile:v', 'high',
          '-level:v', '4.2',
          '-pix_fmt', 'yuv420p',
          '-color_primaries', 'bt709',
          '-color_trc', 'bt709',
          '-colorspace', 'bt709'
        ];
      }

      ffmpegArgs = [
        '-y',
        '-fflags', '+genpts',
        '-i', videoPath,
        ...mainAudioInputArgs,
        ...blurMaskInputArgs,
        ...additionalOverlayInputs,
        ...overlayInputArgs,
        '-filter_complex', fullFilterComplex,
        '-map', '[vout]',
        '-map', '[aout]',
        ...durationLimitArgs,
        ...encoderArgs,
        '-fps_mode', 'cfr',
        '-c:a', 'aac',
        '-profile:a', 'aac_low',
        '-b:a', '320k',
        '-ar', '48000',
        '-ac', '2',
        '-avoid_negative_ts', 'make_zero',
        '-max_muxing_queue_size', '8192',
        '-movflags', '+faststart',
        '-brand', 'mp42',
        outputPath
      ];

      onProgress?.(60, `🚀 FFmpeg កំពុង Encode MP4 ជាមួយ ${encoder.toUpperCase()}...`);
      console.log('[FFmpeg Export Re-encode] Filter Complex:', fullFilterComplex);
    }

    // 5. Execute FFmpeg
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegBin, ffmpegArgs);
      let stderrLog = '';

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        stderrLog += text;
        if (text.includes('time=')) {
          const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          if (timeMatch && videoDuration > 0) {
            const h = parseInt(timeMatch[1], 10);
            const m = parseInt(timeMatch[2], 10);
            const s = parseFloat(timeMatch[3]);
            const currentSec = h * 3600 + m * 60 + s;
            const pct = Math.min(95, 60 + Math.round((currentSec / videoDuration) * 35));
            onProgress?.(pct, `🚀 FFmpeg Rendering... (${currentSec.toFixed(1)}s / ${videoDuration.toFixed(1)}s)`);
          }
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          console.error('[FFmpeg Error Log]:', stderrLog);

          const extractErrorLines = (log: string): string => {
            if (!log) return '';
            const lines = log.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const relevant = lines.filter(
              (l) =>
                l.toLowerCase().includes('error') ||
                l.toLowerCase().includes('invalid') ||
                l.toLowerCase().includes('failed') ||
                l.toLowerCase().includes('cannot')
            );
            if (relevant.length > 0) {
              return relevant.slice(-3).join(' | ');
            }
            return lines.slice(-3).join(' | ');
          };

          // 1. If stream copy (-c:v copy) failed, automatically fallback to libx264 re-encode
          if (encoder.includes('copy')) {
            console.warn(`[FFmpeg Export] Stream copy failed with code ${code}, retrying with libx264 re-encode fallback...`);
            onProgress?.(65, '🔄 Stream copy មិនដំណើរការ, កំពុងប្ដូរទៅ Re-encode (libx264)...');
            encoder = 'libx264 (fallback)';
            const fallbackArgs: string[] = [];
            for (let i = 0; i < ffmpegArgs.length; i++) {
              const arg = ffmpegArgs[i];
              const prev = ffmpegArgs[i - 1];
              if (prev === '-c:v' && arg === 'copy') {
                fallbackArgs.push('libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p');
              } else {
                fallbackArgs.push(arg);
              }
            }
            let fallbackStderr = '';
            const fallbackProc = spawn(ffmpegBin, fallbackArgs);
            fallbackProc.stderr.on('data', (d) => {
              const text = d.toString();
              fallbackStderr += text;
              if (text.includes('time=')) {
                const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
                if (timeMatch && videoDuration > 0) {
                  const h = parseInt(timeMatch[1], 10);
                  const m = parseInt(timeMatch[2], 10);
                  const s = parseFloat(timeMatch[3]);
                  const currentSec = h * 3600 + m * 60 + s;
                  const pct = Math.min(95, 65 + Math.round((currentSec / videoDuration) * 30));
                  onProgress?.(pct, `🚀 FFmpeg Rendering Fallback... (${currentSec.toFixed(1)}s / ${videoDuration.toFixed(1)}s)`);
                }
              }
            });
            fallbackProc.on('close', (fCode) => {
              if (fCode === 0) {
                resolve();
              } else {
                const detail = extractErrorLines(fallbackStderr || stderrLog);
                reject(new Error(`FFmpeg export failed with code ${fCode}${detail ? ': ' + detail : ''}`));
              }
            });
            return;
          }

          // 2. If nvenc failed unexpectedly, retry with libx264 fallback
          if (encoder === 'h264_nvenc') {
            console.warn('NVENC failed, retrying with libx264 fallback...');
            onProgress?.(65, '🔄 NVENC មិនដំណើរការ, កំពុងប្ដូរទៅ libx264 fallback...');
            encoder = 'libx264 (fallback)';
            const fallbackArgs = ffmpegArgs.map((arg, i, arr) => {
              if (arr[i - 1] === '-c:v' && arg === 'h264_nvenc') return 'libx264';
              if (arr[i - 1] === '-preset' && arg === 'p4') return 'veryfast';
              if (arr[i - 1] === '-cq') return '-crf';
              return arg;
            });
            let fallbackStderr = '';
            const fallbackProc = spawn(ffmpegBin, fallbackArgs);
            fallbackProc.stderr.on('data', (d) => { fallbackStderr += d.toString(); });
            fallbackProc.on('close', (fCode) => {
              if (fCode === 0) {
                resolve();
              } else {
                const detail = extractErrorLines(fallbackStderr || stderrLog);
                reject(new Error(`FFmpeg export failed with code ${fCode}${detail ? ': ' + detail : ''}`));
              }
            });
            return;
          }

          const detail = extractErrorLines(stderrLog);
          reject(new Error(`FFmpeg export failed with code ${code}${detail ? ': ' + detail : ''}`));
        }
      });
    });

    onProgress?.(95, '💾 កំពុងបញ្ចប់ការ Save វីដេអូ...');

    let savedToTarget = false;
    let resultBuffer: Buffer = Buffer.alloc(0);

    // Save directly to local destination path if specified
    if (options.targetFilePath && options.targetFilePath.trim()) {
      try {
        const destDir = path.dirname(options.targetFilePath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        await fs.promises.copyFile(outputPath, options.targetFilePath);
        savedToTarget = true;
        console.log(`[FFmpeg Export] Successfully saved to destination: ${options.targetFilePath}`);
      } catch (saveErr) {
        console.warn('Could not write directly to targetFilePath:', saveErr);
      }
    }

    if (options.returnBuffer !== false) {
      resultBuffer = await fs.promises.readFile(outputPath);
    }

    return {
      outputPath,
      buffer: resultBuffer,
      encoderUsed: encoder,
      savedToTarget,
    };
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  }
}
