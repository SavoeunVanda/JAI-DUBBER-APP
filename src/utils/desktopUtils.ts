/**
 * Utility to open links in the system's default web browser
 * Compatible with Electron, Tauri, Neutralino, NW.js, and standard web browsers.
 */
export function openExternalUrl(url: string): void {
  try {
    // 1. Check Electron custom preload bridge (window.electronAPI or window.electron)
    const win = window as any;
    if (win.electronAPI?.openExternal) {
      win.electronAPI.openExternal(url);
      return;
    }
    if (win.electron?.shell?.openExternal) {
      win.electron.shell.openExternal(url);
      return;
    }
    if (win.shell?.openExternal) {
      win.shell.openExternal(url);
      return;
    }

    // 2. Check Tauri API
    if (win.__TAURI__?.shell?.open) {
      win.__TAURI__.shell.open(url);
      return;
    }
    if (win.__TAURI_INVOKE__) {
      win.__TAURI_INVOKE__('tauri', {
        __tauriModule: 'Shell',
        message: {
          cmd: 'open',
          path: url,
        },
      });
      return;
    }

    // 3. Check Electron via nodeIntegration (window.require)
    if (typeof win.require === 'function') {
      try {
        const electron = win.require('electron');
        if (electron?.shell?.openExternal) {
          electron.shell.openExternal(url);
          return;
        }
      } catch {
        // Ignore require failure
      }
    }
  } catch (err) {
    console.warn('Desktop shell openExternal error:', err);
  }

  // 4. Default web fallback
  try {
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      // If popup was blocked or inside restricted webview, update location
      window.location.href = url;
    }
  } catch {
    window.location.href = url;
  }
}
