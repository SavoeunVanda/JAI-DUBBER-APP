import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface WhisperResult {
  language: string;
  languageProbability: number;
  duration: number;
  segments: WhisperSegment[];
}

export interface RunWhisperOptions {
  model?: string;
  language?: string;
  isCancelled?: () => boolean;
  onProgress?: (message: string) => void;
}

let cachedPythonPath: string | null = null;

/**
 * Locate a working Python executable that has faster-whisper installed.
 */
export function findPythonPath(): string {
  if (cachedPythonPath && fs.existsSync(cachedPythonPath)) {
    return cachedPythonPath;
  }

  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

  const candidates: string[] = [];

  if (process.env.PYTHON_PATH) {
    candidates.push(process.env.PYTHON_PATH);
  }

  const savedFiles = [
    path.join(localAppData, 'JAI DUBBER', 'python-path.txt'),
    path.resolve(baseDir, 'python-path.txt'),
    path.resolve(baseDir, 'server', 'python-path.txt'),
    path.resolve((process as any).resourcesPath || '', 'server', 'python-path.txt'),
  ];
  for (const sf of savedFiles) {
    try {
      if (fs.existsSync(sf)) {
        const saved = fs.readFileSync(sf, 'utf-8').trim();
        if (saved && !candidates.includes(saved)) {
          candidates.push(saved);
        }
      }
    } catch {}
  }

  candidates.push(
    path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(programFiles, 'Python311', 'python.exe'),
    path.join(programFiles, 'Python312', 'python.exe'),
    path.join(programFiles, 'Python310', 'python.exe'),
    path.join(programFiles, 'Python313', 'python.exe'),
    'C:\\Python311\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Python310\\python.exe',
    'C:\\Python313\\python.exe',
    'python',
    'python3',
    'py'
  );

  for (const candidate of candidates) {
    try {
      const checkCmd = candidate.includes(' ') || candidate.includes('\\')
        ? `"${candidate}" -c "import sys, faster_whisper; print('OK|' + sys.executable)"`
        : `${candidate} -c "import sys, faster_whisper; print('OK|' + sys.executable)"`;

      const out = execSync(checkCmd, { encoding: 'utf-8', timeout: 45000, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      if (out.includes('OK|')) {
        const resolvedExe = out.split('OK|')[1]?.trim() || candidate;
        cachedPythonPath = resolvedExe;
        console.log(`[WhisperBridge] Found Python with faster-whisper: ${resolvedExe}`);
        return resolvedExe;
      }
    } catch {
      // Continue searching
    }
  }

  cachedPythonPath = 'python';
  return 'python';
}

/**
 * Checks if Fast-Whisper is ready to be used.
 */
export function isWhisperAvailable(): boolean {
  try {
    const py = findPythonPath();
    const out = execSync(`"${py}" -c "import faster_whisper; print('READY')"`, {
      encoding: 'utf-8',
      timeout: 45000,
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    return out.includes('READY');
  } catch {
    return false;
  }
}

/**
 * Resolves the location of server/whisper_transcribe.py
 */
export function getWhisperScriptPath(): string {
  const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const possiblePaths = [
    path.resolve(baseDir, 'whisper_transcribe.py'),
    path.resolve(baseDir, 'server', 'whisper_transcribe.py'),
    path.resolve(baseDir, '..', 'server', 'whisper_transcribe.py'),
    path.resolve(baseDir, 'dist', 'server', 'whisper_transcribe.py'),
    path.resolve(process.cwd(), 'server', 'whisper_transcribe.py'),
    path.resolve(process.cwd(), 'dist', 'server', 'whisper_transcribe.py'),
    path.resolve((process as any).resourcesPath || '', 'server', 'whisper_transcribe.py'),
    path.resolve((process as any).resourcesPath || '', 'app', 'server', 'whisper_transcribe.py'),
    path.resolve((process as any).resourcesPath || '', 'app', 'dist', 'server', 'whisper_transcribe.py'),
    path.resolve((process as any).resourcesPath || '', 'app.asar.unpacked', 'server', 'whisper_transcribe.py'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return path.resolve(baseDir, 'whisper_transcribe.py');
}

/**
 * Runs Fast-Whisper transcription on the given audio/video file.
 */
export async function runWhisperTranscription(
  audioPath: string,
  options: RunWhisperOptions = {}
): Promise<WhisperResult> {
  const { model = 'large-v3-turbo', language, isCancelled, onProgress } = options;

  const pythonBin = findPythonPath();
  const scriptPath = getWhisperScriptPath();

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Whisper transcription script not found at ${scriptPath}`);
  }

  const tempOutputFile = path.join(
    os.tmpdir(),
    `whisper_out_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`
  );

  const args: string[] = [
    scriptPath,
    '--audio', audioPath,
    '--model', model,
    '--device', 'auto',
    '--output', tempOutputFile
  ];

  if (language && language.toLowerCase() !== 'auto') {
    args.push('--language', language);
  }

  onProgress?.('⚡ កំពុងរៀបចំ Fast-Whisper AI Model...');

  return new Promise<WhisperResult>((resolve, reject) => {
    const child = spawn(pythonBin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderrBuffer = '';

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stderrBuffer += text;

      if (text.includes('Loading Fast-Whisper model')) {
        onProgress?.('⚡ កំពុងផ្ទុក Fast-Whisper AI Model...');
      } else if (text.includes('Transcribing audio with sensitive VAD') || text.includes('Transcribing audio with VAD')) {
        onProgress?.('🎙️ Fast-Whisper កំពុងស្ដាប់ និងស្រង់សំឡេង (VAD Filter)...');
      } else if (text.includes('Retrying WITHOUT VAD')) {
        onProgress?.('🎙️ កំពុងស្ដាប់ស៊ីជម្រៅដោយផ្ទាល់ (Whisper Deep Attention)...');
      } else if (text.includes('Retrying on isolated audio channel')) {
        onProgress?.('🎙️ កំពុងស្រង់សំឡេងតាមប៉ុស្តិ៍ដាច់ដោយឡែក (Channel Recovery)...');
      }
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
      try {
        if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
      } catch {}
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });

    child.on('close', (code) => {
      clearInterval(cancelCheckInterval);

      if (code !== 0) {
        try {
          if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
        } catch {}
        reject(
          new Error(
            `Fast-Whisper failed with exit code ${code}.\nDetails: ${stderrBuffer.trim() || 'Unknown error'}`
          )
        );
        return;
      }

      try {
        if (!fs.existsSync(tempOutputFile)) {
          throw new Error('Whisper output JSON file was not generated.');
        }

        const raw = fs.readFileSync(tempOutputFile, 'utf-8');
        const parsed = JSON.parse(raw);

        try {
          fs.unlinkSync(tempOutputFile);
        } catch {}

        resolve({
          language: parsed.language || 'unknown',
          languageProbability: parsed.language_probability || 0,
          duration: parsed.duration || 0,
          segments: Array.isArray(parsed.segments) ? parsed.segments : []
        });
      } catch (parseErr: any) {
        try {
          if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
        } catch {}
        reject(new Error(`Failed to parse Whisper output: ${parseErr.message}`));
      }
    });
  });
}
