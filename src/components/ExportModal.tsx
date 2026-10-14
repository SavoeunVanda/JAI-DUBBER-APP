import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FolderOpen,
  Zap,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { SubtitleSegment, SubtitleStyle, TextOverlayItem, BlurBoxItem, ImageOverlayItem } from '../types';
import { renderAllSubtitlesToOverlays, renderTextOverlaysToCanvasOverlays } from '../utils/subtitleCanvasRenderer';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  videoFile?: File | null;
  subtitles: SubtitleSegment[];
  subtitleStyle: SubtitleStyle;
  duration: number;
  aspectRatio?: '16:9' | '9:16';
  originalFileName?: string;
  originalVideoPath?: string;
  textOverlays?: TextOverlayItem[];
  blurBoxes?: BlurBoxItem[];
  imageOverlays?: ImageOverlayItem[];
  isMuteOriginalVocals?: boolean;
  vocalRemoverMode?: 'mute_original' | 'mute_vocal';
  onChangeVocalRemoverMode?: (mode: 'mute_original' | 'mute_vocal') => void;
  preSeparatedBgmPath?: string | null;
  bgmMixLevel?: number;
  onShowToast?: (type: 'success' | 'error' | 'info' | 'warning', title: string, message?: string) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  videoUrl,
  videoFile,
  subtitles,
  subtitleStyle,
  duration,
  aspectRatio = '16:9',
  originalFileName,
  originalVideoPath,
  textOverlays = [],
  blurBoxes = [],
  imageOverlays = [],
  isMuteOriginalVocals = true,
  vocalRemoverMode,
  onChangeVocalRemoverMode,
  preSeparatedBgmPath = null,
  bgmMixLevel = 20,
  onShowToast,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isExportCompleted, setIsExportCompleted] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // File Name & Base Folder Directory
  const [saveFileName, setSaveFileName] = useState('');
  const [baseFolderPath, setBaseFolderPath] = useState<string>(() => {
    try {
      const saved =
        localStorage.getItem('jai_dubber_export_folder') ||
        localStorage.getItem('jai_dubber_autodub_output') ||
        localStorage.getItem('jai_dubber_last_active_dir');
      if (saved) return saved;
    } catch {}
    return 'C:\\JAI DUBBER\\Export';
  });
  const saveFileHandleRef = useRef<any>(null);
  const selectedDirHandleRef = useRef<any>(null);

  // Explains why the box shows what it shows when a full path is not knowable.
  const [folderNotice, setFolderNotice] = useState('');

  // True while the OS dialog is on screen, so the button can show it is waiting.
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  // Demucs AI Vocal Isolation (Extract BGM + SFX, remove original speech)
  const [useDemucs, setUseDemucs] = useState<boolean>(() => {
    if (vocalRemoverMode) return vocalRemoverMode === 'mute_vocal';
    try {
      const saved = localStorage.getItem('jai_dubber_export_use_demucs');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  useEffect(() => {
    if (vocalRemoverMode) {
      setUseDemucs(vocalRemoverMode === 'mute_vocal');
    }
  }, [vocalRemoverMode, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setFolderNotice('');
      setIsExporting(false);
      setIsExportCompleted(false);
      setExportProgress(0);
      setExportStatusText('');
      setErrorMessage('');
      saveFileHandleRef.current = null;
      selectedDirHandleRef.current = null;
    } else {
      setIsExportCompleted(false);
      let baseName = (originalFileName || 'Dubbed_Khmer_Movie').trim();
      // Remove existing extension (.mp4, .mkv, etc.) to show only the clean file name
      baseName = baseName.replace(/\.[^/.]+$/, '');
      setSaveFileName(baseName);

      const savedFolder = localStorage.getItem('jai_dubber_export_folder');
      // Used verbatim. A previous version rewrote any C: path to D: here,
      // which silently moved exports off the drive they were sent to.
      const remembered = (savedFolder || '').trim().replace(/[\\/]+$/, '');
      setBaseFolderPath(remembered || 'D:\\YouTube\\Movies');

      // Confirm the remembered folder still exists. Earlier versions saved an
      // invented path here — built by appending a picked folder's NAME to
      // whatever was already in the box — so a stored value may point somewhere
      // that never existed, and it would otherwise reappear on every export.
      (async () => {
        const candidate = remembered || 'D:\\YouTube\\Movies';
        try {
          const check = await fetch(
            '/api/list-directories?path=' + encodeURIComponent(candidate)
          );
          // An older server answers the SPA's HTML at status 200 here, which
          // would read as "the folder is fine". Without a real answer the
          // remembered path is left alone rather than replaced on a guess.
          const checkType = check.headers.get('content-type') || '';
          if (!checkType.includes('json')) return;
          if (check.ok) {
            setFolderNotice('');
            return;
          }
          const fallback = await fetch('/api/select-save-directory', { method: 'POST' });
          const data = await fallback.json().catch(() => null);
          const replacement = data?.defaultFolder;
          if (replacement) {
            setBaseFolderPath(replacement);
            try {
              localStorage.setItem('jai_dubber_export_folder', replacement);
            } catch {}
            setFolderNotice(
              'ថតដែលរក្សាទុកពីមុនរកមិនឃើញទេ។ បានប្ដូរទៅ "' + replacement + '" ជំនួស។'
            );
          } else {
            setFolderNotice(
              'ថតដែលរក្សាទុកពីមុនរកមិនឃើញទេ។ សូមចុច Browse ដើម្បីជ្រើសរើសថតថ្មី។'
            );
          }
        } catch {
          // Server unreachable: leave the remembered value alone rather than
          // replacing a path that may be perfectly good.
        }
      })();
    }
  }, [isOpen, originalFileName]);

  if (!isOpen) return null;

  const getFullDestinationPath = () => {
    const cleanBase = (baseFolderPath || 'D:\\YouTube\\Movies').replace(/[\\/]+$/, '');
    let cleanName = (saveFileName || 'Dubbed_Khmer_Movie').trim().replace(/^[\\/]+/, '');
    // Ensure .mp4 is automatically appended in the Save to path
    cleanName = cleanName.replace(/\.(mp4|m4v|mov|mkv|webm|avi)$/i, '');
    return `${cleanBase}\\${cleanName || 'video'}.mp4`;
  };

  const handleFullPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsExportCompleted(false);
    const fullVal = e.target.value;
    const lastSlashIndex = Math.max(fullVal.lastIndexOf('\\'), fullVal.lastIndexOf('/'));

    if (lastSlashIndex !== -1) {
      const newFolder = fullVal.substring(0, lastSlashIndex);
      let newFile = fullVal.substring(lastSlashIndex + 1);
      setBaseFolderPath(newFolder);
      if (newFile.trim()) {
        newFile = newFile.replace(/\.(mp4|m4v|mov|mkv|webm|avi)$/i, '');
        setSaveFileName(newFile);
      }
      try {
        localStorage.setItem('jai_dubber_export_folder', newFolder);
      } catch {}
    } else {
      setBaseFolderPath(fullVal);
      try {
        localStorage.setItem('jai_dubber_export_folder', fullVal);
      } catch {}
    }
  };

  const handleFileNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsExportCompleted(false);
    // Only file name without extension
    const val = e.target.value.replace(/\.(mp4|m4v|mov|mkv|webm|avi)$/i, '');
    setSaveFileName(val);
  };

  // Browse Directory / Folder or File path on user's machine
  //
  // Only one of these routes can report where a folder actually is. Electron's
  // native dialog returns a real absolute path; the browser's directory picker
  // returns a handle whose only readable property is the folder's NAME, with no
  // drive and no parent. This used to paper over that by inventing a path from
  // the name — mapping "Movies" to a hardcoded D:\YouTube\Movies and appending
  // anything else to whatever was already in the box — so the field showed a
  // folder the user had never chosen, and the export was written there.
  const handleOpenInExplorer = async () => {
    const target = (baseFolderPath || '').trim().replace(/[\\/]+$/, '');
    if (!target) return;
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.openPath) {
        await electronAPI.openPath(target);
        return;
      }
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: target }),
      });
    } catch (err) {
      console.warn('Could not open folder in explorer:', err);
    }
  };

  const handleBrowseFolder = async () => {
    if (isExporting) return;
    setIsExportCompleted(false);
    setIsPickingFolder(true);
    setFolderNotice('');
    try {
      // 1. Desktop Electron app
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.selectDirectory) {
        const picked = await electronAPI.selectDirectory(baseFolderPath || undefined);
        if (picked && typeof picked === 'string') {
          const cleanPath = picked.replace(/[\\/]+$/, '');
          selectedDirHandleRef.current = null;
          setBaseFolderPath(cleanPath);
          setFolderNotice('');
          try {
            localStorage.setItem('jai_dubber_export_folder', cleanPath);
          } catch {}
          return;
        }
      }
      if (electronAPI?.showOpenDialog) {
        const result = await electronAPI.showOpenDialog({
          properties: ['openDirectory'],
          defaultPath: baseFolderPath || undefined,
          title: 'ជ្រើសរើស Folder សម្រាប់រក្សាទុក (Select Export Folder)',
        });
        if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
          const cleanPath = String(result.filePaths[0]).replace(/[\\/]+$/, '');
          selectedDirHandleRef.current = null;
          setBaseFolderPath(cleanPath);
          setFolderNotice('');
          try {
            localStorage.setItem('jai_dubber_export_folder', cleanPath);
          } catch {}
          return;
        }
      }

      // 2. Ask local server to open native Windows File Explorer Folder Picker
      const response = await fetch('/api/pick-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialPath: baseFolderPath || '' }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        const data = await response.json();
        if (response.ok) {
          if (data.cancelled || !data.path) return;
          const cleanPath = String(data.path).replace(/[\\/]+$/, '');
          selectedDirHandleRef.current = null;
          setBaseFolderPath(cleanPath);
          setFolderNotice('');
          try {
            localStorage.setItem('jai_dubber_export_folder', cleanPath);
          } catch {}
          return;
        }
      }
    } catch (err: any) {
      console.warn('Folder picker notice:', err?.message);
      if (err?.message && !err.message.includes('cancel')) {
        setFolderNotice('សូមពិនិត្យផ្ទាំងជ្រើសរើស Folder លើ Windows');
      }
    } finally {
      setIsPickingFolder(false);
    }
  };

  // Direct Hardware-Accelerated Server FFmpeg Export
  const handleStartExport = async () => {
    setIsExportCompleted(false);
    setIsExporting(true);
    setErrorMessage('');
    setExportProgress(10);
    setExportStatusText('⚡ កំពុងរៀបចំ Video & Khmer Voice Track...');

    let finalSaveFileName = (saveFileName || 'Dubbed_Khmer_Movie.mp4').trim();
    if (!/\.(mp4|m4v)$/i.test(finalSaveFileName)) {
      finalSaveFileName = `${finalSaveFileName}.mp4`;
    }

    const targetPath = getFullDestinationPath();

    try {
      const activeSubtitles = subtitles
        .filter((s) => s.isChecked !== false)
        .sort((a, b) => (Number(a.startTime) || 0) - (Number(b.startTime) || 0));

      // Prepare audio base64 or urls for all dubbed voice segments
      setExportStatusText('🎙️ កំពុងដំណើរការ Khmer Audio Tracks & Timestamps...');
      setExportProgress(25);

      const preparedSubtitles = await Promise.all(
        activeSubtitles.map(async (seg, idx) => {
          let audioBase64: string | undefined = undefined;
          if (seg.audioUrl) {
            try {
              const resp = await fetch(seg.audioUrl);
              const blob = await resp.blob();
              audioBase64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            } catch (err) {
              console.warn(`Could not read audio for segment ${idx}:`, err);
            }
          }
          const rawStart = Number(seg.startTime);
          const safeStart = Number.isFinite(rawStart) && rawStart >= 0 ? rawStart : 0;
          const rawEnd = Number(seg.endTime);
          const safeEnd = Number.isFinite(rawEnd) && rawEnd >= safeStart ? rawEnd : safeStart + 1.0;
          const rawSpeed = Number(seg.ttsSpeed || seg.speed);
          const safeSpeed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 1.0;

          return {
            id: seg.id,
            startTime: safeStart,
            endTime: safeEnd,
            text: seg.text,
            speed: safeSpeed,
            audioBase64,
            audioUrl: seg.audioUrl,
          };
        })
      );

      setExportStatusText('🎨 កំពុងរៀបចំ Style អក្សរ និងសម្លេង (100% ដូចផ្ទាំង Preview)...');
      setExportProgress(35);

      let previewWidth = 336;
      const videoEl = document.querySelector('video');
      if (videoEl && videoEl.clientWidth > 50) {
        previewWidth = videoEl.clientWidth;
      }

      // Ensure subtitle style has explicit center horizontal position & preview scaling reference
      const exportSubtitleStyle: SubtitleStyle = {
        ...subtitleStyle,
        previewWidth,
        xPercent: subtitleStyle.xPercent !== undefined ? subtitleStyle.xPercent : 50,
        yPercent: subtitleStyle.yPercent !== undefined ? subtitleStyle.yPercent : (subtitleStyle.position === 'top' ? 10 : subtitleStyle.position === 'mid' ? 50 : 70),
      };

      // Render pixel-perfect Canvas overlays for text overlays (Watermarks, Titles, Branding)
      let renderedOverlays: any[] = [];
      if (textOverlays && textOverlays.length > 0) {
        setExportStatusText('🎨 កំពុង Render Text Overlay គុណភាពខ្ពស់ (Canvas 100% ដូច Preview)...');
        setExportProgress(40);

        let vWidth = 1080;
        let vHeight = 1920;
        if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
          vWidth = videoEl.videoWidth;
          vHeight = videoEl.videoHeight;
        } else if (aspectRatio === '16:9') {
          vWidth = 1920;
          vHeight = 1080;
        } else {
          vWidth = 1080;
          vHeight = 1920;
        }

        try {
          renderedOverlays = await renderTextOverlaysToCanvasOverlays(
            textOverlays,
            vWidth,
            vHeight,
            previewWidth
          );
        } catch (canvasErr) {
          console.warn('Canvas text overlay rendering warning (fallback to server):', canvasErr);
        }
      }

      setExportStatusText('📹 កំពុងបញ្ជូនទិន្នន័យទៅកាន់ Video Engine (FFmpeg)...');
      setExportProgress(45);

      const formData = new FormData();
      const localPath = (videoFile as any)?.path || originalVideoPath;
      if (localPath) {
        formData.append('videoPath', localPath);
      }
      if (videoFile) {
        formData.append('video', videoFile, videoFile.name || 'input.mp4');
      } else if (videoUrl.startsWith('data:') || videoUrl.startsWith('blob:')) {
        try {
          const resp = await fetch(videoUrl);
          const blob = await resp.blob();
          formData.append('video', blob, 'input.mp4');
        } catch (blobErr) {
          console.warn('Could not read blob video:', blobErr);
          formData.append('videoUrl', videoUrl);
        }
      } else {
        formData.append('videoUrl', videoUrl);
      }

      formData.append('subtitles', JSON.stringify(preparedSubtitles));
      formData.append('subtitleStyle', JSON.stringify(exportSubtitleStyle));
      formData.append('blurBoxes', JSON.stringify(blurBoxes));
      formData.append('previewWidth', String(previewWidth || 0));
      formData.append('textOverlays', JSON.stringify(textOverlays));
      formData.append('renderedOverlays', JSON.stringify(renderedOverlays));
      formData.append('imageOverlays', JSON.stringify(imageOverlays));

      let isolatedBgmPath: string | undefined = useDemucs && preSeparatedBgmPath ? preSeparatedBgmPath : undefined;
      const targetSepVideo = originalVideoPath || (videoFile as any)?.path;
      if (useDemucs && !isolatedBgmPath && (targetSepVideo || videoFile)) {
        setExportStatusText('🎵 Demucs AI កំពុងលុបសំឡេងចិនដើម និងស្រង់ភ្លេង BGM + SFX...');
        setExportProgress(40);
        try {
          const controller = new AbortController();
          // Allow up to 45 minutes for long videos (e.g. 2+ hours)
          const timeoutId = setTimeout(() => controller.abort(), 2700000);
          let sepResp: Response;
          if (targetSepVideo) {
            sepResp = await fetch('/api/separate-audio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoPath: targetSepVideo, device: 'auto' }),
              signal: controller.signal,
            });
          } else {
            const sepForm = new FormData();
            sepForm.append('video', videoFile as File);
            sepForm.append('device', 'auto');
            sepResp = await fetch('/api/separate-audio', {
              method: 'POST',
              body: sepForm,
              signal: controller.signal,
            });
          }
          clearTimeout(timeoutId);
          if (sepResp.ok) {
            const sepData = await sepResp.json();
            if (sepData.ok && sepData.outputBgm) {
              isolatedBgmPath = sepData.outputBgm;
            }
          }
        } catch (demucsErr) {
          console.warn('Demucs separation notice (using direct audio mix):', demucsErr);
        }
      }

      const bgmRatio = (bgmMixLevel !== undefined ? bgmMixLevel : 20) / 100;
      const shouldMuteOrig = isMuteOriginalVocals === true;

      if (isolatedBgmPath) {
        formData.append('isolatedBgmPath', isolatedBgmPath);
        formData.append('muteOriginalAudio', 'false');
        formData.append('originalAudioVolume', bgmRatio.toFixed(3));
      } else if (shouldMuteOrig && !useDemucs) {
        formData.append('muteOriginalAudio', 'true');
        formData.append('originalAudioVolume', '0.0');
      } else {
        formData.append('muteOriginalAudio', 'false');
        formData.append('originalAudioVolume', bgmRatio.toFixed(3));
      }

      formData.append('encoder', 'auto');
      formData.append('aspectRatio', aspectRatio);
      formData.append('fileName', finalSaveFileName);
      formData.append('targetFilePath', targetPath);
      formData.append('skipDownload', 'true');

      setExportStatusText('Render processing...');
      setExportProgress(65);

      const response = await fetch('/api/export-ffmpeg', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errMsg = `Server returned status ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.error) errMsg = errJson.error;
        } catch {}
        throw new Error(errMsg);
      }

      setExportStatusText('✨ Render រួចរាល់! កំពុងបញ្ចប់ការ Save ចូលទៅ Folder...');
      setExportProgress(95);

      const receipt = await response.json().catch(() => null);
      if (receipt && receipt.savedToTarget === false) {
        throw new Error('មិនអាចរក្សាទុកឯកសារទៅថតដែលបានជ្រើសរើសបានទេ');
      }

      setExportProgress(100);
      setExportStatusText('🎉 បាន Save និង Export វីដេអូរួចរាល់!');
      setIsExporting(false);
      setIsExportCompleted(true);

      if (onShowToast) {
        onShowToast('success', 'Export ជោគជ័យ!', `វីដេអូត្រូវបានរក្សាទុកនៅ: ${targetPath}`);
      }
    } catch (err: any) {
      console.error('Export error:', err);
      setIsExporting(false);
      setIsExportCompleted(false);
      setErrorMessage(err.message || 'មានបញ្ហាក្នុងការ Export វីដេអូ');
    }
  };

  const fullDestinationDisplay = getFullDestinationPath();

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">

      <div className="w-full max-w-lg bg-[#0d1421] border border-[#1e2d45] rounded-sm overflow-hidden shadow-2xl flex flex-col my-auto">
        {/* Modal Header */}
        <div className="bg-[#111a2a] border-b border-[#1c2a42] px-5 py-4 flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold text-slate-100 tracking-wide uppercase">
            Export Video
          </h2>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="text-slate-400 hover:text-white p-1 rounded-sm hover:bg-[#1a283d] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Only File Name and Save to */}
        <div className="p-5 flex flex-col gap-4">
          {/* File Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono font-bold text-slate-200">
              File name:
            </label>
            <input
              type="text"
              value={saveFileName}
              onChange={(e) => {
                setIsExportCompleted(false);
                handleFileNameChange(e);
              }}
              disabled={isExporting}
              placeholder="AI Technology Overview"
              className="w-full bg-[#09101b] border border-[#1b2b45] focus:border-cyan-400 px-3.5 py-2.5 rounded-sm text-xs text-cyan-200 font-mono focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Save to */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono font-bold text-slate-200">
              Save to:
            </label>

            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={fullDestinationDisplay}
                  onChange={(e) => {
                    setIsExportCompleted(false);
                    handleFullPathChange(e);
                  }}
                  disabled={isExporting}
                  placeholder="D:\YouTube\Movies\EP01.mp4"
                  className="w-full bg-[#09101b] border border-[#1b2b45] focus:border-cyan-400 px-3.5 py-2.5 rounded-sm text-xs text-cyan-200 font-mono focus:outline-none disabled:opacity-50 transition-all shadow-inner"
                />
              </div>
              <button
                type="button"
                onClick={handleBrowseFolder}
                disabled={isExporting || isPickingFolder}
                title="ជ្រើសរើស Folder (Browse Folder)"
                className="px-3 py-2.5 rounded-sm bg-[#122238] hover:bg-[#1a3354] active:scale-95 text-cyan-300 hover:text-white border border-cyan-500/40 text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-sm"
              >
                {isPickingFolder ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>Browse</span>
              </button>
            </div>

            {folderNotice && (
              <p className="text-[11px] text-amber-300/90 font-khmer leading-relaxed">
                {folderNotice}
              </p>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-rose-950/60 border border-rose-500/40 p-3 rounded-sm flex items-center gap-2.5 text-xs text-rose-300 font-mono">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Progress Bar during Export / Completed */}
          {(isExporting || isExportCompleted) && (
            <div className="bg-[#09101c] border border-cyan-500/30 p-3 rounded-sm flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-cyan-300 font-bold flex items-center gap-2 truncate max-w-[340px]">
                  {exportProgress < 100 ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span>{exportStatusText}</span>
                </span>
                <span className="text-white font-bold">{exportProgress}%</span>
              </div>
              <div className="w-full bg-[#121d2e] h-2 rounded-sm overflow-hidden border border-[#1e2f4a]">
                <div
                  className="bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500 h-full transition-all duration-150 shadow-[0_0_12px_rgba(34,211,238,0.7)]"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons: Export / Open and Close */}
          <div className="pt-3 border-t border-[#1c2a42] flex items-center justify-end gap-2.5 text-xs font-mono mt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-5 py-2.5 rounded-sm bg-[#162236] text-slate-300 hover:text-white border border-[#233550] cursor-pointer font-mono font-bold hover:bg-[#1f2f4a] transition-all disabled:opacity-50"
            >
              Close
            </button>

            {isExportCompleted ? (
              <button
                type="button"
                onClick={handleOpenInExplorer}
                className="px-6 py-2.5 rounded-sm bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-extrabold text-xs font-mono flex items-center gap-2 shadow-[0_0_16px_rgba(16,185,129,0.45)] transition-all cursor-pointer active:scale-95"
              >
                <FolderOpen className="w-4 h-4 text-black" />
                <span className="font-bold">OPEN</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartExport}
                disabled={isExporting}
                className="px-6 py-2.5 rounded-sm bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500 hover:from-teal-300 hover:to-blue-400 text-black font-extrabold text-xs font-mono flex items-center gap-2 shadow-[0_0_16px_rgba(34,211,238,0.4)] transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 text-black animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 text-black fill-black" />
                )}
                <span className="font-bold">{isExporting ? 'EXPORTING...' : 'EXPORT'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
