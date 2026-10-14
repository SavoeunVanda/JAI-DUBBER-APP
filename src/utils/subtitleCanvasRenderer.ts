import { SubtitleSegment, SubtitleStyle, TextOverlayItem, ImageOverlayItem } from '../types';
import { PRESET_STYLES } from '../constants/presetStyles';
import {
  splitTextIntoLines,
  subtitleCharsPerLine,
  subtitleBoxMetrics,
  SUBTITLE_LINE_HEIGHT_RATIO,
} from './subtitlePaging';

export interface RenderedSubtitleOverlay {
  /**
   * What this overlay is.
   *
   * The exporter treats them differently: subtitles come and go throughout the
   * video and there can be hundreds, so they are composited into ONE timed
   * track; a text or image overlay usually sits on screen for the whole video
   * and there are only a handful, so those stay as individual overlays.
   */
  kind?: 'subtitle' | 'text' | 'image';
  startTime: number;
  endTime: number;
  pngBase64: string;
  x: number;
  y: number;
  width: number;
  height: number;
  xPercent: number;
  yPercent: number;
  refWidth: number;
  refHeight: number;
  animation?: string;
  animationSpeed?: number;
}

/**
 * Converts Hex (#RRGGBB, #RGB) or named colors to rgba string with opacity (0-100)
 */
function hexToRgbaString(colorStr?: string, opacity: number = 100): string {
  if (!colorStr) return `rgba(0, 0, 0, ${(opacity / 100).toFixed(2)})`;
  const trimmed = colorStr.trim();
  if (trimmed.startsWith('rgba') || trimmed.startsWith('rgb')) {
    if (trimmed.startsWith('rgba') && opacity < 100) {
      return trimmed.replace(/[\d.]+\)$/, `${(opacity / 100).toFixed(2)})`);
    }
    return trimmed;
  }
  let clean = trimmed.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((x) => x + x).join('');
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16) || 0;
    const g = parseInt(clean.substring(2, 4), 16) || 0;
    const b = parseInt(clean.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${(opacity / 100).toFixed(2)})`;
  }
  return `rgba(0, 0, 0, ${(opacity / 100).toFixed(2)})`;
}

/**
 * Ensures all Google Fonts are loaded in the browser before rendering canvas with safe timeout
 */
export async function ensureFontsLoaded(fontFamily: string): Promise<void> {
  try {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
      const raw = (fontFamily || 'Battambang').split(',')[0].replace(/['"]/g, '').trim();
      const cleanFont = raw.toLowerCase() === 'battambong' ? 'Battambang' : raw;
      await Promise.race([
        Promise.all([
          document.fonts.load(`16px "${cleanFont}"`),
          document.fonts.load(`bold 16px "${cleanFont}"`),
          document.fonts.load(`32px "${cleanFont}"`),
          document.fonts.load(`bold 32px "${cleanFont}"`),
          document.fonts.load(`16px "Battambang"`),
          document.fonts.load(`bold 16px "Battambang"`),
          document.fonts.load(`16px "Hanuman"`),
          document.fonts.load(`bold 16px "Hanuman"`),
          document.fonts.ready,
        ]),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
    }
  } catch (e) {
    console.warn('Font loading check notice:', e);
  }
}

/**
 * Helper to safely sanitize font family names for Canvas 2D
 */
function getCanvasFontString(fontWeight: string | number, fontSize: number, fontFamily: string): string {
  const raw = (fontFamily || 'Battambang').split(',')[0].replace(/['"]/g, '').trim();
  const cleanFont = raw.toLowerCase() === 'battambong' ? 'Battambang' : raw;
  return `${fontWeight} ${fontSize}px "${cleanFont}", "Battambang", "Hanuman", "Kantumruy Pro", "Khmer OS Battambang", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
}

/**
 * Draws rounded rectangle helper
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, width, height, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * Renders a single frame of subtitle lines on the cropped canvas
 */
function renderSubtitleFrameToCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  lines: string[],
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  textColor: string,
  hasBox: boolean,
  bgColor: string | undefined,
  styleType: string,
  posX: number,
  posY: number,
  videoWidth: number,
  videoHeight: number,
  widthPercent: number,
  xPercent: number,
  yPercent: number,
  /** Padding in output pixels, already scaled from the preview's CSS values. */
  paddingX: number,
  paddingY: number
): RenderedSubtitleOverlay {
  // 1. Measure text dimensions using the exact font
  ctx.font = getCanvasFontString('600', fontSize, fontFamily);

  let maxLineWidth = 0;
  for (const line of lines) {
    const m = ctx.measureText(line);
    if (m.width > maxLineWidth) maxLineWidth = m.width;
  }

  const totalTextHeight = lines.length * lineHeight;

  // The box is the full styled width, NOT a box shrunk to fit the text.
  //
  // In the preview the subtitle span is `w-full` inside a container sized to
  // `widthPercent`, so its background always spans that fraction of the frame
  // however short the line is. Hugging the text here instead is what made the
  // exported background a different width from the one that was styled.
  const boxWidth = Math.max(
    Math.round((widthPercent / 100) * videoWidth),
    // A line that somehow measures wider than the styled width still needs to
    // sit on its background rather than overflow it.
    Math.round(maxLineWidth + paddingX * 2)
  );
  const boxHeight = totalTextHeight + paddingY * 2;

  const finalX = Math.max(0, Math.min(videoWidth - boxWidth, Math.round(posX - boxWidth / 2)));
  const finalY = Math.max(0, Math.min(videoHeight - boxHeight, Math.round(posY - boxHeight / 2)));

  canvas.width = videoWidth;
  canvas.height = videoHeight;

  // Re-apply context state after canvas resize
  ctx.clearRect(0, 0, videoWidth, videoHeight);
  ctx.font = getCanvasFontString('600', fontSize, fontFamily);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const innerLeft = finalX;
  const innerTop = finalY;
  const borderRadius = Math.max(4, Math.round(fontSize * 0.2));

  // 2. Draw Background Box if present
  if (hasBox && bgColor) {
    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    drawRoundedRect(ctx, innerLeft, innerTop, boxWidth, boxHeight, borderRadius);
    ctx.fill();

    // Subtle border for box style
    if (styleType === 'box' || styleType === 'white_black_box') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Draw Lines with stroke, shadow and fill
  const centerX = innerLeft + boxWidth / 2;
  const startY = innerTop + paddingY + lineHeight / 2;

  lines.forEach((line, idx) => {
    const lineY = startY + idx * lineHeight;

    ctx.save();

    // Specific Stroke / Shadow / Neon FX
    if (styleType === 'white_black_stroke' || styleType === 'yellow_black_stroke' || styleType === 'green_black_stroke' || styleType === 'yellow') {
      ctx.lineWidth = Math.max(3.5, Math.round(fontSize * 0.12));
      ctx.strokeStyle = '#000000';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
      ctx.strokeText(line, centerX, lineY);
    } else if (styleType === 'white_outline' || styleType === 'outline') {
      ctx.lineWidth = Math.max(2.5, Math.round(fontSize * 0.09));
      ctx.strokeStyle = '#000000';
      ctx.lineJoin = 'round';
      ctx.strokeText(line, centerX, lineY);
    } else if (styleType === 'red_white_outline' || styleType === 'orange_white_outline' || styleType === 'blue_white_outline') {
      ctx.lineWidth = Math.max(2.5, Math.round(fontSize * 0.09));
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineJoin = 'round';
      ctx.strokeText(line, centerX, lineY);
    } else if (styleType === 'green_darkgreen_stroke') {
      ctx.lineWidth = Math.max(2.5, Math.round(fontSize * 0.09));
      ctx.strokeStyle = '#14532d';
      ctx.lineJoin = 'round';
      ctx.strokeText(line, centerX, lineY);
    } else if (styleType === 'white_shadow' || styleType === 'shadow') {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
    } else if (styleType === 'white_glow') {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 12;
      ctx.lineWidth = Math.max(1.5, Math.round(fontSize * 0.05));
      ctx.strokeStyle = '#000000';
      ctx.strokeText(line, centerX, lineY);
    } else if (styleType === 'yellow_red_shadow') {
      ctx.shadowColor = '#dc2626';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = Math.max(2, Math.round(fontSize * 0.06));
      ctx.shadowOffsetY = Math.max(2, Math.round(fontSize * 0.06));
      ctx.lineWidth = Math.max(1.5, Math.round(fontSize * 0.04));
      ctx.strokeStyle = '#000000';
      ctx.strokeText(line, centerX, lineY);
    } else if (styleType === 'pink_neon') {
      ctx.shadowColor = '#ec4899';
      ctx.shadowBlur = 12;
      ctx.lineWidth = Math.max(1.5, Math.round(fontSize * 0.05));
      ctx.strokeStyle = '#000000';
      ctx.strokeText(line, centerX, lineY);
    } else if (styleType === 'yellow_neon') {
      ctx.shadowColor = '#eab308';
      ctx.shadowBlur = 12;
      ctx.lineWidth = Math.max(1.5, Math.round(fontSize * 0.05));
      ctx.strokeStyle = '#000000';
      ctx.strokeText(line, centerX, lineY);
    } else if (styleType === 'green_neon') {
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 14;
    } else if (styleType === 'gradient') {
      ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
      ctx.shadowBlur = 12;
      ctx.lineWidth = Math.max(1.5, Math.round(fontSize * 0.05));
      ctx.strokeStyle = '#000000';
      ctx.strokeText(line, centerX, lineY);
    }

    ctx.fillStyle = textColor;
    ctx.fillText(line, centerX, lineY);
    ctx.restore();
  });

  return {
    startTime: 0,
    endTime: 0,
    pngBase64: canvas.toDataURL('image/png'),
    x: 0,
    y: 0,
    width: videoWidth,
    height: videoHeight,
    xPercent,
    yPercent,
    refWidth: videoWidth,
    refHeight: videoHeight,
  };
}

/**
 * Wraps text to a pixel width using the canvas's own measurements.
 *
 * The preview wraps with CSS (`whitespace-pre-wrap break-words`), which breaks
 * at spaces and, failing that, mid-word. A character-count estimate cannot
 * reproduce that — the same text would break at different points on screen than
 * in the exported file — so the real glyph widths are measured here.
 */
function wrapTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const out: string[] = [];

  // Explicit newlines are honoured first; each paragraph then wraps on its own.
  for (const paragraph of String(text ?? '').split('\n')) {
    const words = paragraph.split(/(\s+)/).filter((piece) => piece.length > 0);
    let line = '';

    for (const word of words) {
      if (line === '' && ctx.measureText(word).width > maxWidth) {
        // A single word wider than the box still has to go somewhere: break it
        // character by character, which is what break-words does.
        let chunk = '';
        for (const ch of word) {
          if (chunk && ctx.measureText(chunk + ch).width > maxWidth) {
            out.push(chunk);
            chunk = '';
          }
          chunk += ch;
        }
        line = chunk;
        continue;
      }

      const candidate = line + word;
      if (ctx.measureText(candidate).width <= maxWidth || line === '') {
        line = candidate;
      } else {
        out.push(line.replace(/\s+$/, ''));
        line = word.replace(/^\s+/, '');
      }
    }

    out.push(line.replace(/\s+$/, ''));
  }

  return out.length > 0 ? out : [''];
}

/**
 * Renders a single Text Overlay item (Watermark / Channel Title)
 */
function renderTextOverlayToCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  lines: string[],
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  textColor: string,
  hasBg: boolean,
  bgColor: string | undefined,
  posX: number,
  posY: number,
  rotation: number,
  borderRadius: number = 8,
  opacity: number = 100,
  videoWidth: number,
  videoHeight: number,
  xPercent: number,
  yPercent: number,
  boxWidth: number,
  paddingX: number,
  paddingY: number,
  feather: number = 0,
  animation?: string,
  animationSpeed?: number
): RenderedSubtitleOverlay {
  ctx.font = getCanvasFontString('bold', fontSize, fontFamily);

  const totalTextHeight = lines.length * lineHeight;
  const boxHeight = totalTextHeight + paddingY * 2;

  const isAnimated = animation && animation !== 'none';
  const pad = Math.max(16, Math.round(feather * 1.5 + 24));
  const rad = Math.abs((rotation * Math.PI) / 180);
  const diagW = Math.ceil(boxWidth * Math.cos(rad) + boxHeight * Math.sin(rad)) + pad * 2;
  const diagH = Math.ceil(boxWidth * Math.sin(rad) + boxHeight * Math.cos(rad)) + pad * 2;
  const cropW = Math.max(32, Math.round(diagW / 2) * 2);
  const cropH = Math.max(32, Math.round(diagH / 2) * 2);

  if (isAnimated) {
    canvas.width = cropW;
    canvas.height = cropH;
    ctx.clearRect(0, 0, cropW, cropH);
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, opacity / 100));
    ctx.translate(cropW / 2, cropH / 2);
  } else {
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    ctx.clearRect(0, 0, videoWidth, videoHeight);
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, opacity / 100));
    ctx.translate(posX, posY);
  }
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }

  const boxLeft = -Math.round(boxWidth / 2);
  const boxTop = -Math.round(boxHeight / 2);

  // 1. Draw Background Box if enabled
  if (hasBg && bgColor && bgColor !== 'transparent') {
    ctx.save();
    if (feather > 0) {
      ctx.filter = `blur(${Math.min(25, Math.round(feather * 0.7))}px)`;
    }
    ctx.fillStyle = bgColor;
    drawRoundedRect(ctx, boxLeft, boxTop, boxWidth, boxHeight, borderRadius);
    ctx.fill();
    ctx.restore();
  }

  // 2. Draw Text with drop shadow (matching preview drop-shadow-md)
  ctx.font = getCanvasFontString('bold', fontSize, fontFamily);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const startY = boxTop + paddingY + lineHeight / 2;

  lines.forEach((line, idx) => {
    const lineY = startY + idx * lineHeight;

    ctx.save();
    // Drop shadow matching Tailwind's drop-shadow-md in preview
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = Math.max(4, Math.round(fontSize * 0.15));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(2, Math.round(fontSize * 0.06));

    if (!hasBg) {
      // Subtle readable outline if no background is present
      ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.07));
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(line, 0, lineY);
    }

    ctx.fillStyle = textColor;
    ctx.fillText(line, 0, lineY);
    ctx.restore();
  });

  ctx.restore();

  return {
    startTime: 0,
    endTime: 0,
    pngBase64: canvas.toDataURL('image/png'),
    x: isAnimated ? posX : 0,
    y: isAnimated ? posY : 0,
    width: isAnimated ? cropW : videoWidth,
    height: isAnimated ? cropH : videoHeight,
    xPercent,
    yPercent,
    refWidth: videoWidth,
    refHeight: videoHeight,
    animation,
    animationSpeed,
  };
}

function loadImageAsync(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export async function renderImageOverlayToCanvas(
  item: ImageOverlayItem,
  videoWidth: number,
  videoHeight: number
): Promise<RenderedSubtitleOverlay | null> {
  try {
    const img = await loadImageAsync(item.imageUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;

    const xPercent = item.xPercent !== undefined ? item.xPercent : (item.x !== undefined ? item.x : 50);
    const yPercent = item.yPercent !== undefined ? item.yPercent : (item.y !== undefined ? item.y : 50);
    const widthPercent = item.widthPercent !== undefined ? item.widthPercent : (item.width !== undefined ? item.width : 30);
    const targetW = Math.max(20, Math.round((widthPercent / 100) * videoWidth));
    const aspect = (img.naturalHeight || 1) / (img.naturalWidth || 1);
    const targetH = item.heightPercent !== undefined
      ? Math.max(20, Math.round((item.heightPercent / 100) * videoHeight))
      : Math.max(20, Math.round(targetW * aspect));

    const rotation = item.rotation || 0;
    const rad = (Math.abs(rotation) * Math.PI) / 180;
    const boundW = Math.ceil(targetW * Math.cos(rad) + targetH * Math.sin(rad)) + 40;
    const boundH = Math.ceil(targetW * Math.sin(rad) + targetH * Math.cos(rad)) + 40;

    canvas.width = boundW;
    canvas.height = boundH;
    ctx.clearRect(0, 0, boundW, boundH);

    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, (item.opacity ?? 100) / 100));
    ctx.translate(boundW / 2, boundH / 2);
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    const halfW = targetW / 2;
    const halfH = targetH / 2;
    // Same scaling as everywhere else: the radius is authored against the
    // preview, not against the output frame.
    const imageScale = videoWidth / (videoHeight >= videoWidth ? 340 : 640);
    const borderRadius = Math.round((item.borderRadius ?? 8) * imageScale);

    // Draw clipped rounded rect for the image
    ctx.save();
    drawRoundedRect(ctx, -halfW, -halfH, targetW, targetH, borderRadius);
    ctx.clip();
    ctx.drawImage(img, -halfW, -halfH, targetW, targetH);
    ctx.restore();

    // If feather > 0, apply soft edge radial mask or gradient feathering
    if (item.feather && item.feather > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      const fDist = (item.feather / 50) * Math.min(halfW, halfH);
      const radGrad = ctx.createRadialGradient(0, 0, Math.max(0, Math.min(halfW, halfH) - fDist), 0, 0, Math.max(halfW, halfH));
      radGrad.addColorStop(0, 'rgba(0,0,0,1)');
      radGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = radGrad;
      ctx.fillRect(-halfW - 10, -halfH - 10, targetW + 20, targetH + 20);
      ctx.restore();
    }

    ctx.restore();

    const posX = Math.round((xPercent / 100) * videoWidth);
    const posY = Math.round((yPercent / 100) * videoHeight);
    const finalX = Math.round(posX - boundW / 2);
    const finalY = Math.round(posY - boundH / 2);

    return {
      pngBase64: canvas.toDataURL('image/png'),
      x: finalX,
      y: finalY,
      width: boundW,
      height: boundH,
      xPercent,
      yPercent,
      refWidth: videoWidth,
      refHeight: videoHeight,
      startTime: 0,
      endTime: 999999,
    };
  } catch (err) {
    console.warn('Failed to render image overlay to canvas:', err);
    return null;
  }
}

/**
 * Renders all subtitle segments and text overlays into pixel-perfect PNG overlays
 * matching the Web Preview styles 100%.
 */
export async function renderAllSubtitlesToOverlays(
  subtitles: SubtitleSegment[],
  subtitleStyle: SubtitleStyle,
  textOverlays: TextOverlayItem[] = [],
  imageOverlays: ImageOverlayItem[] = [],
  videoWidth: number = 1080,
  videoHeight: number = 1920,
  previewWidth?: number
): Promise<RenderedSubtitleOverlay[]> {
  const rawSelectedFont = (subtitleStyle.fontFamily || 'Battambang').trim();
  const selectedFont = rawSelectedFont.toLowerCase() === 'battambong' ? 'Battambang' : rawSelectedFont;
  await ensureFontsLoaded(selectedFont);

  // Reference width for scaling matching the UI Preview in the editor sidebar (~336px)
  const isPortrait = videoHeight >= videoWidth;
  const uiRefWidth = previewWidth && previewWidth > 50 ? previewWidth : 336;
  const scale = videoWidth / uiRefWidth;

  const rawFontSize = subtitleStyle.fontSize || 15;
  const fontSize = Math.max(isPortrait ? 28 : 24, Math.round(rawFontSize * scale));
  // The preview span carries Tailwind's `leading-relaxed`; using a different
  // ratio here made the burned-in box a different height from the styled one.
  const lineHeight = Math.round(fontSize * SUBTITLE_LINE_HEIGHT_RATIO);

  // Percentage Position
  const xPercent = subtitleStyle.xPercent !== undefined ? subtitleStyle.xPercent : 50;
  let yPercent = subtitleStyle.yPercent;
  if (yPercent === undefined) {
    if (subtitleStyle.position === 'top') yPercent = 10;
    else if (subtitleStyle.position === 'mid') yPercent = 50;
    else yPercent = 70; // Default 70% to cover original Chinese subtitles (Drama videos)
  }
  const posX = Math.round((xPercent / 100) * videoWidth);
  const posY = Math.round((yPercent / 100) * videoHeight);

  // Preset Style Identification
  const preset = PRESET_STYLES.find((p) => p.id === subtitleStyle.styleType);
  const styleType = subtitleStyle.styleType || 'box';

  // Text Color matching VideoPlayer.tsx getSubStyleCSS exactly
  let textColor = subtitleStyle.color || '#ffffff';
  if (preset) {
    textColor = (preset.style.color as string) || preset.defaultColor || '#ffffff';
    if (subtitleStyle.color && subtitleStyle.color !== '#ffffff' && !preset.style.backgroundColor) {
      textColor = subtitleStyle.color;
    } else if (subtitleStyle.color && preset.style.backgroundColor && subtitleStyle.color !== preset.defaultColor) {
      textColor = subtitleStyle.color;
    }
  } else if (styleType === 'yellow') {
    textColor = subtitleStyle.color || '#facc15';
  } else if (styleType === 'gradient') {
    textColor = subtitleStyle.color || '#38bdf8';
  }

  // Background Box styling matching VideoPlayer.tsx exactly
  const effectiveBgColor =
    subtitleStyle.bgColor ||
    (preset?.style.backgroundColor as string) ||
    (subtitleStyle.styleType === 'box' ? '#000000' : undefined);

  const hasBox = !!effectiveBgColor && effectiveBgColor !== 'transparent' && effectiveBgColor !== '';
  const bgOpacity = subtitleStyle.bgOpacity !== undefined ? subtitleStyle.bgOpacity : (hasBox ? 100 : 0);
  const bgColor = hasBox && effectiveBgColor ? hexToRgbaString(effectiveBgColor, bgOpacity) : undefined;

  // Wrap width, from the one definition the preview also uses.
  const widthPercent = subtitleStyle.widthPercent || 80;
  const approxChars = subtitleCharsPerLine(widthPercent, subtitleStyle.fontSize);

  // Padding comes from the preview's CSS, scaled to the output resolution —
  // not from a ratio of the font size, which drifted from it at every size.
  const boxMetrics = subtitleBoxMetrics(styleType, preset?.style?.padding as string | undefined, !!hasBox);
  const paddingX = Math.round(boxMetrics.paddingX * scale);
  const paddingY = Math.round(boxMetrics.paddingY * scale);
  const maxLines = subtitleStyle.maxLines !== undefined ? subtitleStyle.maxLines : 0;

  // Filter valid subtitles
  const activeSubs = subtitles
    .filter((s) => s.isChecked !== false && s.text && s.text.trim().length > 0 && s.endTime > s.startTime)
    .sort((a, b) => a.startTime - b.startTime);

  const overlays: RenderedSubtitleOverlay[] = [];

  // Canvas element for rendering
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas ? canvas.getContext('2d', { alpha: true }) : null;

  if (!canvas || !ctx) return [];

  // Render each subtitle segment
  for (let i = 0; i < activeSubs.length; i++) {
    const seg = activeSubs[i];
    const fullText = seg.text.trim();
    const lines = splitTextIntoLines(fullText, approxChars);

    if (maxLines === 0 || lines.length <= (maxLines === 1 ? 1 : 2)) {
      // Single continuous page
      const rendered = renderSubtitleFrameToCanvas(
        canvas,
        ctx,
        maxLines === 0 ? lines : lines.slice(0, maxLines),
        selectedFont,
        fontSize,
        lineHeight,
        textColor,
        hasBox,
        bgColor,
        styleType,
        posX,
        posY,
        videoWidth,
        videoHeight,
        widthPercent,
        xPercent,
        yPercent,
        paddingX,
        paddingY
      );

      overlays.push({
        ...rendered,
        kind: 'subtitle',
        startTime: seg.startTime,
        endTime: seg.endTime,
      });
    } else {
      // Multi-page chunks
      const chunkSize = maxLines === 1 ? 1 : 2;
      const chunks: string[][] = [];
      for (let c = 0; c < lines.length; c += chunkSize) {
        chunks.push(lines.slice(c, c + chunkSize));
      }

      const totalChars = chunks.reduce(
        (sum, chunk) => sum + chunk.reduce((lSum, l) => lSum + l.replace(/\s+/g, '').length, 0),
        0
      );
      const totalDur = seg.endTime - seg.startTime;
      let curStart = seg.startTime;

      for (let c = 0; c < chunks.length; c++) {
        const chunkChars = chunks[c].reduce((lSum, l) => lSum + l.replace(/\s+/g, '').length, 0);
        const chunkDur = totalChars > 0 ? Math.max(0.4, (chunkChars / totalChars) * totalDur) : totalDur / chunks.length;
        const curEnd = c === chunks.length - 1 ? seg.endTime : Math.min(seg.endTime, curStart + chunkDur);

        const rendered = renderSubtitleFrameToCanvas(
          canvas,
          ctx,
          chunks[c],
          selectedFont,
          fontSize,
          lineHeight,
          textColor,
          hasBox,
          bgColor,
          styleType,
          posX,
          posY,
          videoWidth,
          videoHeight,
          widthPercent,
          xPercent,
          yPercent,
          paddingX,
          paddingY
        );

        overlays.push({
          ...rendered,
          kind: 'subtitle',
          startTime: curStart,
          endTime: curEnd,
        });

        curStart = curEnd;
      }
    }
  }

  // Render Persistent / Timed Text Overlays (Watermarks, Titles)
  if (textOverlays && textOverlays.length > 0) {
    for (const item of textOverlays) {
      if (!item.text || item.text.trim().length === 0) continue;

      const oFont = (item as any).fontFamily || selectedFont;
      const oRawSize = item.fontSize || 22;
      const oFontSize = Math.max(isPortrait ? 30 : 26, Math.round(oRawSize * scale));
      // The preview element inherits a 1.5 line-height; 1.4 made the exported
      // box a different height as soon as the text ran to more than one line.
      const oLineHeight = Math.round(oFontSize * 1.5);

      // Geometry copied from the preview markup: an outer container sized to
      // widthPercent (capped at 92%) with p-1 around it, and an inner element
      // that fills it and carries px-3 py-1.5.
      const oWidthPercent = Math.min(
        92,
        item.widthPercent !== undefined
          ? item.widthPercent
          : item.width !== undefined
          ? item.width
          : 60
      );
      const oWrapperPad = Math.round(4 * scale);
      const oBoxWidth = Math.max(
        Math.round(oFontSize * 2),
        Math.round((oWidthPercent / 100) * videoWidth) - oWrapperPad * 2
      );
      const oPaddingX = Math.round(12 * scale);
      const oPaddingY = Math.round(6 * scale);

      // Wrap against the same width the preview wraps against.
      ctx.font = getCanvasFontString('bold', oFontSize, oFont);
      const oLines = wrapTextToWidth(ctx, item.text, Math.max(10, oBoxWidth - oPaddingX * 2));

      const oXPercent = item.xPercent !== undefined ? item.xPercent : (item.x !== undefined ? item.x : 50);
      const oYPercent = item.yPercent !== undefined ? item.yPercent : (item.y !== undefined ? item.y : 20);
      const oPosX = Math.round((oXPercent / 100) * videoWidth);
      const oPosY = Math.round((oYPercent / 100) * videoHeight);

      const oColor = item.color || '#FFFFFF';
      const hasBg =
        item.hasBg !== false &&
        item.bgColor !== 'transparent' &&
        item.backgroundColor !== '';
      const effectiveBg = item.bgColor || item.backgroundColor || 'rgba(0, 0, 0, 0.65)';
      const oBg = hasBg ? effectiveBg : undefined;

      const rendered = renderTextOverlayToCanvas(
        canvas,
        ctx,
        oLines,
        oFont,
        oFontSize,
        oLineHeight,
        oColor,
        hasBg,
        oBg,
        oPosX,
        oPosY,
        item.rotation || 0,
        // Authored in the preview's CSS pixels, so it has to be scaled like
        // every other measurement — an 8px radius drawn unscaled onto a 1080p
        // frame is a third of the corner the user styled.
        Math.round((item.borderRadius ?? 8) * scale),
        item.opacity ?? 100,
        videoWidth,
        videoHeight,
        oXPercent,
        oYPercent,
        oBoxWidth,
        oPaddingX,
        oPaddingY,
        Math.round((item.feather ?? 0) * scale),
        item.animation,
        item.animationSpeed ?? 5
      );

      const oStart = (item as any).startTime !== undefined ? (item as any).startTime : 0;
      const oEnd = (item as any).endTime !== undefined && (item as any).endTime > 0 ? (item as any).endTime : 999999;

      overlays.push({
        ...rendered,
        kind: 'text',
        startTime: oStart,
        endTime: oEnd,
      });
    }
  }

  // Render Multi Image Overlays (Logos, Stickers, Custom Images)
  if (imageOverlays && imageOverlays.length > 0) {
    for (const imgItem of imageOverlays) {
      if (!imgItem.imageUrl) continue;
      const renderedImg = await renderImageOverlayToCanvas(imgItem, videoWidth, videoHeight);
      if (renderedImg) {
        overlays.push({ ...renderedImg, kind: 'image' });
      }
    }
  }

  return overlays;
}

/**
 * Dedicated renderer for standalone Text Overlays (Watermarks, Titles, Channel Branding)
 * Matches the Web Preview (VideoPlayer.tsx) 100% pixel-perfect on HTML5 Canvas.
 */
export async function renderTextOverlaysToCanvasOverlays(
  textOverlays: TextOverlayItem[],
  videoWidth: number = 1080,
  videoHeight: number = 1920,
  previewWidth: number = 336
): Promise<RenderedSubtitleOverlay[]> {
  if (!textOverlays || textOverlays.length === 0) return [];

  // Ensure all fonts used by the text overlays are loaded
  const fontsToLoad = new Set<string>();
  textOverlays.forEach((t) => {
    if (t.fontFamily) fontsToLoad.add(t.fontFamily);
  });
  fontsToLoad.add('Battambang');
  fontsToLoad.add('Hanuman');
  for (const fontName of fontsToLoad) {
    await ensureFontsLoaded(fontName);
  }

  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas ? canvas.getContext('2d', { alpha: true }) : null;
  if (!canvas || !ctx) return [];

  const isPortrait = videoHeight >= videoWidth;
  const uiRefWidth = previewWidth && previewWidth > 50 ? previewWidth : 336;
  const scale = videoWidth / uiRefWidth;

  const overlays: RenderedSubtitleOverlay[] = [];

  for (const item of textOverlays) {
    if (!item.text || item.text.trim().length === 0) continue;

    const oFont = item.fontFamily || 'Battambang';
    const oRawSize = item.fontSize || 22;
    const oFontSize = Math.max(isPortrait ? 30 : 26, Math.round(oRawSize * scale));
    const oLineHeight = Math.round(oFontSize * 1.5);

    const oWidthPercent = Math.min(
      92,
      item.widthPercent !== undefined
        ? item.widthPercent
        : item.width !== undefined
        ? item.width
        : 60
    );
    const oWrapperPad = Math.round(4 * scale);
    const oBoxWidth = Math.max(
      Math.round(oFontSize * 2),
      Math.round((oWidthPercent / 100) * videoWidth) - oWrapperPad * 2
    );
    const oPaddingX = Math.round(12 * scale);
    const oPaddingY = Math.round(6 * scale);

    ctx.font = getCanvasFontString('bold', oFontSize, oFont);
    const oLines = wrapTextToWidth(ctx, item.text, Math.max(10, oBoxWidth - oPaddingX * 2));

    const oXPercent = item.xPercent !== undefined ? item.xPercent : (item.x !== undefined ? item.x : 50);
    const oYPercent = item.yPercent !== undefined ? item.yPercent : (item.y !== undefined ? item.y : 20);
    const oPosX = Math.round((oXPercent / 100) * videoWidth);
    const oPosY = Math.round((oYPercent / 100) * videoHeight);

    const oColor = item.color || '#FFFFFF';
    const hasBg =
      item.hasBg !== false &&
      item.bgColor !== 'transparent' &&
      item.backgroundColor !== '';
    const effectiveBg = item.bgColor || item.backgroundColor || 'rgba(0, 0, 0, 0.65)';
    const oBg = hasBg ? effectiveBg : undefined;

    const rendered = renderTextOverlayToCanvas(
      canvas,
      ctx,
      oLines,
      oFont,
      oFontSize,
      oLineHeight,
      oColor,
      hasBg,
      oBg,
      oPosX,
      oPosY,
      item.rotation || 0,
      Math.round((item.borderRadius ?? 8) * scale),
      item.opacity ?? 100,
      videoWidth,
      videoHeight,
      oXPercent,
      oYPercent,
      oBoxWidth,
      oPaddingX,
      oPaddingY,
      Math.round((item.feather ?? 0) * scale),
      item.animation,
      item.animationSpeed ?? 5
    );

    const oStart = (item as any).startTime !== undefined ? (item as any).startTime : 0;
    const oEnd = (item as any).endTime !== undefined && (item as any).endTime > 0 ? (item as any).endTime : 999999;

    overlays.push({
      ...rendered,
      kind: 'text',
      startTime: oStart,
      endTime: oEnd,
    });
  }

  return overlays;
}
