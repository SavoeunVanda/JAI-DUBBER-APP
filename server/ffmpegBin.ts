import path from 'path';
import fs from 'fs';
import os from 'os';

let cachedFFmpegPath: string | null = null;
let cachedFFprobePath: string | null = null;

/**
 * Searches for an executable binary (ffmpeg.exe or ffprobe.exe) in:
 * 1. Process environment overrides (FFMPEG_PATH / FFPROBE_PATH)
 * 2. Electron packaged resources (process.resourcesPath/bin)
 * 3. Local project bin directory (process.cwd()/bin, __dirname/../bin)
 * 4. Fallback system installation paths
 * 5. System PATH
 */
function resolveBinary(binaryName: 'ffmpeg.exe' | 'ffprobe.exe'): string {
  const envVar = binaryName === 'ffmpeg.exe' ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  if (envVar && fs.existsSync(envVar)) {
    return path.resolve(envVar);
  }

  const isWindows = process.platform === 'win32';
  const name = isWindows ? binaryName : binaryName.replace(/\.exe$/, '');

  const candidates: Array<string | undefined | null> = [
    // Electron production resource path (for NSIS setup & unpacked portable)
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'bin', name) : null,
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'app', 'bin', name) : null,

    // Relative to current working directory
    path.join(process.cwd(), 'bin', name),

    // Relative to this file's location (in dist or in server)
    path.join(typeof __dirname !== 'undefined' ? __dirname : process.cwd(), '..', 'bin', name),
    path.join(typeof __dirname !== 'undefined' ? __dirname : process.cwd(), '..', '..', 'bin', name),
    path.join(typeof __dirname !== 'undefined' ? __dirname : process.cwd(), 'bin', name),

    // Fallback path if installed via Multi Tool KH on local machine
    isWindows
      ? path.join(
          process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
          'Programs',
          'Multi Tool KH',
          'system',
          'ffmpeg',
          name
        )
      : null,
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile()) {
          return path.resolve(candidate);
        }
      } catch {}
    }
  }

  // Fallback to command name on system PATH
  return name;
}

/**
 * Returns the absolute path to ffmpeg.exe
 */
export function getFFmpegPath(): string {
  if (!cachedFFmpegPath) {
    cachedFFmpegPath = resolveBinary('ffmpeg.exe');
  }
  return cachedFFmpegPath;
}

/**
 * Returns the absolute path to ffprobe.exe
 */
export function getFFprobePath(): string {
  if (!cachedFFprobePath) {
    cachedFFprobePath = resolveBinary('ffprobe.exe');
  }
  return cachedFFprobePath;
}

/**
 * Checks if a working FFmpeg binary is available
 */
export function isFFmpegAvailable(): boolean {
  const p = getFFmpegPath();
  if (fs.existsSync(p)) return true;
  return p === 'ffmpeg' || p === 'ffmpeg.exe';
}

/**
 * Initializes the environment by prepending the FFmpeg/FFprobe binary directory
 * to process.env.PATH and configuring FFMPEG_PATH / FFPROBE_PATH.
 */
export function initFFmpegEnv(): void {
  const ffmpeg = getFFmpegPath();
  const ffprobe = getFFprobePath();

  if (fs.existsSync(ffmpeg)) {
    const binDir = path.dirname(ffmpeg);
    // Prepend to PATH so any child_process.exec/spawn also picks it up
    if (!process.env.PATH?.includes(binDir)) {
      process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH || ''}`;
    }
    process.env.FFMPEG_PATH = ffmpeg;
    console.log(`[FFmpeg] Initialized bundled FFmpeg: ${ffmpeg}`);
  } else {
    console.log(`[FFmpeg] Using system FFmpeg command: ${ffmpeg}`);
  }

  if (fs.existsSync(ffprobe)) {
    process.env.FFPROBE_PATH = ffprobe;
    console.log(`[FFmpeg] Initialized bundled FFprobe: ${ffprobe}`);
  } else {
    console.log(`[FFmpeg] Using system FFprobe command: ${ffprobe}`);
  }
}
