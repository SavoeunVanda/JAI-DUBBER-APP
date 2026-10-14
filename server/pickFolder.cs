using System;
using System.IO;
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

    public static class Program {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        public static extern void SHCreateItemFromParsingName(
            [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
            IntPtr pbc,
            [In, MarshalAs(UnmanagedType.LPStruct)] Guid riid,
            [Out, MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [STAThread]
        public static int Main(string[] args) {
            try {
                Console.OutputEncoding = System.Text.Encoding.UTF8;
                string initialPath = args.Length > 0 ? (args[0] ?? "").Trim() : "";
                string title = args.Length > 1 ? args[1] : "ជ្រើសរើស Folder (Select Folder)";

                // If path does not exist, navigate to parent directory if possible
                if (!string.IsNullOrEmpty(initialPath) && !Directory.Exists(initialPath)) {
                    try {
                        string parent = Path.GetDirectoryName(initialPath);
                        if (!string.IsNullOrEmpty(parent) && Directory.Exists(parent)) {
                            initialPath = parent;
                        } else {
                            initialPath = "";
                        }
                    } catch {
                        initialPath = "";
                    }
                }

                var dialog = (IFileOpenDialog)new FileOpenDialogClass();
                uint options = 0;
                dialog.GetOptions(out options);
                // 0x20 = FOS_PICKFOLDERS, 0x40 = FOS_FORCEFILESYSTEM, 0x800 = FOS_PATHMUSTEXIST
                dialog.SetOptions(options | 0x20 | 0x40 | 0x800);
                if (!string.IsNullOrEmpty(title)) {
                    dialog.SetTitle(title);
                }
                dialog.SetOkButtonLabel("Select Folder");

                if (!string.IsNullOrEmpty(initialPath) && Directory.Exists(initialPath)) {
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
                        if (!string.IsNullOrEmpty(path)) {
                            Console.WriteLine(path);
                            return 0;
                        }
                    }
                }
            } catch (Exception ex) {
                Console.Error.WriteLine(ex.Message);
            }

            Console.WriteLine("__CANCELLED__");
            return 0;
        }
    }
}
