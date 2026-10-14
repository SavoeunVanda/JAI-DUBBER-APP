import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { findSystemPython } from './aiEngineManager';

export interface AutoDubJobData {
  sourceFolder: string;
  outputFolder: string;
  apiKeys?: string[] | Array<{ key: string; name?: string; status?: string; enabled?: boolean }>;
  geminiModel?: string;
  dramaStyle?: string;
  voice?: string;
  voiceRate?: number;
  voicePitch?: number;
  audioMode?: 'mute_original' | 'mute_vocal' | 'duck_original';
  duckVolume?: number;
  syncOffsetMs?: number;
  subtitleBurn?: boolean;
  subtitleFont?: string;
  subtitleYPct?: number;
  subtitleColor?: string;
  subtitleFontSize?: number;
  subtitleWidthPct?: number;
  subtitleBgColor?: string;
  subtitleBgOpacity?: number;
  subtitleStyleType?: string;
  subtitleMaxLines?: number;
  subtitleStyle?: any;
  skipExisting?: boolean;
  selectedFiles?: string[];
}

export interface AutoDubVideoItem {
  name: string;
  path: string;
  size: number;
  alreadyDubbed: boolean;
  outputPath?: string;
}

export interface ActiveJobState {
  isRunning: boolean;
  isCancelled: boolean;
  childProcess: ChildProcess | null;
  jobFile: string | null;
  startedAt: number | null;
  currentVideoName: string | null;
  currentIndex: number;
  totalVideos: number;
  percent: number;
  lastMessage: string;
  eventListeners: Set<(event: any) => void>;
}

const activeJob: ActiveJobState = {
  isRunning: false,
  isCancelled: false,
  childProcess: null,
  jobFile: null,
  startedAt: null,
  currentVideoName: null,
  currentIndex: 0,
  totalVideos: 0,
  percent: 0,
  lastMessage: '',
  eventListeners: new Set(),
};

function getPythonPath(): string {
  const py = findSystemPython();
  if (py?.path) return py.path;
  return 'python';
}

function getRunnerScriptPath(): string {
  const candidates = [
    path.resolve(__dirname, 'autodub', 'autodub_runner.py'),
    path.resolve(__dirname, 'server', 'autodub', 'autodub_runner.py'),
    path.resolve(process.cwd(), 'server', 'autodub', 'autodub_runner.py'),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return path.resolve(process.cwd(), 'server', 'autodub', 'autodub_runner.py');
}

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.mov', '.avi', '.webm', '.ts', '.m2ts', '.mts',
  '.flv', '.f4v', '.m4v', '.wmv', '.3gp', '.3g2', '.vob', '.ogv',
  '.rmvb', '.rm', '.asf', '.divx'
]);

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Lists videos in folder and checks whether each is already dubbed.
 * Executed instantly via native Node.js filesystem APIs (< 10ms instead of 2.5s Python startup).
 */
export async function listAutoDubVideos(
  sourceFolder: string,
  exportFolder: string
): Promise<AutoDubVideoItem[]> {
  if (!sourceFolder || !fs.existsSync(sourceFolder)) {
    return [];
  }

  try {
    const normSource = path.resolve(sourceFolder);
    const targetExport = exportFolder ? path.resolve(exportFolder) : path.join(normSource, 'DUBBED_KH');

    // 1. Scan source directory for video files
    const entries = fs.readdirSync(normSource, { withFileTypes: true });
    const videoFiles: { name: string; fullPath: string; size: number }[] = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          const fullPath = path.join(normSource, entry.name);
          let size = 0;
          try {
            size = fs.statSync(fullPath).size;
          } catch {}
          videoFiles.push({ name: entry.name, fullPath, size });
        }
      }
    }

    // 2. Natural sort (EP1, EP2, ... EP10, EP11, etc.)
    videoFiles.sort((a, b) => naturalCollator.compare(a.name, b.name));

    // 3. Pre-index export folder to check alreadyDubbed in O(1) time
    const exportFileSizes = new Map<string, number>();
    if (fs.existsSync(targetExport)) {
      try {
        const outEntries = fs.readdirSync(targetExport, { withFileTypes: true });
        for (const outEntry of outEntries) {
          if (outEntry.isFile()) {
            const outPath = path.join(targetExport, outEntry.name);
            try {
              const sz = fs.statSync(outPath).size;
              exportFileSizes.set(outEntry.name.toLowerCase(), sz);
            } catch {}
          }
        }
      } catch {}
    }

    // 4. Construct final items
    const result: AutoDubVideoItem[] = [];
    for (const v of videoFiles) {
      const baseName = path.parse(v.name).name;
      const stdOutName = `${baseName}_KH.mp4`;
      const outputPath = path.join(targetExport, stdOutName);

      // Check standard target or any alternative video format candidate (> 100KB)
      let alreadyDubbed = false;
      const stdSize = exportFileSizes.get(stdOutName.toLowerCase());
      if (stdSize !== undefined && stdSize > 100 * 1024) {
        alreadyDubbed = true;
      } else {
        for (const ext of VIDEO_EXTENSIONS) {
          const cand = `${baseName}_KH${ext}`.toLowerCase();
          const sz = exportFileSizes.get(cand);
          if (sz !== undefined && sz > 100 * 1024) {
            alreadyDubbed = true;
            break;
          }
        }
      }

      result.push({
        name: v.name,
        path: v.fullPath,
        size: v.size,
        alreadyDubbed,
        outputPath,
      });
    }

    return result;
  } catch (err: any) {
    console.error(`[autodubBridge] listAutoDubVideos error: ${err?.message}`);
    return [];
  }
}

const recentEvents: any[] = [];

/**
 * Broadcast an event to all attached SSE / callback listeners.
 */
function broadcastEvent(event: any) {
  recentEvents.push(event);
  if (recentEvents.length > 200) {
    recentEvents.shift();
  }

  if (event.type === 'video_start') {
    activeJob.currentVideoName = event.name || path.basename(event.path || '');
    activeJob.currentIndex = event.index || 0;
    activeJob.totalVideos = event.total || 0;
    activeJob.percent = 0;
  } else if (event.type === 'progress') {
    if (event.message) activeJob.lastMessage = event.message;
    if (typeof event.percent === 'number') activeJob.percent = event.percent;
  } else if (event.type === 'video_done' || event.type === 'video_skipped') {
    activeJob.percent = 100;
  } else if (event.type === 'complete' || event.type === 'cancelled') {
    activeJob.isRunning = false;
  }

  for (const listener of activeJob.eventListeners) {
    try {
      listener(event);
    } catch (e) {
      console.error('[autodubBridge] Listener error:', e);
    }
  }
}

/**
 * Starts the Auto Dubbing process using Python autodub_runner.py.
 */
export async function startAutoDubbing(
  jobData: AutoDubJobData,
  onEvent?: (event: any) => void
): Promise<{ ok: boolean; message: string }> {
  if (activeJob.isRunning) {
    return { ok: false, message: 'ដំណើរការ Auto Dubbing កំពុងដំណើរការរួចហើយ (Job already running)' };
  }

  const pythonPath = getPythonPath();
  const runnerScript = getRunnerScriptPath();
  const autodubDir = path.dirname(runnerScript);

  if (!fs.existsSync(runnerScript)) {
    return { ok: false, message: `រកមិនឃើញស្គ្រីប Python Runner: ${runnerScript}` };
  }

  // Write temporary job configuration file
  const tmpJobFile = path.join(os.tmpdir(), `jai_autodub_job_${Date.now()}.json`);
  fs.writeFileSync(tmpJobFile, JSON.stringify(jobData, null, 2), 'utf-8');

  recentEvents.length = 0;
  activeJob.isRunning = true;
  activeJob.isCancelled = false;
  activeJob.jobFile = tmpJobFile;
  activeJob.startedAt = Date.now();
  activeJob.currentVideoName = null;
  activeJob.currentIndex = 0;
  activeJob.totalVideos = 0;
  activeJob.percent = 0;
  activeJob.lastMessage = 'កំពុងចាប់ផ្តើម...';

  if (onEvent) {
    activeJob.eventListeners.add(onEvent);
  }

  try {
    const child = spawn(pythonPath, [runnerScript, '--job', tmpJobFile], {
      cwd: autodubDir,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        PYTHONUTF8: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    activeJob.childProcess = child;

    let lineBuffer = '';

    child.stdout.on('data', (chunk) => {
      lineBuffer += chunk.toString('utf-8');
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          broadcastEvent(event);
        } catch {
          // If it's a non-JSON log line from python/pydub/ffmpeg
          broadcastEvent({ type: 'log', message: trimmed });
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      const errText = chunk.toString('utf-8').trim();
      if (errText) {
        console.warn('[autodub stderr]:', errText);
        broadcastEvent({ type: 'log', message: errText });
      }
    });

    child.on('error', (err) => {
      console.error('[autodub child error]:', err);
      broadcastEvent({ type: 'error', message: err.message });
      cleanupActiveJob();
    });

    child.on('close', (code) => {
      if (lineBuffer.trim()) {
        try {
          const event = JSON.parse(lineBuffer.trim());
          broadcastEvent(event);
        } catch {}
      }

      if (code !== 0 && !activeJob.isCancelled) {
        broadcastEvent({
          type: 'error',
          message: `Auto Dubbing process exited with code ${code}`,
        });
      }

      cleanupActiveJob();
    });

    return { ok: true, message: 'Auto Dubbing started successfully' };
  } catch (err: any) {
    cleanupActiveJob();
    return { ok: false, message: err?.message || 'Failed to launch Auto Dubbing' };
  }
}

function cleanupActiveJob() {
  activeJob.isRunning = false;
  activeJob.childProcess = null;
  if (activeJob.jobFile && fs.existsSync(activeJob.jobFile)) {
    try {
      fs.unlinkSync(activeJob.jobFile);
    } catch {}
  }
  activeJob.jobFile = null;
}

/**
 * Gracefully cancels the currently active Auto Dubbing job.
 */
export function cancelAutoDubbing(): { ok: boolean } {
  if (!activeJob.isRunning && !activeJob.childProcess) {
    return { ok: true };
  }

  activeJob.isCancelled = true;
  activeJob.lastMessage = 'កំពុងបញ្ឈប់ (Cancelling)...';
  broadcastEvent({ type: 'cancelled', message: 'Job cancelled by user' });

  if (activeJob.childProcess) {
    try {
      // Send cancel command to stdin first
      activeJob.childProcess.stdin?.write(JSON.stringify({ action: 'cancel' }) + '\n');
    } catch {}

    // Fallback: kill process tree after delay if not exited
    const pid = activeJob.childProcess.pid;
    setTimeout(() => {
      if (activeJob.childProcess && pid) {
        try {
          if (process.platform === 'win32') {
            execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
          } else {
            activeJob.childProcess.kill('SIGKILL');
          }
        } catch {}
      }
      cleanupActiveJob();
    }, 1500);
  } else {
    cleanupActiveJob();
  }

  return { ok: true };
}

/**
 * Attaches a listener for real-time progress events.
 * Returns an unsubscribe function.
 */
export function subscribeToAutoDubEvents(listener: (event: any) => void): () => void {
  for (const prev of recentEvents) {
    try {
      listener(prev);
    } catch {}
  }
  activeJob.eventListeners.add(listener);
  return () => {
    activeJob.eventListeners.delete(listener);
  };
}

/**
 * Returns the current status of the auto dubbing engine.
 */
export function getAutoDubStatus() {
  return {
    isRunning: activeJob.isRunning,
    isCancelled: activeJob.isCancelled,
    currentVideo: activeJob.currentVideoName,
    currentIndex: activeJob.currentIndex,
    totalVideos: activeJob.totalVideos,
    percent: activeJob.percent,
    lastMessage: activeJob.lastMessage,
    startedAt: activeJob.startedAt,
  };
}
