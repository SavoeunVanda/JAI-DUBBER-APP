import { execFile } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

export class FolderDialogUnavailableError extends Error {
  code: string;
  constructor(message = 'Native folder picker is not available in this environment.') {
    super(message);
    this.name = 'FolderDialogUnavailableError';
    this.code = 'DIALOG_UNAVAILABLE';
  }
}

export interface PickFolderResult {
  path: string | null;
  cancelled: boolean;
}

function getPickFolderExe(): string | null {
  const candidates: Array<string | undefined | null> = [
    path.join(process.cwd(), 'bin', 'pickFolder.exe'),
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'bin', 'pickFolder.exe') : null,
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'app', 'bin', 'pickFolder.exe') : null,
    path.join(__dirname, '..', 'bin', 'pickFolder.exe'),
    path.join(__dirname, '..', '..', 'bin', 'pickFolder.exe'),
    path.join(__dirname, 'bin', 'pickFolder.exe'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      try {
        if (fs.statSync(c).isFile()) return path.resolve(c);
      } catch {}
    }
  }
  return null;
}

/**
 * Attempts to launch a native system folder dialog.
 * On Windows desktop, uses native pickFolder.exe or PowerShell STA mode.
 * On macOS desktop, uses osascript choose folder.
 * In environments without desktop GUI (e.g. Linux container/cloud server),
 * throws FolderDialogUnavailableError so the client can fall back to the in-app tree browser.
 */
export async function pickFolderNatively(initialPath?: string): Promise<PickFolderResult> {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (!isWindows && !isMac) {
    // Linux/macOS headless or container environments do not have a reliable native folder popup
    throw new FolderDialogUnavailableError();
  }

  if (isMac) {
    return new Promise((resolve, reject) => {
      const script = `POSIX path of (choose folder with prompt "ជ្រើសរើស Folder (Select Folder)")`;
      execFile('osascript', ['-e', script], { timeout: 120000 }, (err, stdout) => {
        if (err) {
          if (err.message.includes('User cancelled') || err.message.includes('-128')) {
            return resolve({ path: null, cancelled: true });
          }
          return reject(new FolderDialogUnavailableError(err.message));
        }
        const picked = stdout.trim();
        return resolve({ path: picked || null, cancelled: !picked });
      });
    });
  }

  // Windows Desktop
  let cleanInitial = (initialPath || '').trim().replace(/[\\/]+$/, '');
  if (cleanInitial && !fs.existsSync(cleanInitial)) {
    const parent = path.dirname(cleanInitial);
    if (fs.existsSync(parent)) {
      cleanInitial = parent;
    }
  }

  const fastExe = getPickFolderExe();
  if (fastExe) {
    return new Promise((resolve) => {
      execFile(
        fastExe,
        [cleanInitial, 'ជ្រើសរើស Folder (Select Folder)'],
        { timeout: 180000 },
        (err, stdout) => {
          if (err) {
            console.warn('[pickFolder.exe] notice, falling back to powershell:', err.message);
            return runPowerShellDialog(cleanInitial).then(resolve);
          }
          const lines = (stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          const output = lines[lines.length - 1] || '';
          if (!output || output === '__CANCELLED__') {
            return resolve({ path: null, cancelled: true });
          }
          return resolve({ path: output, cancelled: false });
        }
      );
    });
  }

  return runPowerShellDialog(cleanInitial);
}

function runPowerShellDialog(cleanInitial: string): Promise<PickFolderResult> {
  return new Promise((resolve, reject) => {

    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$init = @'
${cleanInitial}
'@.Trim();

# Method 1: Genuine Windows File Explorer Picker (IFileOpenDialog with FOS_PICKFOLDERS)
$csharpCode = @'
using System;
using System.Runtime.InteropServices;

namespace JaiDubber {
    [ComImport]
    [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    class FileOpenDialogClass {}

    [ComImport]
    [Guid("42f85109-d1e4-4384-b6b2-6d272d569148")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr parent);
        [PreserveSig] int SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        [PreserveSig] int SetFileTypeIndex(uint iFileType);
        [PreserveSig] int GetFileTypeIndex(out uint piFileType);
        [PreserveSig] int Advise(IntPtr pfde, out uint pdwCookie);
        [PreserveSig] int Unadvise(uint dwCookie);
        [PreserveSig] int SetOptions(uint fos);
        [PreserveSig] int GetOptions(out uint fos);
        [PreserveSig] int SetDefaultFolder(IShellItem psi);
        [PreserveSig] int SetFolder(IShellItem psi);
        [PreserveSig] int GetFolder(out IShellItem ppsi);
        [PreserveSig] int GetCurrentSelection(out IShellItem ppsi);
        [PreserveSig] int SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        [PreserveSig] int GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        [PreserveSig] int SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        [PreserveSig] int SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        [PreserveSig] int SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        [PreserveSig] int GetResult(out IShellItem ppsi);
        [PreserveSig] int AddPlace(IShellItem psi, int fdap);
        [PreserveSig] int SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        [PreserveSig] int Close(int hr);
        [PreserveSig] int SetClientGuid(ref Guid guid);
        [PreserveSig] int ClearClientData();
        [PreserveSig] int SetFilter(IntPtr pFilter);
        [PreserveSig] int GetResults(out IntPtr ppenum);
        [PreserveSig] int GetSelectedItems(out IntPtr ppsai);
    }

    [ComImport]
    [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItem {
        [PreserveSig] int BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetParent(out IShellItem ppsi);
        [PreserveSig] int GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        [PreserveSig] int GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        [PreserveSig] int Compare(IShellItem psi, uint hint, out int piOrder);
    }

    public static class ExplorerFolderPicker {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        public static extern void SHCreateItemFromParsingName(
            [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
            IntPtr pbc,
            [In, MarshalAs(UnmanagedType.LPStruct)] Guid riid,
            [Out, MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        public static string PickFolder(string initialPath, string title) {
            var dialog = (IFileOpenDialog)new FileOpenDialogClass();
            uint options = 0;
            dialog.GetOptions(out options);
            // 0x20 = FOS_PICKFOLDERS (Explorer folder select mode)
            // 0x40 = FOS_FORCEFILESYSTEM, 0x800 = FOS_PATHMUSTEXIST
            dialog.SetOptions(options | 0x20 | 0x40 | 0x800);
            if (!string.IsNullOrEmpty(title)) {
                dialog.SetTitle(title);
            }
            dialog.SetOkButtonLabel("Select Folder");
            if (!string.IsNullOrEmpty(initialPath)) {
                try {
                    IShellItem folderItem;
                    Guid iid = typeof(IShellItem).GUID;
                    SHCreateItemFromParsingName(initialPath, IntPtr.Zero, iid, out folderItem);
                    if (folderItem != null) {
                        dialog.SetFolder(folderItem);
                    }
                } catch {}
            }
            IntPtr owner = GetForegroundWindow();
            int hr = dialog.Show(owner);
            if (hr == 0) {
                IShellItem result;
                int hrResult = dialog.GetResult(out result);
                if (hrResult == 0 && result != null) {
                    string path = null;
                    result.GetDisplayName(0x80058000, out path); // SIGDN_FILESYSPATH
                    return path;
                }
            }
            return null;
        }
    }
}
'@

try {
    if (-not ([System.Management.Automation.PSTypeName]'JaiDubber.ExplorerFolderPicker').Type) {
        Add-Type -TypeDefinition $csharpCode -Language CSharp -IgnoreWarnings
    }
    $picked = [JaiDubber.ExplorerFolderPicker]::PickFolder($init, 'ជ្រើសរើស Folder (Select Folder)')
    if ($picked) {
        [Console]::WriteLine($picked)
        exit 0
    } else {
        [Console]::WriteLine('__CANCELLED__')
        exit 0
    }
} catch {
    # Fallback to OpenFileDialog / FolderBrowserDialog if COM fails
}

Add-Type -AssemblyName System.Windows.Forms;
$OpenFileDialog = New-Object System.Windows.Forms.OpenFileDialog;
$OpenFileDialog.Title = 'ជ្រើសរើស Folder (Select Folder)';
$OpenFileDialog.CheckFileExists = $false;
$OpenFileDialog.ValidateNames = $false;
$OpenFileDialog.FileName = 'Select Folder';
$OpenFileDialog.Filter = 'Folders|*.*';
if ($init -ne '' -and (Test-Path -LiteralPath $init)) {
  $OpenFileDialog.InitialDirectory = $init;
}
$topForm = New-Object System.Windows.Forms.Form;
$topForm.TopMost = $true;
$res = $OpenFileDialog.ShowDialog($topForm);
$topForm.Dispose();
if ($res -eq [System.Windows.Forms.DialogResult]::OK -and $OpenFileDialog.FileName) {
  $folder = [System.IO.Path]::GetDirectoryName($OpenFileDialog.FileName);
  [Console]::WriteLine($folder);
} else {
  [Console]::WriteLine('__CANCELLED__');
}
`;

    const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');

    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-EncodedCommand', base64Script],
      { timeout: 180000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          return reject(new FolderDialogUnavailableError(err.message || stderr || 'PowerShell dialog failed'));
        }

        const lines = stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const output = lines[lines.length - 1] || '';

        if (!output || output === '__CANCELLED__') {
          return resolve({ path: null, cancelled: true });
        }

        resolve({ path: output, cancelled: false });
      }
    );
  });
}
