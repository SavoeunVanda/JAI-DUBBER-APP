import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { findPythonPath } from './whisperBridge';

export interface DemucsResult {
  success: boolean;
  device: string;
  duration: number;
  timeTaken: number;
  outputBgm: string;
  outputVocals?: string;
  error?: string;
}

export interface DemucsOptions {
  outputBgm?: string;
  outputVocals?: string;
  device?: 'auto' | 'cuda' | 'cpu';
  model?: string;
  isCancelled?: () => boolean;
  onProgress?: (message: string) => void;
}

let cachedDemucsStatus: { available: boolean; cuda: boolean; checkedAt: number } | null = null;

/**
 * Checks if Demucs is installed and ready in Python with PyTorch.
 */
export function checkDemucsAvailability(): { available: boolean; cuda: boolean } {
  const now = Date.now();
  if (cachedDemucsStatus && now - cachedDemucsStatus.checkedAt < 60000) {
    return { available: cachedDemucsStatus.available, cuda: cachedDemucsStatus.cuda };
  }

  try {
    const pythonBin = findPythonPath();
    const checkCmd = `"${pythonBin}" -c "import torch; import demucs; print(f'DEMUCS_READY:CUDA={torch.cuda.is_available()}')"`;
    const out = execSync(checkCmd, {
      encoding: 'utf-8',
      timeout: 45000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    const isAvailable = out.includes('DEMUCS_READY');
    const isCuda = out.includes('CUDA=True');

    cachedDemucsStatus = {
      available: isAvailable,
      cuda: isCuda,
      checkedAt: now,
    };

    return { available: isAvailable, cuda: isCuda };
  } catch {
    cachedDemucsStatus = {
      available: false,
      cuda: false,
      checkedAt: now,
    };
    return { available: false, cuda: false };
  }
}

/**
 * Resolves the location of server/demucs_separate.py
 */
export function getDemucsScriptPath(): string {
  const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const possiblePaths = [
    path.resolve(baseDir, 'demucs_separate.py'),
    path.resolve(baseDir, 'server', 'demucs_separate.py'),
    path.resolve(baseDir, '..', 'server', 'demucs_separate.py'),
    path.resolve(baseDir, 'dist', 'server', 'demucs_separate.py'),
    path.resolve(process.cwd(), 'server', 'demucs_separate.py'),
    path.resolve(process.cwd(), 'dist', 'server', 'demucs_separate.py'),
    path.resolve((process as any).resourcesPath || '', 'server', 'demucs_separate.py'),
    path.resolve((process as any).resourcesPath || '', 'app', 'server', 'demucs_separate.py'),
    path.resolve((process as any).resourcesPath || '', 'app', 'dist', 'server', 'demucs_separate.py'),
    path.resolve((process as any).resourcesPath || '', 'app.asar.unpacked', 'server', 'demucs_separate.py'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return path.resolve(baseDir, 'demucs_separate.py');
}

/**
 * Executes Demucs vocal separation to isolate pure BGM + SFX (no_vocals).
 */
export async function separateAudioDemucs(
  inputPath: string,
  options: DemucsOptions = {}
): Promise<DemucsResult> {
  const {
    outputBgm: customBgmPath,
    outputVocals: customVocalsPath,
    device = 'auto',
    model = 'htdemucs',
    isCancelled,
    onProgress,
  } = options;

  const pythonBin = findPythonPath();
  const scriptPath = getDemucsScriptPath();

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Demucs separation script not found at ${scriptPath}`);
  }

  const outputDir = path.join(os.tmpdir(), `demucs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const outputBgm = customBgmPath || path.join(outputDir, 'bgm_sfx.wav');
  const outputVocals = customVocalsPath || path.join(outputDir, 'vocals.wav');

  const args: string[] = [
    scriptPath,
    '--input', inputPath,
    '--output-bgm', outputBgm,
    '--output-vocals', outputVocals,
    '--device', device,
    '--model', model,
  ];

  onProgress?.('⚡ Demucs AI កំពុងលុបសំឡេងចិនដើម និងស្រង់ភ្លេង BGM + SFX (GPU CUDA)...');

  return new Promise<DemucsResult>((resolve, reject) => {
    const child = spawn(pythonBin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf-8');
    });

    const cancelCheckInterval = setInterval(() => {
      if (isCancelled?.()) {
        clearInterval(cancelCheckInterval);
        try {
          child.kill('SIGTERM');
        } catch {}
        reject(new Error('Cancelled'));
      }
    }, 400);

    child.on('error', (err) => {
      clearInterval(cancelCheckInterval);
      reject(new Error(`Failed to spawn Demucs process: ${err.message}`));
    });

    child.on('close', (code) => {
      clearInterval(cancelCheckInterval);

      if (code !== 0) {
        reject(
          new Error(
            `Demucs separation failed (exit code ${code}).\nDetails: ${stderrBuffer.trim() || stdoutBuffer.trim() || 'Unknown error'}`
          )
        );
        return;
      }

      try {
        const cleanJson = stdoutBuffer.trim().split('\n').pop() || '{}';
        const parsed = JSON.parse(cleanJson);
        if (parsed.success) {
          resolve(parsed);
        } else {
          reject(new Error(parsed.error || 'Demucs separation returned failure'));
        }
      } catch (parseErr: any) {
        reject(new Error(`Failed to parse Demucs output JSON: ${parseErr.message}\nRaw: ${stdoutBuffer}`));
      }
    });
  });
}
