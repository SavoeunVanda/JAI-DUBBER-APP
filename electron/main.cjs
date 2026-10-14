const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Enable GPU hardware acceleration & modern codec support (HEVC/H.265, AV1, VP9, H.264)
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

let mainWindow = null;
const PORT = process.env.PORT || 3000;

// Resolve app icon path for Taskbar and Window Titlebar
function getAppIcon() {
  const possibleIcons = [
    path.join(app.getAppPath(), 'public', 'icon.png'),
    path.join(app.getAppPath(), 'public', 'favicon.ico'),
    path.join(app.getAppPath(), 'public', 'logo.png'),
    path.join(app.getAppPath(), 'dist', 'favicon.ico'),
    path.join(__dirname, '..', 'public', 'icon.png'),
    path.join(__dirname, '..', 'public', 'favicon.ico'),
    path.join(__dirname, '..', 'public', 'logo.png'),
    path.join(__dirname, '..', 'favicon.ico'),
    path.join(process.resourcesPath || '', 'public', 'icon.png'),
  ];

  for (const ic of possibleIcons) {
    if (fs.existsSync(ic)) {
      return ic;
    }
  }
  return undefined;
}

// Start the bundled Express backend server in the background
function startBackendServer() {
  try {
    process.env.NODE_ENV = 'production';
    process.env.PORT = String(PORT);

    // Locate bundled FFmpeg & FFprobe and ensure they are on PATH
    const possibleBinDirs = [
      path.join(process.resourcesPath || '', 'bin'),
      path.join(process.resourcesPath || '', 'app', 'bin'),
      path.join(app.getAppPath(), 'bin'),
      path.join(__dirname, '..', 'bin'),
      path.join(process.cwd(), 'bin'),
    ];

    for (const bDir of possibleBinDirs) {
      const ffmpegExe = path.join(bDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      const ffprobeExe = path.join(bDir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
      if (fs.existsSync(ffmpegExe)) {
        console.log(`[Electron] Found bundled FFmpeg at: ${ffmpegExe}`);
        process.env.PATH = `${bDir}${path.delimiter}${process.env.PATH || ''}`;
        process.env.FFMPEG_PATH = ffmpegExe;
        if (fs.existsSync(ffprobeExe)) {
          process.env.FFPROBE_PATH = ffprobeExe;
        }
        break;
      }
    }

    // List of possible locations for server.cjs
    const possibleServerPaths = [
      path.join(app.getAppPath(), 'dist', 'server.cjs'),
      path.join(__dirname, '..', 'dist', 'server.cjs'),
      path.join(__dirname, 'dist', 'server.cjs'),
      path.join(process.resourcesPath || '', 'app.asar', 'dist', 'server.cjs'),
      path.join(process.resourcesPath || '', 'app', 'dist', 'server.cjs'),
      path.join(__dirname, 'server.cjs'),
    ];

    let foundPath = null;
    for (const p of possibleServerPaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (foundPath) {
      console.log(`[Electron] Starting Express Server from: ${foundPath}`);
      require(foundPath);
    } else {
      console.warn(`[Electron] Could not find server.cjs at expected paths, attempting default require...`);
      require(path.join(__dirname, '..', 'dist', 'server.cjs'));
    }
  } catch (error) {
    console.error('[Electron] Error starting background server:', error);
    dialog.showErrorBox(
      'JAI DUBBER - Server Initialization Error',
      `Failed to start embedded background server:\n\n${error && error.stack ? error.stack : error}\n\nPlease verify that node_modules are packaged correctly.`
    );
  }
}

// Poll server until it responds or timeout
function checkServerReady(url, timeoutMs = 12000) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const tryPing = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          resolve(true);
        } else {
          retry();
        }
      });

      req.on('error', () => {
        retry();
      });

      req.setTimeout(1200, () => {
        req.abort();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startTime >= timeoutMs) {
        resolve(false);
      } else {
        setTimeout(tryPing, 300);
      }
    };

    tryPing();
  });
}

async function createMainWindow() {
  const iconPath = getAppIcon();
  const isProd = app.isPackaged || process.env.NODE_ENV === 'production';

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    title: 'JAI DUBBER v1.0.5 - AI Video Dubbing to Khmer',
    icon: iconPath,
    autoHideMenuBar: true,
    backgroundColor: '#0a0f1d',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
      devTools: !isProd,
    },
  });

  // Remove default menu bar to prevent View -> Toggle Developer Tools
  mainWindow.setMenu(null);

  // Anti-Inspection & Anti-DevTools keyboard shortcut blocker
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toUpperCase();
    if (
      key === 'F12' ||
      (input.control && input.shift && ['I', 'J', 'C', 'K'].includes(key)) ||
      (input.meta && input.alt && ['I', 'J', 'C'].includes(key)) ||
      (input.control && key === 'U')
    ) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('devtools-opened', () => {
    if (isProd && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.closeDevTools();
    }
  });

  // Open external links in default OS browser instead of Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Ensure window is displayed as soon as it's ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Fallback safety: ensure window ALWAYS appears even if ready-to-show is delayed
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 2500);

  // Wait for background backend to boot
  const isReady = await checkServerReady(`http://localhost:${PORT}/api/health`, 12000);

  if (isReady) {
    mainWindow.loadURL(`http://localhost:${PORT}`);
  } else {
    mainWindow.loadURL(`http://localhost:${PORT}`);
  }

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.warn(`[Renderer] (${line} of ${path.basename(sourceId || '')}): ${message}`);
    }
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`[Electron] Renderer process crashed:`, details);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.warn(`[Electron] Page load failed (${errorCode}): ${errorDescription}`);
    // Auto retry after 2 seconds
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://localhost:${PORT}`);
      }
    }, 2000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for native OS folder picker and shell operations
ipcMain.handle('dialog:selectDirectory', async (event, defaultPath) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  let resolvedDefault = defaultPath;
  if (resolvedDefault && typeof resolvedDefault === 'string') {
    resolvedDefault = resolvedDefault.trim().replace(/[\\/]+$/, '');
    if (!fs.existsSync(resolvedDefault)) {
      const parent = path.dirname(resolvedDefault);
      if (fs.existsSync(parent)) {
        resolvedDefault = parent;
      } else {
        resolvedDefault = undefined;
      }
    }
  }
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: resolvedDefault || undefined,
    title: 'ជ្រើសរើស Folder (Select Folder)',
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('dialog:showOpenDialog', async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  return await dialog.showOpenDialog(win, options || {});
});

ipcMain.handle('shell:openPath', async (event, targetPath) => {
  if (targetPath) {
    return await shell.openPath(targetPath);
  }
});

ipcMain.handle('shell:openExternal', async (event, url) => {
  if (url) {
    return await shell.openExternal(url);
  }
});

// Auto-Updater Integration (GitHub Releases)
let autoUpdater = null;
try {
  const updaterModule = require('electron-updater');
  autoUpdater = updaterModule.autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', { status: 'checking' });
    }
  });

  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', {
        status: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', {
        status: 'not-available',
        version: info.version,
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', {
        status: 'downloading',
        percent: Math.round(progressObj.percent || 0),
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', {
        status: 'downloaded',
        version: info.version,
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] Event error:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', {
        status: 'error',
        error: err.message || 'Update check error',
      });
    }
  });
} catch (updaterInitErr) {
  console.warn('[AutoUpdater] electron-updater module not available:', updaterInitErr.message);
}

ipcMain.handle('updater:check', async () => {
  if (!autoUpdater) return { ok: false, error: 'autoUpdater not initialized' };
  try {
    const res = await autoUpdater.checkForUpdates();
    return { ok: true, updateInfo: res?.updateInfo };
  } catch (err) {
    console.warn('[AutoUpdater] Check failed:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('updater:download', async () => {
  if (!autoUpdater) return { ok: false, error: 'autoUpdater not initialized' };
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    console.warn('[AutoUpdater] Download failed:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('updater:quitAndInstall', () => {
  if (autoUpdater) {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (err) {
      console.warn('[AutoUpdater] quitAndInstall failed:', err.message);
    }
  }
});

// Single instance lock to prevent duplicate apps opening
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startBackendServer();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
