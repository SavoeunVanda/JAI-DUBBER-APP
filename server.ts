import express from 'express';
import { exec, spawn, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { findPythonPath } from './server/whisperBridge';
import { runFFmpegExport, checkNvencAvailable, ensureKhmerFonts } from './server/ffmpegExporter';
import { checkDemucsAvailability, separateAudioDemucs } from './server/demucsBridge';
import {
  getAiEngineStatus,
  startAiEngineInstall,
  cancelAiEngineInstall,
  getInstallProgress,
} from './server/aiEngineManager';
import { transcribeVideo, detectSpeechTimings, TranscribeError } from './server/transcribe';
import { probeMedia } from './server/transcribe/media';
import { GEMINI_MODELS, SUPPORTED_GEMINI_MODELS } from './server/transcribe/prompt';
import { pickFolderNatively, FolderDialogUnavailableError } from './server/nativeFolderDialog';
import { initFFmpegEnv, getFFmpegPath, getFFprobePath, isFFmpegAvailable } from './server/ffmpegBin';
import {
  listAutoDubVideos,
  startAutoDubbing,
  cancelAutoDubbing,
  getAutoDubStatus,
  subscribeToAutoDubEvents,
} from './server/autodubBridge';
import {
  getLicenseStatus,
  activateLicense,
  deactivateLicense,
  getMachineId,
  isLicenseCurrentlyValid,
} from './server/licenseService';
import { detectAudioPitchGenders } from './server/pitchBridge';

// Initialize bundled or system FFmpeg & FFprobe environment
initFFmpegEnv();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const upload = multer({
  dest: path.join(os.tmpdir(), 'jai_uploads'),
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB limit
    fieldSize: 500 * 1024 * 1024, // 500MB limit for text fields
    fields: 2000
  }
});

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// License Management API
app.get('/api/license/status', async (req, res) => {
  try {
    const status = await getLicenseStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ isActivated: false, error: err.message, machineId: getMachineId() });
  }
});

app.post('/api/license/activate', async (req, res) => {
  try {
    const { licenseKey } = req.body || {};
    const result = await activateLicense(licenseKey);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/license/deactivate', (req, res) => {
  try {
    const result = deactivateLicense();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/license/machine-id', (req, res) => {
  res.json({ machineId: getMachineId() });
});

// App Auto-Updater API (Query GitHub Releases: SavoeunVanda/JAI-DUBBER-APP)
function compareVersions(v1: string, v2: string): number {
  const p1 = (v1 || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = (v2 || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

app.get('/api/updater/check', async (req, res) => {
  try {
    let currentVersion = '1.0.5';
    try {
      const pkgPath = path.join(__dirname, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) currentVersion = pkg.version;
      }
    } catch {}

    const resp = await fetch('https://api.github.com/repos/SavoeunVanda/JAI-DUBBER-APP/releases/latest', {
      headers: {
        'User-Agent': 'JAI-DUBBER-App',
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (resp.status === 404) {
      return res.json({
        ok: true,
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        message: 'មិនទាន់មាន Release ថ្មីនៅលើ GitHub ឡើយ។ កំណែរបស់អ្នកគឺចុងក្រោយបំផុត!',
      });
    }

    if (!resp.ok) {
      return res.json({
        ok: true,
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        message: `GitHub Releases: ${resp.statusText}`,
      });
    }

    const releaseData: any = await resp.json();
    const rawTag = releaseData.tag_name || '';
    const latestVersion = rawTag.replace(/^v/i, '');

    const isNewer = compareVersions(latestVersion, currentVersion) > 0;

    const setupAsset = (releaseData.assets || []).find(
      (a: any) => a.name && a.name.endsWith('.exe') && !a.name.toLowerCase().includes('portable')
    );
    const portableAsset = (releaseData.assets || []).find(
      (a: any) => a.name && a.name.toLowerCase().includes('portable') && a.name.endsWith('.exe')
    );

    res.json({
      ok: true,
      hasUpdate: isNewer,
      currentVersion,
      latestVersion,
      releaseName: releaseData.name || rawTag,
      releaseNotes: releaseData.body || '',
      publishedAt: releaseData.published_at,
      downloadUrl: setupAsset ? setupAsset.browser_download_url : releaseData.html_url,
      portableDownloadUrl: portableAsset ? portableAsset.browser_download_url : null,
      htmlUrl: releaseData.html_url,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Backend API License Guard Middleware:
// Protects all core endpoints (/api/transcribe, /api/tts, /api/export, /api/autodub/*, etc.)
// against UI tampering or direct API calls when no valid license is active.
app.use('/api', async (req, res, next) => {
  const openPaths = [
    '/health',
    '/license/status',
    '/license/activate',
    '/license/deactivate',
    '/license/machine-id',
    '/updater/check',
  ];
  if (openPaths.some((p) => req.path === p || req.path.startsWith('/license/'))) {
    return next();
  }

  try {
    const check = await isLicenseCurrentlyValid();
    if (!check.valid) {
      res.status(403).json({
        error: check.message || '🔒 សូម Activate License Key ជាមុនសិន ទើបអាចប្រើប្រាស់មុខងារនេះបាន!',
        code: 'LICENSE_REQUIRED',
      });
      return;
    }
    next();
  } catch (err: any) {
    res.status(403).json({
      error: '🔒 មិនអាចផ្ទៀងផ្ទាត់ License បានទេ!',
      code: 'LICENSE_REQUIRED',
    });
  }
});

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai && process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

// Official Microsoft Edge Neural TTS Synthesis Bridge using Python edge-tts (Sec-MS-GEC v1-143+ compatible)
async function synthesizeEdgeTTS(
  text: string,
  voice: string = 'km-KH-PisethNeural',
  rateNum: number = 1.0,
  pitchStr: string = '+0Hz'
): Promise<Buffer> {
  const pythonBin = findPythonPath();
  const ratePercent = Math.round((rateNum - 1.0) * 100);
  const rateFormatted = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

  // Prepend a space for initial consonant headroom and ensure ending punctuation so Edge TTS completes the sentence fully
  let safeText = ' ' + text.trim();
  if (!/[។៕.!?,…]$/.test(safeText)) {
    safeText += ' ។';
  } else {
    safeText += ' ';
  }

  const tmpOut = path.join(os.tmpdir(), `jai_tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`);
  const tmpTxt = path.join(os.tmpdir(), `jai_tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.txt`);

  const runSynthesis = async (): Promise<Buffer> => {
    await fs.promises.writeFile(tmpTxt, safeText, 'utf-8');
    const args = [
      '-m', 'edge_tts',
      '--voice', voice,
      '--rate', rateFormatted,
      '--pitch', pitchStr || '+0Hz',
      '--file', tmpTxt,
      '--write-media', tmpOut,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(pythonBin, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString('utf-8'); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 100) {
          resolve();
        } else {
          reject(new Error(`edge-tts failed (code ${code}): ${stderr.trim()}`));
        }
      });
    });

    return await fs.promises.readFile(tmpOut);
  };

  try {
    return await runSynthesis();
  } catch (err: any) {
    const errMsg = String(err?.message || '');
    // If edge-tts is missing or outdated (Sec-MS-GEC 403), auto-upgrade via pip and retry once
    if (errMsg.includes('No module named') || errMsg.includes('403') || errMsg.includes('WSServerHandshakeError')) {
      console.warn('[EdgeTTS] Updating Python edge-tts package to fix Microsoft 403 endpoint...');
      try {
        await new Promise<void>((resolve) => {
          const up = spawn(pythonBin, ['-m', 'pip', 'install', '--upgrade', 'edge-tts>=7.3.1', '--no-warn-script-location'], {
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'ignore'],
          });
          up.on('close', () => resolve());
          up.on('error', () => resolve());
        });
        return await runSynthesis();
      } catch (retryErr) {
        console.warn('[EdgeTTS] Retry after upgrade failed:', retryErr);
        throw retryErr;
      }
    }
    throw err;
  } finally {
    try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    try { if (fs.existsSync(tmpTxt)) fs.unlinkSync(tmpTxt); } catch {}
  }
}

// Fallback Google Translate TTS Endpoint for Khmer
async function fetchGoogleTTSFallback(text: string): Promise<Buffer> {
  const safeText = ' ' + text.trim();
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=km&client=tw-ob&q=${encodeURIComponent(safeText)}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  if (!resp.ok) {
    throw new Error(`Google TTS failed with status ${resp.status}`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// API: Native folder selection & Save exported file directly to selected folder (Desktop / Full-path support)
app.post('/api/select-save-directory', (req, res) => {
  try {
    // Return standard popular folders or customized folder
    const userProfile = process.env.USERPROFILE || process.env.HOME || 'C:\\Users';
    const defaultDownloads = path.join(userProfile, 'Downloads');
    const defaultMovies = path.join(userProfile, 'Videos');
    
    res.json({
      defaultFolder: defaultMovies || defaultDownloads,
      suggestedPath: path.join(defaultMovies, 'JAI_DUBBER_Export.mp4')
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Open the operating system's own folder chooser.
//
// The page cannot do this itself — it runs in a browser, where absolute paths
// are deliberately unavailable — but this server sits on the same desktop and
// can. The request stays open while the dialog is on screen.
app.post('/api/pick-directory', async (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Folder selection is available on this machine only.' });
    return;
  }

  const initial = String((req.body && req.body.initialPath) || '').trim();

  try {
    const result = await pickFolderNatively(initial);
    res.json({ path: result.path, cancelled: result.cancelled });
  } catch (err: any) {
    if (err instanceof FolderDialogUnavailableError) {
      // The caller falls back to the in-app list on this.
      res.status(501).json({ error: err.message, code: 'DIALOG_UNAVAILABLE' });
      return;
    }
    console.error('Folder dialog failed:', err);
    res.status(500).json({ error: err?.message || 'Folder dialog failed' });
  }
});

// API: Browse real directories on this machine.
//
// A browser cannot tell a page where a chosen folder lives — showDirectoryPicker
// hands back the folder's NAME and nothing else — so the export destination used
// to be guessed from that name and was routinely wrong. The server has the one
// thing the page does not: the actual filesystem. It lists directory names only,
// never file contents.
//
// The server binds 0.0.0.0 so it can be reached from the LAN, which this must
// not be, so it answers loopback requests only.
function isLoopbackRequest(req: any): boolean {
  const address = String(req.socket?.remoteAddress || req.ip || '');
  const host = String(req.headers?.host || '');
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address.endsWith('127.0.0.1') ||
    address === 'localhost' ||
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1')
  );
}

// API: Open folder directly in Windows File Explorer (or macOS Finder / Linux file manager)
app.post('/api/open-folder', (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Available on local machine only.' });
    return;
  }

  const folderPath = String(req.body?.folderPath || '').trim();
  if (!folderPath) {
    res.status(400).json({ error: 'Folder path is required.' });
    return;
  }

  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  } catch (err: any) {
    console.warn('Could not ensure folder exists:', err?.message);
  }

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWindows) {
    // Open Windows File Explorer at folderPath
    exec(`explorer.exe "${folderPath.replace(/"/g, '""')}"`, (err) => {
      if (err) {
        console.warn('explorer.exe error:', err?.message);
      }
    });
    res.json({ success: true, path: folderPath });
  } else if (isMac) {
    exec(`open "${folderPath.replace(/"/g, '\\"')}"`, (err) => {
      if (err) console.warn('open error:', err?.message);
    });
    res.json({ success: true, path: folderPath });
  } else {
    exec(`xdg-open "${folderPath.replace(/"/g, '\\"')}"`, (err) => {
      if (err) console.warn('xdg-open error:', err?.message);
    });
    res.json({ success: true, path: folderPath });
  }
});

app.get('/api/list-directories', (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Directory browsing is available on this machine only.' });
    return;
  }

  const requested = String(req.query.path || '').trim();

  try {
    // No path: offer the roots to start from.
    if (!requested) {
      const roots: Array<{ name: string; path: string }> = [];
      if (process.platform === 'win32') {
        for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
          const drive = `${letter}:\\`;
          try {
            if (fs.existsSync(drive)) roots.push({ name: drive, path: drive });
          } catch {
            /* an empty card reader or disconnected drive simply is not listed */
          }
        }
      } else {
        roots.push({ name: '/', path: '/' });
      }
      res.json({ path: '', parent: null, entries: roots, home: os.homedir() });
      return;
    }

    const resolved = path.resolve(requested);
    const entries = fs
      .readdirSync(resolved, { withFileTypes: true })
      .filter((entry) => {
        if (!entry.isDirectory()) return false;
        // System and hidden folders are noise when picking an export target.
        return !entry.name.startsWith('$') && !entry.name.startsWith('.');
      })
      .map((entry) => ({ name: entry.name, path: path.join(resolved, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(resolved);
    res.json({
      path: resolved,
      parent: parent === resolved ? '' : parent,
      entries,
      home: os.homedir(),
    });
  } catch (err: any) {
    // Unreadable or missing: report it so the UI can say so instead of showing
    // a path that is not there.
    res.status(400).json({
      error: err?.code === 'ENOENT' ? 'NOT_FOUND' : err?.message || 'Cannot read that folder',
      code: err?.code || 'READ_FAILED',
    });
  }
});

/**
 * Resolves a caller-supplied path to a video already on this machine.
 *
 * Auto Dubbing works from a folder on disk, and uploading each episode to
 * endpoints running on the very same machine meant the bytes crossed the
 * network stack three times per video — out to the page, back for
 * transcription, back again for export. Naming the file instead skips all of
 * it. Loopback-only and extension-checked, because this turns a request body
 * into a filesystem read.
 */
function resolveLocalVideoPath(req: any, raw: unknown): string | null {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
  if (!isLoopbackRequest(req)) return null;

  const resolved = path.resolve(raw.trim());
  if (!VIDEO_EXTENSIONS.includes(path.extname(resolved).toLowerCase())) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

// API: The Gemini models this app offers.
//
// The list itself is fixed (SUPPORTED_GEMINI_MODELS) rather than whatever the
// catalogue returns — asking Google gave back embedding models, image models
// and a long tail of dated snapshots, none of which can dub a video. What this
// endpoint adds is whether the user's key can actually REACH each one, so a
// model that would fail is visible before a run rather than after it.
app.post('/api/gemini-models', async (req, res) => {
  const body: any = req.body || {};
  const keys: string[] = Array.isArray(body.apiKeys)
    ? body.apiKeys.filter((k: unknown) => typeof k === 'string' && k.trim()).map((k: string) => k.trim())
    : [];
  if (process.env.GEMINI_API_KEY && !keys.includes(process.env.GEMINI_API_KEY)) {
    keys.push(process.env.GEMINI_API_KEY);
  }

  const catalogue = SUPPORTED_GEMINI_MODELS.map((m) => ({
    id: m.id,
    displayName: m.label,
    group: m.group,
    available: undefined as boolean | undefined,
  }));

  // Without a key nothing can be checked, but the choices are still offered:
  // an empty dropdown would be worse than an unverified one.
  if (keys.length === 0) {
    res.json({ models: catalogue, checked: false });
    return;
  }

  let lastError = '';
  for (const key of keys) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`
      );
      if (!response.ok) {
        lastError =
          response.status === 400 || response.status === 403
            ? 'API Key ត្រូវបានបដិសេធ។ សូមពិនិត្យ Key របស់អ្នក។'
            : `Google បានឆ្លើយតប HTTP ${response.status}`;
        continue;
      }

      const data: any = await response.json();
      const reachable = new Set<string>(
        (Array.isArray(data?.models) ? data.models : [])
          .filter((m: any) => {
            const methods = Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
            return methods.includes('generateContent') || methods.includes('bidiGenerateContent') || methods.includes('transcribe') || methods.length > 0;
          })
          .map((m: any) => String(m.name || '').replace(/^models\//, ''))
      );

      res.json({
        models: catalogue.map((m) => ({ ...m, available: reachable.has(m.id) })),
        checked: true,
      });
      return;
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  }

  // The check failed, but the choices are unchanged — report both.
  res.json({ models: catalogue, checked: false, error: lastError || 'មិនអាចពិនិត្យបានទេ' });
});

// API: Measure a local video without shipping it to the page.
//
// Auto Dubbing needs the real pixel size to render overlays 1:1, which used to
// mean downloading the whole file into a <video> element just to read two
// numbers off it.
app.get('/api/probe-video', async (req, res) => {
  const resolved = resolveLocalVideoPath(req, req.query.path);
  if (!resolved) {
    res.status(400).json({ error: 'Not a readable local video' });
    return;
  }
  try {
    const info = await probeMedia(resolved);
    const ffprobeBin = getFFprobePath();

    // probeMedia reports duration and audio, while this reads pixel dimensions and video codec
    const dims = await new Promise<{ width: number; height: number; codec: string; codecTag: string; isBvc2: boolean }>((resolve) => {
      exec(
        `"${ffprobeBin}" -v error -select_streams v:0 -show_entries stream=width,height,codec_name,codec_tag_string -of json "${resolved.replace(/"/g, '\\"')}"`,
        (err, stdout) => {
          if (err) return resolve({ width: 0, height: 0, codec: '', codecTag: '', isBvc2: false });
          try {
            const parsed = JSON.parse(stdout || '{}');
            const stream = parsed.streams?.[0] || {};
            const w = parseInt(stream.width, 10);
            const h = parseInt(stream.height, 10);
            const codec = String(stream.codec_name || '').toLowerCase();
            const codecTag = String(stream.codec_tag_string || '').toLowerCase();
            const isBvc2 = codecTag === 'bvc2' || (!codec && codecTag.includes('bvc'));
            resolve({
              width: Number.isFinite(w) ? w : 0,
              height: Number.isFinite(h) ? h : 0,
              codec,
              codecTag,
              isBvc2,
            });
          } catch {
            resolve({ width: 0, height: 0, codec: '', codecTag: '', isBvc2: false });
          }
        }
      );
    });

    res.json({ ...info, ...dims, path: resolved });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Probe failed' });
  }
});

// API: List the video files in a folder, for Auto Dubbing.
//
// Loopback only, like the directory browser: it reports file names and sizes
// from the user's own machine and must not be reachable from the network.
const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.mov', '.m4v', '.webm', '.avi', '.ts', '.m2ts', '.mts',
  '.flv', '.f4v', '.wmv', '.3gp', '.3g2', '.vob', '.ogv', '.rmvb', '.rm', '.asf', '.divx'
];

app.get('/api/list-videos', (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Available on this machine only.' });
    return;
  }

  const requested = String(req.query.path || '').trim();
  if (!requested) {
    res.status(400).json({ error: 'No folder given', code: 'NO_PATH' });
    return;
  }

  try {
    const resolved = path.resolve(requested);
    const files = fs
      .readdirSync(resolved, { withFileTypes: true })
      .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()))
      .map((entry) => {
        const full = path.join(resolved, entry.name);
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          /* a file that vanished mid-listing simply reports zero */
        }
        return { name: entry.name, path: full, size };
      })
      // Episode order is what people expect, and EP002 must not sort after EP010.
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    res.json({ path: resolved, files });
  } catch (err: any) {
    res.status(400).json({
      error: err?.code === 'ENOENT' ? 'NOT_FOUND' : err?.message || 'Cannot read that folder',
      code: err?.code || 'READ_FAILED',
    });
  }
});

function getVideoMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.wav':
      return 'audio/wav';
    case '.mp3':
      return 'audio/mpeg';
    case '.m4a':
      return 'audio/mp4';
    case '.aac':
      return 'audio/aac';
    case '.flac':
      return 'audio/flac';
    case '.ogg':
      return 'audio/ogg';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    case '.ts':
    case '.m2ts':
    case '.mts':
      return 'video/mp2t';
    case '.flv':
    case '.f4v':
      return 'video/x-flv';
    case '.wmv':
    case '.asf':
      return 'video/x-ms-wmv';
    case '.3gp':
    case '.3g2':
      return 'video/3gpp';
    case '.vob':
      return 'video/x-ms-vob';
    case '.ogv':
      return 'video/ogg';
    case '.rmvb':
    case '.rm':
      return 'video/vnd.rn-realvideo';
    case '.m4v':
    case '.mp4':
    default:
      return 'video/mp4';
  }
}

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg'];

// API: Stream one local video or audio file to the page with HTTP 206 Partial Content (Range request) support.
//
// Chromium HTML5 <video> and <audio> require Range requests to seek smoothly along the timeline.
app.get(['/api/local-file', '/api/file'], (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Available on this machine only.' });
    return;
  }

  const requested = String(req.query.path || '').trim();
  if (!requested) {
    res.status(400).json({ error: 'No file given' });
    return;
  }

  const resolved = path.resolve(requested);
  const ext = path.extname(resolved).toLowerCase();
  if (!VIDEO_EXTENSIONS.includes(ext) && !AUDIO_EXTENSIONS.includes(ext)) {
    res.status(400).json({ error: 'Not a supported media file' });
    return;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const stat = fs.statSync(resolved);
  const fileSize = stat.size;
  const mimeType = getVideoMimeType(resolved);
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
    });

    fs.createReadStream(resolved, { start, end })
      .on('error', () => {
        if (!res.headersSent) res.status(500).end();
      })
      .pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': mimeType,
    });

    fs.createReadStream(resolved)
      .on('error', () => {
        if (!res.headersSent) res.status(500).end();
      })
      .pipe(res);
  }
});

// API: On-the-fly fast remux stream for non-standard containers (MKV, TS, AVI, FLV)
//
// Uses FFmpeg stream-copy (-c copy) to package raw video/audio into fragmented MP4 in real-time.
// This requires 0% re-encoding CPU, starts playing in 0ms, and creates no temporary files on disk.
app.get('/api/stream-video', (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Available on this machine only.' });
    return;
  }

  const requested = String(req.query.path || '').trim();
  if (!requested) {
    res.status(400).json({ error: 'No file given' });
    return;
  }

  const resolved = resolveLocalVideoPath(req, requested) || (path.isAbsolute(requested) && fs.existsSync(requested) ? requested : null);
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  // Native MP4 / MOV / WebM can be served directly with Range requests
  if (['.mp4', '.m4v', '.webm', '.mov'].includes(ext)) {
    res.redirect(`/api/local-file?path=${encodeURIComponent(resolved)}`);
    return;
  }

  const ffmpegBin = getFFmpegPath();
  const startTime = req.query.start ? parseFloat(req.query.start as string) : 0;

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Transfer-Encoding': 'chunked',
    'Accept-Ranges': 'none',
  });

  const args = [
    ...(startTime > 0 ? ['-ss', String(startTime)] : []),
    '-i', resolved,
    '-c', 'copy',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1',
  ];

  const proc = spawn(ffmpegBin, args);
  proc.stdout.pipe(res);
  req.on('close', () => {
    try {
      proc.kill();
    } catch {}
  });
});

// API: Check video codec and automatically prepare an H.264 preview if the video is HEVC/unsupported.
//
// Chromium/Electron on Windows without paid Microsoft HEVC extension displays a black screen or
// decoder error when rendering HEVC (H.265) videos in an HTML5 <video> element.
// This endpoint checks if the video is directly playable (H.264, VP9, AV1 in MP4/MOV/WebM).
// If directly playable, it returns immediately with 0 delay (no conversion).
// If HEVC or unsupported container, it prepares an ultrafast H.264 preview proxy in %TEMP%/jai_previews/
// so the user can play, scrub, edit subtitles, and blur censor boxes smoothly without any error.
// (The original video is preserved 100% untouched for final export).
app.post('/api/prepare-preview', upload.single('video'), async (req, res) => {
  let tempUploadedFile: string | null = null;
  try {
    let sourcePath: string | null = null;
    const bodyPath = typeof req.body?.videoPath === 'string' ? req.body.videoPath : (req.query?.path as string);
    if (bodyPath) {
      sourcePath = resolveLocalVideoPath(req, bodyPath) || (path.isAbsolute(bodyPath) && fs.existsSync(bodyPath) ? bodyPath : null);
    }
    if (!sourcePath && req.file) {
      sourcePath = req.file.path;
      tempUploadedFile = req.file.path;
    }

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      res.status(400).json({ error: 'រកមិនឃើញឯកសារវីដេអូ ឬមិនអាចអានបានទេ។' });
      return;
    }

    const ffmpegBin = getFFmpegPath();
    const ffprobeBin = getFFprobePath();

    // 1. Probe video stream properties (codec, dimensions, duration) - takes only ~30ms
    const probeData = await new Promise<{ codec: string; width: number; height: number; duration: number }>((resolve) => {
      execFile(
        ffprobeBin,
        [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-show_entries', 'stream=codec_name,width,height,duration',
          '-show_entries', 'format=duration',
          '-of', 'json',
          sourcePath,
        ],
        (err, stdout) => {
          if (err) return resolve({ codec: '', width: 0, height: 0, duration: 0 });
          try {
            const data = JSON.parse(stdout || '{}');
            const stream = data.streams?.[0] || {};
            const dur = parseFloat(stream.duration || data.format?.duration || '0') || 0;
            resolve({
              codec: String(stream.codec_name || '').toLowerCase(),
              width: parseInt(stream.width, 10) || 0,
              height: parseInt(stream.height, 10) || 0,
              duration: dur,
            });
          } catch {
            resolve({ codec: '', width: 0, height: 0, duration: 0 });
          }
        }
      );
    });

    const ext = path.extname(sourcePath).toLowerCase();
    const isDirectlyPlayable = ['h264', 'avc1', 'vp8', 'vp9', 'av1'].includes(probeData.codec) && ['.mp4', '.m4v', '.webm', '.mov'].includes(ext);

    // If directly playable in Chromium HTML5 <video> and has a local path: instant response without conversion!
    if (isDirectlyPlayable && sourcePath && !tempUploadedFile) {
      res.json({
        success: true,
        needsProxy: false,
        videoCodec: probeData.codec,
        width: probeData.width,
        height: probeData.height,
        duration: probeData.duration,
        aspectRatio: probeData.width > 0 && probeData.width < probeData.height ? '9:16' : '16:9',
        previewUrl: `/api/local-file?path=${encodeURIComponent(sourcePath)}`,
        originalPath: sourcePath,
      });
      return;
    }

    // 2. Video is HEVC or unsupported by Chromium HTML5 <video>:
    // Generate or fetch cached H.264 preview MP4 proxy
    const previewDir = path.join(os.tmpdir(), 'jai_previews');
    if (!fs.existsSync(previewDir)) {
      fs.mkdirSync(previewDir, { recursive: true });
    }

    const stat = fs.statSync(sourcePath);
    const safeBaseName = path.basename(sourcePath, path.extname(sourcePath)).replace(/[^a-zA-Z0-9_\-\u1780-\u17FF]/g, '_').slice(0, 40);
    const cacheKey = `${safeBaseName}_${stat.size}_${Math.round(stat.mtimeMs || 0)}`;
    const previewFile = path.join(previewDir, `${cacheKey}_h264.mp4`);

    // Return cached preview if already generated
    if (fs.existsSync(previewFile) && fs.statSync(previewFile).size > 1000) {
      res.json({
        success: true,
        needsProxy: true,
        cached: true,
        videoCodec: probeData.codec,
        width: probeData.width,
        height: probeData.height,
        duration: probeData.duration,
        aspectRatio: probeData.width > 0 && probeData.width < probeData.height ? '9:16' : '16:9',
        previewUrl: `/api/local-file?path=${encodeURIComponent(previewFile)}`,
        originalPath: sourcePath,
      });
      return;
    }

    // Convert to ultrafast H.264 preview proxy:
    // Audio is re-encoded with AAC (-c:a aac -b:a 192k) so AC3/EAC3/DTS/PCM streams play flawlessly in Chromium HTML5 <video>
    // Video is encoded using hardware NVENC or CPU ultrafast with +faststart
    const nvenc = await checkNvencAvailable();
    const encoderArgs = nvenc
      ? ['-c:v', 'h264_nvenc', '-preset', 'p1', '-cq', '26']
      : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26'];

    const ffmpegArgs = [
      '-y',
      '-i', sourcePath,
      ...encoderArgs,
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      previewFile,
    ];

    execFile(ffmpegBin, ffmpegArgs, (err, _stdout, stderr) => {
      if (err) {
        console.error('[Preview Convert Error]:', err, stderr);
        // Fallback to local-file if proxy conversion fails
        res.json({
          success: true,
          needsProxy: false,
          fallback: true,
          videoCodec: probeData.codec,
          width: probeData.width,
          height: probeData.height,
          duration: probeData.duration,
          aspectRatio: probeData.width > 0 && probeData.width < probeData.height ? '9:16' : '16:9',
          previewUrl: `/api/local-file?path=${encodeURIComponent(sourcePath)}`,
          originalPath: sourcePath,
        });
        return;
      }

      res.json({
        success: true,
        needsProxy: true,
        converted: true,
        videoCodec: probeData.codec,
        width: probeData.width,
        height: probeData.height,
        duration: probeData.duration,
        aspectRatio: probeData.width > 0 && probeData.width < probeData.height ? '9:16' : '16:9',
        previewUrl: `/api/local-file?path=${encodeURIComponent(previewFile)}`,
        originalPath: sourcePath,
      });
    });
  } catch (error: any) {
    console.error('Prepare preview error:', error);
    res.status(500).json({ error: error.message || 'Prepare preview failed' });
  }
});

// API: Save raw exported base64 video/audio directly to custom filesystem path
app.post('/api/save-export-file', express.raw({ type: '*/*', limit: '1000mb' }), async (req, res) => {
  try {
    let rawTargetFilePath = (req.query.filePath as string) || (req.headers['x-file-path'] as string) || '';
    let fileName = (req.query.fileName as string) || (req.headers['x-file-name'] as string) || 'JAI_DUBBER_Export.mp4';
    let folderPath = (req.query.folderPath as string) || (req.headers['x-folder-path'] as string) || '';

    try { rawTargetFilePath = decodeURIComponent(rawTargetFilePath); } catch {}
    try { fileName = decodeURIComponent(fileName); } catch {}
    try { folderPath = decodeURIComponent(folderPath); } catch {}

    let finalDestination = '';

    if (rawTargetFilePath && rawTargetFilePath.trim()) {
      finalDestination = path.isAbsolute(rawTargetFilePath)
        ? rawTargetFilePath
        : path.resolve(process.cwd(), rawTargetFilePath);
    } else if (folderPath && folderPath.trim()) {
      finalDestination = path.join(folderPath.trim(), fileName);
    } else {
      const userProfile = process.env.USERPROFILE || process.env.HOME || process.cwd();
      const downloadsDir = path.join(userProfile, 'Downloads');
      finalDestination = path.join(downloadsDir, fileName);
    }

    const dir = path.dirname(finalDestination);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write binary buffer to disk
    await fs.promises.writeFile(finalDestination, req.body);

    res.json({
      success: true,
      savedPath: finalDestination,
      sizeBytes: req.body.length
    });
  } catch (error: any) {
    console.error('Error saving export file:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to write file to disk' });
  }
});

// API: Health check & FFmpeg Status
app.get('/api/health', async (req, res) => {
  const nvenc = await checkNvencAvailable();
  const ffmpegReady = isFFmpegAvailable();
  res.json({
    status: 'ok',
    ttsEngine: 'Edge TTS (km-KH-PisethNeural / km-KH-SreymomNeural)',
    geminiActive: !!process.env.GEMINI_API_KEY,
    ffmpeg: {
      available: ffmpegReady,
      path: getFFmpegPath(),
      probePath: getFFprobePath(),
      nvencAvailable: nvenc,
      encoders: nvenc ? ['h264_nvenc', 'libx264'] : ['libx264']
    }
  });
});

// API: Demucs Vocal Separation Status
app.get('/api/demucs-status', (_req, res) => {
  const status = checkDemucsAvailability();
  res.json({ ok: true, ...status });
});

// API: AI Engine Full Status (Python, PyTorch, CUDA, Demucs, Whisper)
app.get('/api/ai-engine/status', async (req, res) => {
  try {
    const force = req.query.refresh === 'true';
    const status = await getAiEngineStatus(force);
    const progress = getInstallProgress();
    res.json({ ok: true, status, progress });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: 1-Click Install AI Engine
app.post('/api/ai-engine/install', async (_req, res) => {
  try {
    const result = await startAiEngineInstall();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: Cancel AI Engine Installation
app.post('/api/ai-engine/cancel', (_req, res) => {
  try {
    const result = cancelAiEngineInstall();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: Get AI Engine Installation Progress & Live Logs
app.get('/api/ai-engine/progress', (_req, res) => {
  try {
    const progress = getInstallProgress();
    res.json({ ok: true, progress });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// Native Auto Dubbing (JAI AUTO DUBBING)
// ==========================================

// API: Get current Auto Dubbing status
app.get('/api/autodub/status', (_req, res) => {
  try {
    res.json({ ok: true, status: getAutoDubStatus() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: List videos in folder with already-dubbed status
app.get('/api/autodub/list-videos', async (req, res) => {
  try {
    const sourceFolder = (req.query.source as string) || '';
    const exportFolder = (req.query.export as string) || '';
    if (!sourceFolder) {
      return res.status(400).json({ ok: false, error: 'Source folder is required' });
    }
    const files = await listAutoDubVideos(sourceFolder, exportFolder);
    res.json({ ok: true, files });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: Start native Auto Dubbing process
app.post('/api/autodub/start', async (req, res) => {
  try {
    const jobData = req.body;
    const result = await startAutoDubbing(jobData);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// API: Cancel running Auto Dubbing process
app.post('/api/autodub/cancel', (_req, res) => {
  try {
    const result = cancelAutoDubbing();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// API: Real-time SSE event stream for Auto Dubbing progress
app.get('/api/autodub/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  // Send initial status immediately
  res.write(`data: ${JSON.stringify({ type: 'status', ...getAutoDubStatus() })}\n\n`);

  const unsub = subscribeToAutoDubEvents((event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {}
  });

  req.on('close', () => {
    unsub();
  });
});

// API: Demucs AI Vocal Separation (Separate BGM & SFX from Speech)
app.post('/api/separate-audio', upload.single('video'), async (req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);
  let uploadedTempPath: string | null = null;
  try {
    const { videoPath, filePath, device = 'auto' } = req.body || {};
    const rawPath = videoPath || filePath;
    let targetFile: string | null = rawPath ? resolveLocalVideoPath(req, rawPath) : null;
    if (!targetFile && typeof rawPath === 'string' && rawPath.trim()) {
      const resolved = path.resolve(rawPath.trim());
      const ext = path.extname(resolved).toLowerCase();
      const validExts = [
        '.mp4', '.mkv', '.mov', '.m4v', '.webm', '.avi', '.ts', '.m2ts', '.mts',
        '.flv', '.f4v', '.wmv', '.3gp', '.3g2', '.vob', '.ogv', '.rmvb', '.rm', '.asf', '.divx',
        '.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg'
      ];
      if (validExts.includes(ext) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        targetFile = resolved;
      }
    }
    if (!targetFile && req.file && req.file.path) {
      targetFile = req.file.path;
      uploadedTempPath = req.file.path;
    }

    if (!targetFile || !fs.existsSync(targetFile)) {
      res.status(400).json({ ok: false, error: 'Video or audio file not found' });
      return;
    }

    const result = await separateAudioDemucs(targetFile, { device });
    res.json({
      ok: true,
      duration: result.duration,
      timeTaken: result.timeTaken,
      device: result.device,
      outputBgm: result.outputBgm,
      outputVocals: result.outputVocals,
      bgmUrl: `/api/local-file?path=${encodeURIComponent(result.outputBgm)}`,
      vocalsUrl: result.outputVocals ? `/api/local-file?path=${encodeURIComponent(result.outputVocals)}` : undefined,
    });
  } catch (err: any) {
    console.error('Demucs separation error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Demucs separation failed' });
  } finally {
    if (uploadedTempPath && fs.existsSync(uploadedTempPath)) {
      try {
        fs.unlinkSync(uploadedTempPath);
      } catch {}
    }
  }
});

// API: Acoustic Audio Pitch & Voice Gender Detection
// Listens directly to audio waveforms (fundamental frequency F0) to detect Male vs Female voices
app.post('/api/detect-audio-genders', upload.single('video'), async (req, res) => {
  let uploadedTempPath: string | null = null;
  try {
    let sourcePath: string | null = null;
    let segments: any[] = [];

    const bodyVideoPath = typeof req.body?.videoPath === 'string' ? req.body.videoPath : (req.query?.path as string);
    if (bodyVideoPath) {
      sourcePath = resolveLocalVideoPath(req, bodyVideoPath) || (path.isAbsolute(bodyVideoPath) && fs.existsSync(bodyVideoPath) ? bodyVideoPath : null);
    }
    if (!sourcePath && req.file) {
      sourcePath = req.file.path;
      uploadedTempPath = req.file.path;
    }

    if (typeof req.body?.segments === 'string') {
      try {
        segments = JSON.parse(req.body.segments);
      } catch {}
    } else if (Array.isArray(req.body?.segments)) {
      segments = req.body.segments;
    }

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      res.status(400).json({ ok: false, error: 'រកមិនឃើញឯកសារវីដេអូ ឬសំឡេងដើមសម្រាប់ស្ដាប់រលកសំឡេងទេ។' });
      return;
    }

    if (!segments || segments.length === 0) {
      res.status(400).json({ ok: false, error: 'គ្មានជួរអត្ថបទ (segments) សម្រាប់វិភាគសំឡេងទេ។' });
      return;
    }

    const detected = await detectAudioPitchGenders(sourcePath, segments);
    res.json({ ok: true, detected, count: detected.length });
  } catch (err: any) {
    console.error('Audio pitch detection error:', err);
    res.status(500).json({ ok: false, error: err?.message || 'ការស្ដាប់រលកសំឡេងបរាជ័យ' });
  } finally {
    if (uploadedTempPath) {
      try {
        if (fs.existsSync(uploadedTempPath)) fs.unlinkSync(uploadedTempPath);
      } catch {}
    }
  }
});

// API: Hardware Accelerated FFmpeg Export (Video + Subtitles + Khmer Voice Track -> h264_nvenc/libx264 -> Final MP4)
app.post('/api/export-ffmpeg', upload.single('video'), async (req, res) => {
  let uploadedTempPath: string | undefined;
  try {
    let payload = req.body;
    if (typeof payload.data === 'string') {
      try {
        payload = JSON.parse(payload.data);
      } catch {}
    }

    const subtitles = typeof payload.subtitles === 'string' ? JSON.parse(payload.subtitles) : (payload.subtitles || []);
    const subtitleStyle = typeof payload.subtitleStyle === 'string' ? JSON.parse(payload.subtitleStyle) : (payload.subtitleStyle || {});
    const renderedOverlays = typeof payload.renderedOverlays === 'string' ? JSON.parse(payload.renderedOverlays) : (payload.renderedOverlays || []);
    const blurBoxes = typeof payload.blurBoxes === 'string' ? JSON.parse(payload.blurBoxes) : (payload.blurBoxes || []);
    const textOverlays = typeof payload.textOverlays === 'string' ? JSON.parse(payload.textOverlays) : (payload.textOverlays || []);
    const imageOverlays = typeof payload.imageOverlays === 'string' ? JSON.parse(payload.imageOverlays) : (payload.imageOverlays || []);
    const burnSubtitles = payload.burnSubtitles !== undefined
      ? (payload.burnSubtitles !== 'false' && payload.burnSubtitles !== false)
      : (payload.encoder !== 'copy');
    const muteOriginalAudio = payload.muteOriginalAudio !== undefined ? payload.muteOriginalAudio !== 'false' && payload.muteOriginalAudio !== false : true;
    const originalAudioVolume = payload.originalAudioVolume !== undefined ? parseFloat(payload.originalAudioVolume) : 0.2;
    const encoder = payload.encoder || 'auto';
    const aspectRatio = payload.aspectRatio || '16:9';
    const fileName = payload.fileName || 'JAI_DUBBER_Export.mp4';
    const targetFilePath = payload.targetFilePath;
    const isolatedBgmPath = payload.isolatedBgmPath;
    // Set by unattended runs, which want the file on disk and no download.
    const skipDownload = payload.skipDownload === true || payload.skipDownload === 'true';
    const previewWidth = payload.previewWidth !== undefined ? parseFloat(payload.previewWidth) : undefined;

    let videoFilePath: string | undefined;
    let videoBuffer: Buffer | undefined;
    let videoUrl = payload.videoUrl;

    const localVideo = resolveLocalVideoPath(req, payload.videoPath);

    if (localVideo) {
      // The user's own file: read in place, and deliberately NOT recorded as a
      // temp path, so the cleanup below cannot delete their source video.
      videoFilePath = localVideo;
    } else if (req.file) {
      uploadedTempPath = req.file.path;
      videoFilePath = req.file.path;
    } else if (payload.videoData && typeof payload.videoData === 'string') {
      let clean = payload.videoData;
      if (clean.includes('base64,')) {
        clean = clean.split('base64,')[1];
      }
      videoBuffer = Buffer.from(clean, 'base64');
    }

    if (!videoFilePath && !videoBuffer && !videoUrl) {
      res.status(400).json({ error: 'Video file, video data or video URL is required' });
      return;
    }

    const result = await runFFmpegExport({
      videoFilePath,
      videoBuffer,
      videoUrl,
      subtitles,
      burnSubtitles,
      subtitleStyle,
      renderedOverlays,
      blurBoxes,
      textOverlays,
      imageOverlays,
      muteOriginalAudio,
      originalAudioVolume,
      isolatedBgmPath,
      encoder,
      aspectRatio,
      fileName,
      targetFilePath,
      previewWidth,
      returnBuffer: !skipDownload
    });

    // Auto Dubbing asks for the file to be written and nothing sent back. The
    // page has no use for the bytes — it would buffer thirty-odd megabytes per
    // episode and immediately drop them — so it gets a receipt instead.
    if (skipDownload) {
      res.json({
        ok: true,
        savedToTarget: result.savedToTarget,
        targetFilePath: targetFilePath || null,
        encoderUsed: result.encoderUsed
      });
      return;
    }

    const safeAsciiName = (fileName || 'export.mp4').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
    const encodedName = encodeURIComponent(fileName || 'export.mp4');

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`);
    res.setHeader('X-Encoder-Used', result.encoderUsed);
    res.send(result.buffer);
  } catch (error: any) {
    console.error('FFmpeg export error:', error);
    res.status(500).json({ error: error.message || 'FFmpeg export failed' });
  } finally {
    if (uploadedTempPath && fs.existsSync(uploadedTempPath)) {
      try {
        fs.unlinkSync(uploadedTempPath);
      } catch {}
    }
  }
});

// API: Synthesize Audio (TTS Endpoint)
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice = 'km-KH-PisethNeural', speed = 1.0, pitch = '+0Hz' } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text prompt is required' });
      return;
    }

    let audioBuffer: Buffer;
    try {
      audioBuffer = await synthesizeEdgeTTS(text.trim(), voice, Number(speed), pitch);
    } catch (edgeErr) {
      console.warn('Edge TTS failed, using Khmer fallback TTS:', edgeErr);
      audioBuffer = await fetchGoogleTTSFallback(text.trim());
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.send(audioBuffer);
  } catch (error: any) {
    console.error('TTS synthesis error:', error);
    res.status(500).json({ error: error.message || 'TTS synthesis failed' });
  }
});

// API: Validate single Gemini API Key
app.post('/api/validate-key', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({ valid: false, message: 'សូមបញ្ចូល API Key' });
      return;
    }

    const trimmedKey = apiKey.trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
    if (trimmedKey.startsWith('ya29.')) {
      res.json({
        valid: false,
        message: 'អ្នកបានបញ្ចូល Google OAuth Token (ya29...)។ សូមប្រើប្រាស់ Gemini API Key (ចាប់ផ្តើមដោយ AIzaSy...) ដែលបង្កើតពី Google AI Studio (aistudio.google.com)។',
      });
      return;
    }

    // Call Google's models endpoint with the key - lightweight, does not consume quota, fast
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(trimmedKey)}`
    );

    if (response.ok) {
      res.json({ valid: true, message: 'API Key ត្រឹមត្រូវ និងដំណើរការបានយ៉ាងល្អ' });
      return;
    }

    const data: any = await response.json().catch(() => ({}));
    let msg = data?.error?.message || `Google បានឆ្លើយតប HTTP ${response.status}`;
    if (typeof msg === 'string') {
      if (msg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
        msg = 'Gemini API Key មិនត្រឹមត្រូវ (ACCESS_TOKEN_TYPE_UNSUPPORTED)។ សូមប្រើ Gemini API Key (AIzaSy...) ពី Google AI Studio។';
      } else if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
        msg = 'API Key មិនត្រឹមត្រូវ (API_KEY_INVALID)។ សូមពិនិត្យមើល API Key ឡើងវិញ។';
      }
    }
    res.json({ valid: false, message: msg });
  } catch (err: any) {
    res.json({ valid: false, message: err.message || 'API Key មិនត្រឹមត្រូវ' });
  }
});

// API: Transcribe a video's spoken dialogue into timed Khmer subtitles.
//
// Thin HTTP shell over server/transcribe. All logic lives in that module; this
// handler only parses the request, streams progress, and maps errors.
//
// Requires a multipart upload with the field name "video". Transcription is
// audio-only by design — there is no text-translation fallback, because a
// subtitle that was never spoken is worse than no subtitle.
//
// The response is newline-delimited JSON:
//   {"type":"progress","stage":"transcribing","batch":0,"batches":3}
//   {"type":"done","subtitles":[...],"utteranceCount":42}
//   {"type":"error","error":"...","code":"ALL_KEYS_FAILED"}
app.post('/api/transcribe', upload.single('video'), async (req, res) => {
  const uploadedPath = req.file?.path;

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  const emit = (payload: any) => {
    if (!res.writableEnded) res.write(JSON.stringify(payload) + '\n');
  };

  // Once a progress frame is written the status code is already on the wire, so
  // later failures are reported in-band as an error frame.
  const fail = (message: string, code: string, status: number) => {
    if (!res.headersSent) res.statusCode = status;
    emit({ type: 'error', error: message, code });
    res.end();
  };

  let cancelled = false;
  const markCancelled = () => {
    cancelled = true;
  };
  req.on('aborted', markCancelled);
  res.on('close', markCancelled);

  try {
    const body: any = req.body || {};

    // A path to a file already on this machine avoids uploading the whole
    // video to a server running on that same machine.
    const localVideo = resolveLocalVideoPath(req, body.videoPath);
    const sourcePath = localVideo || uploadedPath;

    if (!sourcePath) {
      fail(
        'សូមផ្ដល់ឯកសារវីដេអូ។ ការ Transcribe ធ្វើឡើងពីសំឡេងក្នុងវីដេអូតែម្តង។',
        'NO_VIDEO',
        400
      );
      return;
    }

    // Keys arrive from the UI as a JSON array; the env key is a last resort.
    let apiKeys: string[] = [];
    try {
      const parsed = typeof body.apiKeys === 'string' ? JSON.parse(body.apiKeys) : body.apiKeys;
      if (Array.isArray(parsed)) {
        apiKeys = parsed
          .filter((k: unknown) => typeof k === 'string' && k.trim())
          .map((k: string) => k.trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim());
      }
    } catch {
      /* treated as no keys supplied */
    }

    const envKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
    // Filter out ya29 tokens (OAuth tokens) if we have other keys
    const nonOauth = apiKeys.filter((k) => !k.startsWith('ya29.'));
    if (nonOauth.length > 0) {
      apiKeys = nonOauth;
    }
    if (envKey && !apiKeys.includes(envKey)) {
      apiKeys.push(envKey);
    }

    const tuning: Record<string, number> = {};
    for (const key of [
      'batchSize',
      'maxUtteranceSeconds',
      'minSilenceSeconds',
      // How many Gemini requests run at once — the main lever on job duration.
      'concurrency',
    ] as const) {
      const value = Number(body[key]);
      if (Number.isFinite(value) && value > 0) tuning[key] = value;
    }

    // Engine choice, defaulting to the Fast-Whisper + Gemini engine.
    const engine = body.engine === 'srt' ? 'srt' : 'fast-whisper';

    const chosenModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined;

    const result = await transcribeVideo(sourcePath, {
      engine,
      apiKeys,
      preferredModel: chosenModel,
      prompt: body.prompt,
      videoTitle: body.videoTitle,
      sourceLanguage: body.sourceLanguage || 'auto',
      isCancelled: () => cancelled,
      onProgress: (event) => emit({ type: 'progress', ...event }),
      tuning,
    });

    if (cancelled) {
      res.end();
      return;
    }

    emit({
      type: 'done',
      subtitles: result.rows,
      durationSeconds: result.durationSeconds,
      utteranceCount: result.utteranceCount,
      batchCount: result.batchCount,
      emptyUtterances: result.emptyUtterances,
      usedKeyIndex: result.usedKeyIndex,
      autoRotated: result.autoRotated,
      engine,
    });
    res.end();
  } catch (error: any) {
    if (error?.name === 'CancelledError' || cancelled) {
      res.end();
      return;
    }
    if (error instanceof TranscribeError) {
      fail(error.message, error.code, error.httpStatus);
      return;
    }
    console.error('Transcribe failed:', error);
    fail(error?.message || 'Transcription failed', 'INTERNAL', 500);
  } finally {
    if (uploadedPath) {
      fs.promises.unlink(uploadedPath).catch(() => {});
    }
  }
});

// API: Detect speech start/end times only — no Gemini call, no API key needed.
// Use this to confirm the detected timeline lines up with the video before
// spending quota on a full transcription. Returns both JSON and an SRT preview.
app.post('/api/detect-speech', upload.single('video'), async (req, res) => {
  const uploadedPath = req.file?.path;
  try {
    if (!uploadedPath) {
      res.status(400).json({ error: 'សូមផ្ដល់ឯកសារវីដេអូ។' });
      return;
    }
    const body: any = req.body || {};
    const overrides: Record<string, number> = {};
    for (const key of [
      'minSilenceSeconds',
      'maxUtteranceSeconds',
      'minUtteranceSeconds',
      'leadInSeconds',
      'tailOutSeconds',
      'minRowSeconds',
    ] as const) {
      const value = Number(body[key]);
      if (Number.isFinite(value) && value >= 0) overrides[key] = value;
    }

    const result = await detectSpeechTimings(uploadedPath, overrides);
    res.json(result);
  } catch (error: any) {
    if (error instanceof TranscribeError) {
      res.status(error.httpStatus).json({ error: error.message, code: error.code });
      return;
    }
    console.error('Speech detection failed:', error);
    res.status(500).json({ error: error?.message || 'Detection failed' });
  } finally {
    if (uploadedPath) fs.promises.unlink(uploadedPath).catch(() => {});
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Determine the dist path dynamically
    let distPath = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      if (fs.existsSync(path.join(__dirname, 'index.html'))) {
        distPath = __dirname;
      } else if (fs.existsSync(path.join(__dirname, '..', 'dist', 'index.html'))) {
        distPath = path.join(__dirname, '..', 'dist');
      }
    }
    
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const bindHost = process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';
  const server = app.listen(PORT, bindHost, () => {
    console.log(`JAI DUBBER Server running on http://${bindHost}:${PORT}`);
  });
  server.on('error', (err: any) => {
    console.error(`JAI DUBBER Server listen error on port ${PORT}:`, err);
  });
}

startServer().catch((err) => {
  console.error('Failed to initialize server:', err);
});
