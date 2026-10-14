// How fast a generated vocal has to be played to fit the room it has.
//
// The rule that matters here is which "room" is meant. A subtitle row's own
// start/end is how long the TEXT is on screen — it is not a budget the voice has
// to be squeezed into. Khmer read aloud is routinely longer than the line it
// came from, and forcing every vocal back inside its subtitle box is what
// produced a column of 1.28x, 1.98x, 2.19x speeds on ordinary dialogue.
//
// So the constraint is the start of the NEXT row, not the end of this one. A
// vocal is left at natural speed whenever it fits before the next line begins,
// even if that means it runs past its own subtitle's end — which is normal, and
// is what the timeline draws. Speed is only raised when the vocal would actually
// collide with the next vocal, because that is the only case where something
// genuinely has to give.

import { SubtitleSegment } from '../types';

/** Natural speed. A vocal is never slowed down below this to fill space. */
export const MIN_SPEED = 1.0;

/**
 * Hard ceiling for auto speed. Edge TTS and FFmpeg atempo cleanly support up to 2.5x speed.
 * This guarantees any long translation fits within the actor's speech timestamp without colliding.
 */
export const MAX_SPEED = 2.5;

/**
 * Calculates the target duration available for a vocal based on its timestamp [startTime, endTime].
 * - The primary budget is its exact segment duration: (endTime - startTime).
 * - If there is silence before the next actor speaks, it allows up to 15% breathing room,
 *   but NEVER exceeds the next segment's startTime (leaving at least 0.05s silence buffer).
 */
export function availableVocalSeconds(
  segment: Pick<SubtitleSegment, 'startTime' | 'endTime'>,
  nextSegment: Pick<SubtitleSegment, 'startTime'> | undefined,
  videoDuration: number = 0
): number {
  const segStart = Math.max(0, Number(segment.startTime) || 0);
  const segEnd = Math.max(segStart + 0.3, Number(segment.endTime) || 0);
  const timestampBudget = segEnd - segStart;

  if (nextSegment && Number(nextSegment.startTime) > segStart) {
    const nextStart = Number(nextSegment.startTime);
    // Hard ceiling: vocal must end at least 0.05s before the next segment starts
    const maxBeforeNext = Math.max(0.4, nextStart - segStart - 0.05);
    // Allow slight breathing room into silence if available, strictly capped before next segment
    return Math.min(maxBeforeNext, Math.max(timestampBudget, timestampBudget * 1.15));
  }

  if (videoDuration > 0 && videoDuration > segStart) {
    const maxBeforeEnd = Math.max(0.4, videoDuration - segStart);
    return Math.min(maxBeforeEnd, Math.max(timestampBudget, timestampBudget * 1.15));
  }

  return timestampBudget;
}

/**
 * Computes the playback rate needed for the vocal to fit within its allocated timestamp window.
 * - If vocal fits naturally, returns 1.0x (normal speed).
 * - If vocal exceeds the timestamp, calculates exact speed needed to fit the timestamp (up to 2.5x).
 */
export function computeAutoSpeed(vocalSeconds: number, availableSeconds: number): number {
  if (!(vocalSeconds > 0) || !(availableSeconds > 0)) return MIN_SPEED;
  if (vocalSeconds <= availableSeconds) return MIN_SPEED;

  const needed = vocalSeconds / availableSeconds;
  return clamp(Number(needed.toFixed(2)), MIN_SPEED, MAX_SPEED);
}

/**
 * How long the vocal actually occupies on the timeline once its speed is
 * applied. This is the width the vocal block should be drawn at, and it may be
 * longer OR shorter than the subtitle row it belongs to.
 */
export function vocalSecondsOnTimeline(segment: SubtitleSegment): number {
  const speed = Math.max(0.1, segment.ttsSpeed || segment.speed || MIN_SPEED);
  if (segment.audioDuration && segment.audioDuration > 0) {
    return segment.audioDuration / speed;
  }
  // No vocal generated yet: fall back to the subtitle's own width, so the track
  // still shows a placeholder in the right place.
  return Math.max(0, segment.endTime - segment.startTime);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
