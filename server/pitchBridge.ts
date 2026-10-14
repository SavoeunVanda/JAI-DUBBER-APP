import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { findPythonPath } from './whisperBridge';

export interface PitchSegmentInput {
  id: string | number;
  startTime: number;
  endTime: number;
  text?: string;
  meaning?: string;
  originalText?: string;
  gender?: string;
  voiceProfile?: string;
}

export interface PitchDetectionResult {
  id: string | number;
  gender: 'male' | 'female';
  voiceProfile: 'km-KH-PisethNeural' | 'km-KH-SreymomNeural';
  pitchHz?: number;
  voicedFrames?: number;
  confidence?: number;
}

export function getPitchScriptPath(): string {
  const baseDir = __dirname;
  const candidates = [
    path.resolve(baseDir, 'audio_pitch_detector.py'),
    path.resolve(baseDir, 'server', 'audio_pitch_detector.py'),
    path.resolve(baseDir, '..', 'server', 'audio_pitch_detector.py'),
    path.resolve(baseDir, 'dist', 'server', 'audio_pitch_detector.py'),
    path.resolve(process.cwd(), 'server', 'audio_pitch_detector.py'),
    path.resolve(process.cwd(), 'dist', 'server', 'audio_pitch_detector.py'),
    path.resolve((process as any).resourcesPath || '', 'server', 'audio_pitch_detector.py'),
    path.resolve((process as any).resourcesPath || '', 'app', 'server', 'audio_pitch_detector.py'),
    path.resolve((process as any).resourcesPath || '', 'app', 'dist', 'server', 'audio_pitch_detector.py'),
    path.resolve((process as any).resourcesPath || '', 'app.asar.unpacked', 'server', 'audio_pitch_detector.py'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(baseDir, 'audio_pitch_detector.py');
}

export async function detectAudioPitchGenders(
  mediaPath: string,
  segments: PitchSegmentInput[]
): Promise<PitchDetectionResult[]> {
  const pythonBin = findPythonPath();
  const scriptPath = getPitchScriptPath();

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Audio pitch detector script not found at ${scriptPath}`);
  }

  const tempDir = os.tmpdir();
  const segJsonPath = path.join(tempDir, `pitch_seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const outJsonPath = path.join(tempDir, `pitch_out_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);

  await fs.promises.writeFile(segJsonPath, JSON.stringify(segments), 'utf-8');

  return new Promise<PitchDetectionResult[]>((resolve, reject) => {
    const args = [
      scriptPath,
      '--media', mediaPath,
      '--segments', segJsonPath,
      '--output', outJsonPath,
    ];

    const child = spawn(pythonBin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrBuffer = '';
    child.stderr.on('data', (d) => {
      stderrBuffer += d.toString('utf-8');
    });

    let isDone = false;
    const timeoutHandle = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        try {
          child.kill('SIGKILL');
        } catch {}
        cleanup();
        reject(new Error('Acoustic pitch detection timed out after 60s'));
      }
    }, 60000);

    child.on('error', (err) => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timeoutHandle);
      cleanup();
      reject(new Error(`Failed to spawn pitch detector: ${err.message}`));
    });

    child.on('close', async (code) => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timeoutHandle);
      try {
        if (code !== 0 || !fs.existsSync(outJsonPath)) {
          cleanup();
          reject(new Error(`Pitch detection failed with exit code ${code}: ${stderrBuffer.trim()}`));
          return;
        }

        const raw = await fs.promises.readFile(outJsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        cleanup();
        if (parsed.ok && Array.isArray(parsed.detected)) {
          resolve(parsed.detected);
        } else {
          reject(new Error(parsed.error || 'Pitch detection returned invalid data'));
        }
      } catch (e: any) {
        cleanup();
        reject(e);
      }
    });

    function cleanup() {
      clearTimeout(timeoutHandle);
      try {
        if (fs.existsSync(segJsonPath)) fs.unlinkSync(segJsonPath);
      } catch {}
      try {
        if (fs.existsSync(outJsonPath)) fs.unlinkSync(outJsonPath);
      } catch {}
    }
  });
}
