import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getFFmpegPath, getFFprobePath } from '../ffmpegBin';

export interface MediaProbeInfo {
  durationSeconds: number;
  hasAudio: boolean;
  sampleRate?: number;
  channels?: number;
  codec?: string;
}

/**
 * Inspects a media file using ffprobe to detect total duration and audio track specs.
 */
export async function probeMedia(filePath: string): Promise<MediaProbeInfo> {
  return new Promise((resolve, reject) => {
    const ffprobeBin = getFFprobePath();
    const cmd = `"${ffprobeBin}" -v error -show_entries format=duration:stream=index,codec_type,codec_name,sample_rate,channels -of json "${filePath.replace(/"/g, '\\"')}"`;

    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        // Fallback simple probe if JSON flags fail on some stripped ffprobe builds
        return exec(
          `"${ffprobeBin}" -v error -show_entries format=duration -of csv=p=0 "${filePath.replace(/"/g, '\\"')}"`,
          (simpleErr, simpleOut) => {
            if (simpleErr) {
              return reject(new Error(`Failed to probe media file: ${err.message || stderr}`));
            }
            const dur = parseFloat(String(simpleOut).trim()) || 0;
            resolve({
              durationSeconds: dur,
              hasAudio: true,
            });
          }
        );
      }

      try {
        const parsed = JSON.parse(stdout || '{}');
        const formatDuration = parseFloat(parsed.format?.duration || '0');
        const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
        const audioStream = streams.find((s: any) => s.codec_type === 'audio');

        const streamDuration = audioStream?.duration ? parseFloat(audioStream.duration) : 0;
        const durationSeconds = formatDuration > 0 ? formatDuration : streamDuration;

        resolve({
          durationSeconds: Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0,
          hasAudio: Boolean(audioStream),
          sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined,
          channels: audioStream?.channels ? parseInt(audioStream.channels, 10) : undefined,
          codec: audioStream?.codec_name,
        });
      } catch (parseErr) {
        reject(new Error(`ffprobe JSON parse error: ${parseErr}`));
      }
    });
  });
}

/**
 * Extracts a lightweight mono MP3 / WAV audio track from a video file for Gemini transcription.
 */
export async function extractAudioTrack(
  videoPath: string,
  outputPath?: string,
  options?: { sampleRate?: number; mono?: boolean }
): Promise<string> {
  const targetOut = outputPath || path.join(os.tmpdir(), `jai_audio_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
  const sampleRate = options?.sampleRate || 16000;
  // Default to mono (-ac 1) for AI speech models (Fast-Whisper & Gemini) to keep payload compact for full episodes
  const ac = options?.mono === false ? '-ac 2' : '-ac 1';

  return new Promise((resolve, reject) => {
    const ffmpegBin = getFFmpegPath();
    // Normalize and boost speech clarity with dynaudnorm
    const filter = 'dynaudnorm=f=150:g=15:m=12:p=0.95';
    const cmd = `"${ffmpegBin}" -y -i "${videoPath.replace(/"/g, '\\"')}" -vn -ar ${sampleRate} ${ac} -af "${filter}" -b:a 64k "${targetOut.replace(/"/g, '\\"')}"`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        // Fallback without filter if audio format doesn't accept dynaudnorm
        const fbCmd = `"${ffmpegBin}" -y -i "${videoPath.replace(/"/g, '\\"')}" -vn -ar ${sampleRate} ${ac} -b:a 64k "${targetOut.replace(/"/g, '\\"')}"`;
        return exec(fbCmd, (fbErr, fbOut, fbStderr) => {
          if (fbErr) {
            return reject(new Error(`Audio extraction failed: ${fbStderr || fbErr.message}`));
          }
          resolve(targetOut);
        });
      }
      resolve(targetOut);
    });
  });
}

/**
 * Extracts a specific time slice of audio with sample-accurate seeking.
 */
export async function extractAudioSlice(
  sourcePath: string,
  startSec: number,
  durationSec: number,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpegBin = getFFmpegPath();
    // Put -ss and -t AFTER -i for sample-accurate extraction on audio stream
    const cmd = `"${ffmpegBin}" -y -i "${sourcePath.replace(/"/g, '\\"')}" -ss ${startSec.toFixed(3)} -t ${durationSec.toFixed(3)} -vn -ar 16000 -ac 2 -b:a 128k "${outputPath.replace(/"/g, '\\"')}"`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`Audio slice extraction failed: ${stderr || err.message}`));
      }
      resolve(outputPath);
    });
  });
}
