// Format seconds into MM:SS.ms (e.g. 00:03.46) or HH:MM:SS.ms
export function formatTimeCode(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);

  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');
  const mms = ms.toString().padStart(2, '0');

  return `${mm}:${ss}.${mms}`;
}

// Format seconds into full SRT timestamp (HH:MM:SS,mmm)
export function formatSRTTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const hh = hrs.toString().padStart(2, '0');
  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');
  const mss = ms.toString().padStart(3, '0');

  return `${hh}:${mm}:${ss},${mss}`;
}

// Parse string timecode like "00:03.46" or "00:00:03,460" into seconds
export function parseTimeCode(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.replace(',', '.');
  const parts = clean.split(':');

  if (parts.length === 3) {
    const hrs = parseFloat(parts[0]) || 0;
    const mins = parseFloat(parts[1]) || 0;
    const secs = parseFloat(parts[2]) || 0;
    return hrs * 3600 + mins * 60 + secs;
  } else if (parts.length === 2) {
    const mins = parseFloat(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins * 60 + secs;
  } else {
    return parseFloat(clean) || 0;
  }
}

// Parse raw SRT file content into subtitle segment items
export function parseSRTContent(srtContent: string) {
  const blocks = srtContent.trim().split(/\n\s*\n/);
  const segments = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      // Find timestamp line (contains -->)
      const timeLineIndex = lines.findIndex(l => l.includes('-->'));
      if (timeLineIndex !== -1) {
        const timeParts = lines[timeLineIndex].split('-->');
        const start = parseTimeCode(timeParts[0].trim());
        const end = parseTimeCode(timeParts[1].trim());
        const text = lines.slice(timeLineIndex + 1).join(' ');

        segments.push({
          startTime: start,
          endTime: end,
          text: text,
          voiceProfile: (i % 2 === 0 ? 'km-KH-PisethNeural' : 'km-KH-SreymomNeural') as 'km-KH-PisethNeural' | 'km-KH-SreymomNeural',
          gender: (i % 2 === 0 ? 'male' : 'female') as 'male' | 'female',
          speed: 1.0,
        });
      }
    }
  }
  return segments;
}

// Generate raw SRT file string from segment list
export function generateSRTContent(segments: Array<{ startTime: number; endTime: number; text: string }>): string {
  return segments
    .map((seg, idx) => {
      const num = idx + 1;
      const start = formatSRTTime(seg.startTime);
      const end = formatSRTTime(seg.endTime);
      return `${num}\n${start} --> ${end}\n${seg.text}\n`;
    })
    .join('\n');
}

/**
 * Intelligently align and fix overlapping or stacked subtitle timestamps without destroying dialogue pauses
 */
export function smartAlignTimelineSegments<T extends { startTime: number; endTime: number; text?: string; audioDuration?: number; speed?: number; ttsSpeed?: number }>(
  segments: T[],
  totalDuration: number = 0
): T[] {
  if (!segments || segments.length === 0) return [];

  // Clone with preserved initial indices
  const items = segments.map((seg, originalIndex) => {
    let textLen = seg.text ? seg.text.trim().length : 12;
    let idealDur = seg.audioDuration && seg.audioDuration > 0
      ? Math.max(1.2, seg.audioDuration)
      : Math.max(1.5, Math.min(6.0, textLen * 0.06 + 1.2));

    let s = typeof seg.startTime === 'number' && !isNaN(seg.startTime) ? Math.max(0, seg.startTime) : 0;
    let e = typeof seg.endTime === 'number' && !isNaN(seg.endTime) ? seg.endTime : s + idealDur;

    if (e <= s + 0.3) {
      e = s + idealDur;
    }

    return {
      ...seg,
      startTime: s,
      endTime: e,
      idealDur,
      originalIndex,
    };
  });

  // Sort by startTime, tie-break by original index
  items.sort((a, b) => {
    if (Math.abs(a.startTime - b.startTime) < 0.05) {
      return a.originalIndex - b.originalIndex;
    }
    return a.startTime - b.startTime;
  });

  // Step 1: Clean overlaps without cascading or compressing empty pauses
  for (let i = 0; i < items.length; i++) {
    const curr = items[i];
    if (i > 0) {
      const prev = items[i - 1];
      // If previous segment bleeds into current segment's start time
      if (prev.endTime > curr.startTime - 0.02) {
        if (curr.startTime > prev.startTime + 0.4) {
          prev.endTime = Number((curr.startTime - 0.04).toFixed(2));
        } else {
          // If both started at identical timestamp, give current an offset
          curr.startTime = Number((prev.endTime + 0.06).toFixed(2));
          const dur = Math.max(0.3, curr.endTime - curr.startTime);
          curr.endTime = Number((curr.startTime + dur).toFixed(2));
        }
      }
    }
  }

  // Step 2: Bound checking against max totalDuration
  const maxDur = totalDuration > 0 ? totalDuration : 0;
  if (maxDur > 0) {
    for (const it of items) {
      if (it.endTime > maxDur) {
        it.endTime = Number(maxDur.toFixed(2));
        if (it.startTime >= maxDur) {
          it.startTime = Number(Math.max(0, maxDur - 1.0).toFixed(2));
        }
      }
    }
  }

  // Clean up and update auto speeds
  return items.map((item) => {
    const s = Number(Math.max(0, item.startTime).toFixed(2));
    const e = Number(Math.max(s + 0.3, item.endTime).toFixed(2));
    const dur = e - s;

    let updatedSpeed = item.speed || 1.0;
    if (item.audioDuration && item.audioDuration > 0 && dur > 0) {
      const rawSpeed = item.audioDuration / dur;
      updatedSpeed = rawSpeed > 2.0 ? 2.0 : Math.min(Math.max(Number(rawSpeed.toFixed(2)), 1.0), 2.0);
    }

    const { idealDur, originalIndex, ...cleanObj } = item as any;
    return {
      ...cleanObj,
      startTime: s,
      endTime: e,
      speed: updatedSpeed,
      ttsSpeed: updatedSpeed,
    };
  });
}
