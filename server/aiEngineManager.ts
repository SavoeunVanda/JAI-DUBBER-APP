import { spawn, execSync, exec, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';

export interface AiComponentStatus {
  installed: boolean;
  version?: string;
  detail?: string;
  error?: string;
}

export interface AiEngineStatus {
  python: AiComponentStatus & { path?: string };
  gpu: {
    hasNvidiaGpu: boolean;
    name?: string;
    driverVersion?: string;
  };
  torch: AiComponentStatus & { cuda: boolean; device?: string };
  demucs: AiComponentStatus;
  whisper: AiComponentStatus;
  isFullyReady: boolean;
  canInstall: boolean;
  isInstalling: boolean;
}

export interface InstallProgressState {
  isInstalling: boolean;
  step: string;
  progressPercent: number;
  logs: string[];
  success?: boolean;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// In-memory install state
let installState: InstallProgressState = {
  isInstalling: false,
  step: 'idle',
  progressPercent: 0,
  logs: [],
};

let activeChildProcess: ChildProcess | null = null;
let cachedStatus: { status: AiEngineStatus; timestamp: number } | null = null;

function addLog(message: string) {
  const time = new Date().toLocaleTimeString('km-KH', { hour12: false });
  const entry = `[${time}] ${message}`;
  installState.logs.push(entry);
  if (installState.logs.length > 800) {
    installState.logs.splice(0, installState.logs.length - 800);
  }
}

export function saveVerifiedPythonPath(pythonExePath: string) {
  try {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const jaiDir = path.join(localAppData, 'JAI DUBBER');
    if (!fs.existsSync(jaiDir)) {
      fs.mkdirSync(jaiDir, { recursive: true });
    }
    fs.writeFileSync(path.join(jaiDir, 'python-path.txt'), pythonExePath.trim(), 'utf-8');
  } catch {}
}

/**
 * Searches for any available Python executable on the system.
 */
export function findSystemPython(): { path: string; version: string } | null {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

  const candidates: string[] = [];

  if (process.env.PYTHON_PATH) {
    candidates.push(process.env.PYTHON_PATH);
  }

  // Check saved python-path.txt written by Setup.exe or previous install
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

  for (const cand of candidates) {
    try {
      const quote = cand.includes(' ') || cand.includes('\\') ? `"${cand}"` : cand;
      const out = execSync(`${quote} -c "import sys; print(sys.executable + '|' + sys.version.split()[0])"`, {
        encoding: 'utf-8',
        timeout: 8000,
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();

      const parts = out.split('|');
      const exePath = (parts[0] || cand).trim();
      const ver = (parts[1] || '').trim();
      if (ver && /^\d+\.\d+\.\d+/.test(ver) && !exePath.includes('WindowsApps')) {
        return { path: exePath, version: ver };
      }
    } catch {
      // Continue searching
    }
  }

  return null;
}

/**
 * Detects if the machine has an NVIDIA GPU for CUDA acceleration.
 */
export function detectGpuHardware(): { hasNvidiaGpu: boolean; name?: string; driverVersion?: string } {
  // 1. Try nvidia-smi (most accurate for CUDA capability)
  try {
    const smiOut = execSync('nvidia-smi --query-gpu=name,driver_version --format=csv,noheader', {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    if (smiOut) {
      const lines = smiOut.split('\n');
      const firstGpu = lines[0].split(',');
      const name = (firstGpu[0] || '').trim();
      const driver = (firstGpu[1] || '').trim();
      return {
        hasNvidiaGpu: true,
        name: name || 'NVIDIA GPU',
        driverVersion: driver || undefined,
      };
    }
  } catch {}

  // 2. Try PowerShell WMI video controller query
  try {
    const psCmd = `powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -like '*NVIDIA*' -or $_.Name -like '*GeForce*' -or $_.Name -like '*RTX*' -or $_.Name -like '*GTX*' } | Select-Object -First 1).Name"`;
    const wmiOut = execSync(psCmd, {
      encoding: 'utf-8',
      timeout: 4000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    if (wmiOut && wmiOut.length > 2) {
      return {
        hasNvidiaGpu: true,
        name: wmiOut,
      };
    }
  } catch {}

  return { hasNvidiaGpu: false };
}

/**
 * Resolves the location of check_ai_engine.py
 */
function getCheckScriptPath(): string {
  const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const possiblePaths = [
    path.resolve(baseDir, 'check_ai_engine.py'),
    path.resolve(baseDir, 'server', 'check_ai_engine.py'),
    path.resolve(baseDir, '..', 'server', 'check_ai_engine.py'),
    path.resolve(baseDir, 'dist', 'server', 'check_ai_engine.py'),
    path.resolve(process.cwd(), 'server', 'check_ai_engine.py'),
    path.resolve(process.cwd(), 'dist', 'server', 'check_ai_engine.py'),
    path.resolve((process as any).resourcesPath || '', 'server', 'check_ai_engine.py'),
    path.resolve((process as any).resourcesPath || '', 'app', 'server', 'check_ai_engine.py'),
    path.resolve((process as any).resourcesPath || '', 'app', 'dist', 'server', 'check_ai_engine.py'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return path.resolve(baseDir, 'check_ai_engine.py');
}

/**
 * Runs check_ai_engine.py asynchronously with a generous 90-second timeout
 * so first-time imports on CPU laptops (while Windows Defender scans DLLs) never time out prematurely.
 */
function runCheckScriptAsync(pythonPath: string, checkScript: string, timeoutMs = 90000): Promise<any> {
  return new Promise((resolve) => {
    const child = spawn(pythonPath, [checkScript], {
      windowsHide: true,
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          child.kill('SIGTERM');
        } catch {}
        console.warn(`[AiEngineManager] check_ai_engine.py timed out after ${timeoutMs}ms`);
        resolve(null);
      }
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf-8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf-8');
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        console.warn('[AiEngineManager] check script spawn error:', err?.message || err);
        resolve(null);
      }
    });

    child.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        const jsonMarker = '__STATUS__';
        const markerIdx = stdout.indexOf(jsonMarker);
        if (markerIdx !== -1) {
          try {
            const jsonStr = stdout.substring(markerIdx + jsonMarker.length).trim();
            resolve(JSON.parse(jsonStr));
            return;
          } catch (e) {
            console.warn('[AiEngineManager] JSON parse error:', e);
          }
        }
        if (stderr) {
          console.warn('[AiEngineManager] check script stderr:', stderr);
        }
        resolve(null);
      }
    });
  });
}

/**
 * Inspects all AI Engine components and returns their live status.
 */
export async function getAiEngineStatus(forceRefresh = false): Promise<AiEngineStatus> {
  const now = Date.now();
  const cacheTtl = cachedStatus?.status?.isFullyReady ? 60000 : 15000;
  if (!forceRefresh && cachedStatus && now - cachedStatus.timestamp < cacheTtl) {
    return {
      ...cachedStatus.status,
      isInstalling: installState.isInstalling,
    };
  }

  const gpuInfo = detectGpuHardware();
  const pythonInfo = findSystemPython();

  if (!pythonInfo) {
    const status: AiEngineStatus = {
      python: { installed: false, detail: 'រកមិនឃើញ Python នៅក្នុងកុំព្យូទ័រទេ (ត្រូវការ Python 3.10+)' },
      gpu: gpuInfo,
      torch: { installed: false, cuda: false, detail: 'មិនទាន់បានដំឡើង' },
      demucs: { installed: false, detail: 'មិនទាន់បានដំឡើង' },
      whisper: { installed: false, detail: 'មិនទាន់បានដំឡើង' },
      isFullyReady: false,
      canInstall: true,
      isInstalling: installState.isInstalling,
    };
    cachedStatus = { status, timestamp: now };
    return status;
  }

  // Python found, run check_ai_engine.py asynchronously (90s timeout for CPU laptops)
  const checkScript = getCheckScriptPath();
  const checkData: any = await runCheckScriptAsync(pythonInfo.path, checkScript, 90000);

  const torchInstalled = !!checkData?.torch?.installed;
  const torchCuda = !!checkData?.torch?.cuda;
  const torchDevice = checkData?.torch?.device || (torchCuda ? 'CUDA' : 'CPU');
  const demucsInstalled = !!checkData?.demucs?.installed;
  const whisperInstalled = !!checkData?.whisper?.installed;

  const isFullyReady = torchInstalled && demucsInstalled && whisperInstalled;

  const status: AiEngineStatus = {
    python: {
      installed: true,
      version: checkData?.pythonVersion || pythonInfo.version,
      path: pythonInfo.path,
      detail: `Python ${checkData?.pythonVersion || pythonInfo.version}`,
    },
    gpu: gpuInfo,
    torch: {
      installed: torchInstalled,
      version: checkData?.torch?.version,
      cuda: torchCuda,
      device: torchDevice,
      detail: torchInstalled
        ? torchCuda
          ? `PyTorch ${checkData?.torch?.version} (GPU CUDA: ${torchDevice})`
          : `PyTorch ${checkData?.torch?.version} (CPU Mode)`
        : 'មិនទាន់បានដំឡើង',
      error: checkData?.torch?.error,
    },
    demucs: {
      installed: demucsInstalled,
      version: checkData?.demucs?.version,
      detail: demucsInstalled ? `Demucs v${checkData?.demucs?.version}` : 'មិនទាន់បានដំឡើង',
      error: checkData?.demucs?.error,
    },
    whisper: {
      installed: whisperInstalled,
      version: checkData?.whisper?.version,
      detail: whisperInstalled ? `Faster-Whisper v${checkData?.whisper?.version}` : 'មិនទាន់បានដំឡើង',
      error: checkData?.whisper?.error,
    },
    isFullyReady,
    canInstall: true,
    isInstalling: installState.isInstalling,
  };

  cachedStatus = { status, timestamp: now };
  return status;
}

/**
 * Downloads a file over HTTPS to a destination path.
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        // Handle redirect
        file.close();
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Spawns a command, pipes output line-by-line to logs, and returns a promise.
 */
function runCommandStreaming(
  cmd: string,
  args: string[],
  onLog: (line: string) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    const quotedCmd = cmd.includes(' ') && !cmd.startsWith('"') ? `"${cmd}"` : cmd;
    const child = spawn(quotedCmd, args, {
      windowsHide: true,
      shell: true,
    });

    activeChildProcess = child;

    const handleData = (data: Buffer) => {
      const text = data.toString('utf-8');
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      for (const line of lines) {
        onLog(line);
      }
    };

    child.stdout?.on('data', handleData);
    child.stderr?.on('data', handleData);

    child.on('error', (err) => {
      activeChildProcess = null;
      reject(err);
    });

    child.on('close', (code) => {
      activeChildProcess = null;
      resolve(code || 0);
    });
  });
}

/**
 * Starts the automated 1-Click AI Engine installation process.
 */
export async function startAiEngineInstall(): Promise<{ ok: boolean; message: string }> {
  if (installState.isInstalling) {
    return { ok: false, message: 'ដំណើរការដំឡើងកំពុងប្រព្រឹត្តទៅហើយ (Already installing)...' };
  }

  installState = {
    isInstalling: true,
    step: 'preparing',
    progressPercent: 2,
    logs: [],
    startedAt: Date.now(),
  };

  addLog('🚀 ចាប់ផ្តើមដំណើរការដំឡើង AI Engine ដោយស្វ័យប្រវត្តិ (1-Click AI Engine Setup)...');

  // Run in background asynchronously so HTTP response returns immediately
  (async () => {
    try {
      // Step 1: Detect Python
      installState.step = 'checking_python';
      installState.progressPercent = 5;
      addLog('🔍 [1/5] កំពុងពិនិត្យមើលបរិស្ថាន Python ក្នុងកុំព្យូទ័រ...');

      let pythonInfo = findSystemPython();

      if (!pythonInfo) {
        addLog('⚠️ រកមិនឃើញ Python ទេ។ កំពុងចាប់ផ្តើមដំឡើង Python 3.11 ដោយស្វ័យប្រវត្តិតាមរយៈ winget...');
        
        // Try winget install
        let wingetSuccess = false;
        try {
          const code = await runCommandStreaming(
            'winget',
            ['install', '-e', '--id', 'Python.Python.3.11', '--silent', '--accept-package-agreements', '--accept-source-agreements'],
            (line) => addLog(`[winget] ${line}`)
          );
          if (code === 0) {
            wingetSuccess = true;
          }
        } catch {
          wingetSuccess = false;
        }

        // If winget failed, fallback to direct installer download
        if (!wingetSuccess) {
          addLog('🌐 Winget មិនអាចប្រើបានទេ — កំពុងទាញយក Python 3.11.9 ពី python.org ផ្ទាល់...');
          const installerPath = path.join(os.tmpdir(), 'python-3.11.9-amd64.exe');
          await downloadFile('https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe', installerPath);
          
          addLog('📦 កំពុងដំណើរការដំឡើង Python 3.11.9 ដោយស្វ័យប្រវត្តិ...');
          await runCommandStreaming(
            installerPath,
            ['/quiet', 'InstallAllUsers=0', 'PrependPath=1', 'Include_pip=1', 'Include_test=0'],
            (line) => addLog(`[installer] ${line}`)
          );
        }

        // Wait 3 seconds for environment refresh and search again
        await new Promise((r) => setTimeout(r, 3000));
        pythonInfo = findSystemPython();
        if (!pythonInfo) {
          throw new Error('មិនអាចដំឡើង Python ដោយស្វ័យប្រវត្តិបានទេ។ សូមទាញយក និងដំឡើង Python 3.11 ដោយផ្ទាល់ពី https://www.python.org/downloads/');
        }
      }

      addLog(`✅ រកឃើញ Python ${pythonInfo.version} (${pythonInfo.path})`);
      installState.progressPercent = 20;

      // Step 2: Detect GPU Hardware
      installState.step = 'detecting_gpu';
      addLog('🔍 [2/5] កំពុងពិនិត្យមើលកាតក្រាហ្វិក (GPU Hardware Detection)...');
      const gpuInfo = detectGpuHardware();

      let torchInstallArgs: string[];
      if (gpuInfo.hasNvidiaGpu) {
        addLog(`🚀 រកឃើញ NVIDIA GPU: ${gpuInfo.name || 'NVIDIA Graphics'}!`);
        addLog('⚡ នឹងដំឡើង PyTorch ជំនាន់ GPU CUDA 12.4 Acceleration ដើម្បីឱ្យ Demucs និង Fast-Whisper ដំណើរការល្បឿនលឿនបំផុត (100% Super Fast)...');
        torchInstallArgs = [
          '-m', 'pip', 'install', '--upgrade',
          'torch', 'torchaudio',
          '--index-url', 'https://download.pytorch.org/whl/cu124',
        ];
      } else {
        addLog('ℹ️ មិនឃើញកាតក្រាហ្វិក NVIDIA ទេ។ នឹងដំឡើង PyTorch ជំនាន់ CPU Mode...');
        torchInstallArgs = [
          '-m', 'pip', 'install', '--upgrade',
          'torch', 'torchaudio',
        ];
      }
      installState.progressPercent = 30;

      // Step 3: Upgrade pip and Install PyTorch
      installState.step = 'installing_pytorch';
      addLog('⏳ [3/5] កំពុងដំឡើង PyTorch & TorchAudio... (អាចចំណាយពេលពី 1 ទៅ 3 នាទី សូមរង់ចាំ)');
      
      const torchExitCode = await runCommandStreaming(
        pythonInfo.path,
        torchInstallArgs,
        (line) => addLog(`[pip] ${line}`)
      );

      if (torchExitCode !== 0) {
        addLog(`⚠️ PyTorch pip installation exited with code ${torchExitCode}, attempting retry...`);
      }
      installState.progressPercent = 65;

      // Step 4: Install Demucs & Audio dependencies
      installState.step = 'installing_demucs';
      addLog('⏳ [4/5] កំពុងដំឡើង Demucs AI & Audio Processing (លុបសំឡេងចិនដើម និងស្រង់ BGM)...');
      
      const demucsArgs = ['-m', 'pip', 'install', '--upgrade', 'demucs', 'soundfile'];
      await runCommandStreaming(
        pythonInfo.path,
        demucsArgs,
        (line) => addLog(`[pip] ${line}`)
      );
      installState.progressPercent = 82;

      // Step 5: Install Faster-Whisper & AutoDub helper libraries
      installState.step = 'installing_whisper';
      addLog('⏳ [5/5] កំពុងដំឡើង Faster-Whisper AI & Audio Helper Libraries...');

      const whisperArgs = ['-m', 'pip', 'install', '--upgrade', 'faster-whisper', 'pydub', 'edge-tts>=7.3.1', 'google-genai', 'Pillow', 'scipy', 'numpy'];
      await runCommandStreaming(
        pythonInfo.path,
        whisperArgs,
        (line) => addLog(`[pip] ${line}`)
      );
      saveVerifiedPythonPath(pythonInfo.path);
      installState.progressPercent = 92;

      // Step 6: Verification & Self-Test
      installState.step = 'verifying';
      addLog('🔍 កំពុងធ្វើតេស្តផ្ទៀងផ្ទាត់ AI Engine (Self-Verification)... (អាចចំណាយពេល 15-45 វិនាទី លើ Laptop)');
      cachedStatus = null; // Invalidate cache
      let freshStatus = await getAiEngineStatus(true);

      // Check if failure is caused by missing Microsoft Visual C++ Redistributable (WinError 126 / DLL load failed)
      const combinedErrors = `${freshStatus.torch.error || ''} ${freshStatus.demucs.error || ''} ${freshStatus.whisper.error || ''}`;
      if (
        (!freshStatus.torch.installed || !freshStatus.whisper.installed) &&
        (combinedErrors.includes('WinError 126') || combinedErrors.includes('DLL load failed') || combinedErrors.includes('fbgemm.dll') || combinedErrors.includes('c10.dll'))
      ) {
        addLog('⚠️ រកឃើញកង្វះ Microsoft Visual C++ Redistributable (x64) សម្រាប់ PyTorch។ កំពុងដំឡើងដោយស្វ័យប្រវត្តិ...');
        try {
          const vcPath = path.join(os.tmpdir(), 'vc_redist.x64.exe');
          await downloadFile('https://aka.ms/vs/17/release/vc_redist.x64.exe', vcPath);
          await runCommandStreaming(vcPath, ['/install', '/quiet', '/norestart'], (l) => addLog(`[vcredist] ${l}`));
          cachedStatus = null;
          freshStatus = await getAiEngineStatus(true);
        } catch (vcErr: any) {
          addLog(`⚠️ មិនអាចដំឡើង VC++ Redistributable ដោយស្វ័យប្រវត្តិបានទេ: ${vcErr?.message || vcErr}`);
        }
      }

      if (freshStatus.torch.installed && freshStatus.demucs.installed && freshStatus.whisper.installed) {
        saveVerifiedPythonPath(pythonInfo.path);
        installState.success = true;
        installState.progressPercent = 100;
        installState.step = 'completed';
        installState.completedAt = Date.now();
        addLog('🎉 [ជោគជ័យ] ម៉ាស៊ីន AI Engine ទាំងអស់ត្រូវបានដំឡើង និងផ្ទៀងផ្ទាត់រួចរាល់ 100%!');
        if (freshStatus.torch.cuda) {
          addLog(`⚡ កាតក្រាហ្វិក CUDA: ${freshStatus.torch.device} ដំណើរការយ៉ាងល្អឥតខ្ចោះ!`);
        } else {
          addLog('💻 ដំណើរការដោយជោគជ័យលើប្រព័ន្ធ CPU Mode (Standard Laptop/PC)!');
        }
        addLog('👉 ឥឡូវអ្នកអាចប្រើមុខងារ Auto Dubbing, Demucs BGM/Vocal Isolation និង Fast-Whisper បានភ្លាមៗ។');
      } else {
        const missing: string[] = [];
        if (!freshStatus.torch.installed) {
          missing.push('PyTorch');
          if (freshStatus.torch.error) addLog(`🔸 PyTorch Error: ${freshStatus.torch.error}`);
        }
        if (!freshStatus.demucs.installed) {
          missing.push('Demucs');
          if (freshStatus.demucs.error) addLog(`🔸 Demucs Error: ${freshStatus.demucs.error}`);
        }
        if (!freshStatus.whisper.installed) {
          missing.push('Faster-Whisper');
          if (freshStatus.whisper.error) addLog(`🔸 Faster-Whisper Error: ${freshStatus.whisper.error}`);
        }

        installState.error = `ការដំឡើងមិនទាន់ពេញលេញទេ (ខ្វះ: ${missing.join(', ')})។ សូមចុចដំឡើងម្តងទៀត ឬពិនិត្យ Logs ខាងលើ។`;
        installState.step = 'failed';
        addLog(`❌ [បរាជ័យ] ${installState.error}`);
      }
    } catch (err: any) {
      console.error('[AiEngineManager] Install error:', err);
      installState.error = err?.message || 'ការដំឡើង AI Engine មានបញ្ហា';
      installState.step = 'error';
      addLog(`❌ [កំហុស] ${installState.error}`);
    } finally {
      installState.isInstalling = false;
      cachedStatus = null;
    }
  })();

  return { ok: true, message: 'ដំណើរការដំឡើងត្រូវបានចាប់ផ្ដើម' };
}

/**
 * Cancels current installation if running.
 */
export function cancelAiEngineInstall(): { ok: boolean } {
  if (activeChildProcess) {
    try {
      activeChildProcess.kill('SIGTERM');
    } catch {}
    activeChildProcess = null;
  }
  installState.isInstalling = false;
  installState.step = 'cancelled';
  addLog('🛑 ការដំឡើងត្រូវបានបញ្ឈប់ (Cancelled by user)');
  return { ok: true };
}

/**
 * Returns current installation state & logs.
 */
export function getInstallProgress(): InstallProgressState {
  return installState;
}
