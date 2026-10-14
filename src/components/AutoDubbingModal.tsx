import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FolderOpen,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  Square,
  Bot,
  Sliders,
  Terminal,
  Trash2,
  Sparkles,
  Check,
  Copy,
} from 'lucide-react';
import {
  runAutoDubbing,
  listVideosInFolder,
  AutoDubVideo,
  AutoDubProgress,
  AutoDubResult,
} from '../utils/autoDubbing';
import { SubtitleStyle } from '../types';
import { PRESET_STYLES } from '../constants/presetStyles';
import { globalConsoleLogger, ConsoleLogItem } from '../utils/consoleLogger';
import headerTextureTile from '../assets/header_texture_tile.png';

export type GeminiModelGroup = 'Gemini 3' | 'Gemini 2.5' | 'Deprecated';

export interface GeminiModelOption {
  id: string;
  displayName: string;
  group: GeminiModelGroup;
}

export const GEMINI_GROUPS: Array<{ key: GeminiModelGroup; label: string }> = [
  { key: 'Gemini 3', label: '── Gemini 3 ──' },
  { key: 'Gemini 2.5', label: '── Gemini 2.5 ──' },
  { key: 'Deprecated', label: '── Deprecated ──' },
];

const DEFAULT_GEMINI_MODELS: GeminiModelOption[] = [
  // ── Gemini 3 ──
  { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', group: 'Gemini 3' },
  { id: 'gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', group: 'Gemini 3' },
  { id: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', group: 'Gemini 3' },
  { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash (Stable)', group: 'Gemini 3' },
  { id: 'gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash Lite (Recommended)', group: 'Gemini 3' },
  { id: 'gemini-3.5-transcribe', displayName: 'Gemini 3.5 Transcribe (Live Audio Only)', group: 'Gemini 3' },
  { id: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', group: 'Gemini 3' },
  { id: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash Preview', group: 'Gemini 3' },
  { id: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite (Stable)', group: 'Gemini 3' },
  { id: 'gemini-3.1-flash-lite-preview', displayName: 'Gemini 3.1 Flash Lite Preview', group: 'Gemini 3' },

  // ── Gemini 2.5 ──
  { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', group: 'Gemini 2.5' },
  { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', group: 'Gemini 2.5' },
  { id: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite (Fastest)', group: 'Gemini 2.5' },

  // ── Deprecated ──
  { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', group: 'Deprecated' },
  { id: 'gemini-2.0-flash-lite', displayName: 'Gemini 2.0 Flash Lite', group: 'Deprecated' },
  { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', group: 'Deprecated' },
  { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', group: 'Deprecated' },
];

function getModelGroup(model: GeminiModelOption): GeminiModelGroup {
  if (model.group) return model.group;
  const id = model.id.toLowerCase();
  if (id.includes('3.') || id.includes('gemini-3')) return 'Gemini 3';
  if (id.includes('2.5')) return 'Gemini 2.5';
  return 'Deprecated';
}

interface AutoDubbingModalProps {
  isOpen: boolean;
  initialTab?: 'config' | 'console';
  onClose: () => void;
  apiKeys: string[];
  subtitleStyle: SubtitleStyle;
  engine: 'fast-whisper' | 'srt';
  geminiModel: string;
  geminiActive?: boolean;
  onShowToast?: (type: 'success' | 'error' | 'info' | 'warning', title: string, message?: string) => void;
  onSetTranscribeEngine?: (engine: 'fast-whisper' | 'srt') => void;
  onSetGeminiModel?: (model: string) => void;
}

/** Asks the server to open the OS folder chooser, as the export modal does. */
async function pickFolder(initialPath: string): Promise<string | null> {
  const response = await fetch('/api/pick-directory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initialPath: initialPath || '' }),
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    throw new Error('Server កំពុងដំណើរការកំណែចាស់។ សូម Restart កម្មវិធី។');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'មិនអាចបើកបញ្ជីថតបានទេ។');
  if (data.cancelled || !data.path) return null;
  return String(data.path).replace(/[\\/]+$/, '');
}

export const AutoDubbingModal: React.FC<AutoDubbingModalProps> = ({
  isOpen,
  initialTab = 'config',
  onClose,
  apiKeys,
  subtitleStyle,
  engine,
  geminiModel,
  geminiActive,
  onShowToast,
  onSetTranscribeEngine,
  onSetGeminiModel,
}) => {
  const [sourceFolder, setSourceFolder] = useState<string>(() => {
    try {
      return localStorage.getItem('jai_dubber_autodub_source') || '';
    } catch {
      return '';
    }
  });
  const [outputFolder, setOutputFolder] = useState<string>(() => {
    try {
      return localStorage.getItem('jai_dubber_autodub_output') || '';
    } catch {
      return '';
    }
  });
  const [videos, setVideos] = useState<AutoDubVideo[]>([]);
  const [scanError, setScanError] = useState('');
  const [isPicking, setIsPicking] = useState<'source' | 'output' | null>(null);

  const handleSourceFolderChange = (val: string) => {
    const clean = val.replace(/[\\/]+$/, '');
    setSourceFolder(clean);
    try {
      localStorage.setItem('jai_dubber_autodub_source', clean);
      if (clean) localStorage.setItem('jai_dubber_last_active_dir', clean);
    } catch {}
  };

  const handleOutputFolderChange = (val: string) => {
    const clean = val.replace(/[\\/]+$/, '');
    setOutputFolder(clean);
    try {
      localStorage.setItem('jai_dubber_autodub_output', clean);
      if (clean) localStorage.setItem('jai_dubber_last_active_dir', clean);
    } catch {}
  };

  // Transcribe & Export Preferences
  const [selectedEngine, setSelectedEngine] = useState<'fast-whisper' | 'srt'>(() => {
    try {
      const saved = localStorage.getItem('jai_dubber_transcribe_engine') as 'fast-whisper' | 'srt';
      if (saved === 'fast-whisper' || saved === 'srt') return saved;
    } catch {}
    return engine || 'fast-whisper';
  });

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('jai_dubber_gemini_model');
      if (saved && saved.trim()) return saved.trim();
    } catch {}
    return geminiModel || 'gemini-3.5-flash';
  });

  const [burnSubtitles, setBurnSubtitles] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('jai_dubber_autodub_burn_subtitles');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  const [useDemucs, setUseDemucs] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('jai_dubber_autodub_use_demucs');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true; // Default to true because user has Demucs with CUDA GPU!
  });

  useEffect(() => {
    if (isOpen) {
      if (engine) setSelectedEngine(engine);
      if (geminiModel) setSelectedModel(geminiModel);
    }
  }, [isOpen, engine, geminiModel]);

  const handleEngineChange = (eng: 'fast-whisper' | 'srt') => {
    setSelectedEngine(eng);
    onSetTranscribeEngine?.(eng);
    try {
      localStorage.setItem('jai_dubber_transcribe_engine', eng);
    } catch {}
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    onSetGeminiModel?.(model);
    try {
      localStorage.setItem('jai_dubber_gemini_model', model);
    } catch {}
  };

  const handleBurnSubtitlesChange = (burn: boolean) => {
    setBurnSubtitles(burn);
    try {
      localStorage.setItem('jai_dubber_autodub_burn_subtitles', burn ? 'true' : 'false');
    } catch {}
  };

  const handleUseDemucsChange = (enabled: boolean) => {
    setUseDemucs(enabled);
    try {
      localStorage.setItem('jai_dubber_autodub_use_demucs', enabled ? 'true' : 'false');
    } catch {}
  };

  // Drama Style & Tone Adaptation
  const [dramaStyle, setDramaStyle] = useState<string>(() => {
    try {
      return localStorage.getItem('jai_dubber_autodub_drama_style') || 'Historical_Royal';
    } catch {
      return 'Historical_Royal';
    }
  });

  const handleDramaStyleChange = (style: string) => {
    setDramaStyle(style);
    try {
      localStorage.setItem('jai_dubber_autodub_drama_style', style);
    } catch {}
  };

  // Khmer Voice Selection
  const [voice, setVoice] = useState<string>(() => {
    try {
      return localStorage.getItem('jai_dubber_autodub_voice') || 'auto';
    } catch {
      return 'auto';
    }
  });

  const handleVoiceChange = (v: string) => {
    setVoice(v);
    try {
      localStorage.setItem('jai_dubber_autodub_voice', v);
    } catch {}
  };

  // Audio Mode (Mute Original vs Mute Vocal Only)
  const [audioMode, setAudioMode] = useState<'mute_original' | 'mute_vocal' | 'duck_original'>(() => {
    try {
      const saved = localStorage.getItem('jai_dubber_autodub_audio_mode') as any;
      if (saved === 'mute_vocal' || saved === 'duck_original' || saved === 'mute_original') {
        return saved === 'duck_original' ? 'mute_vocal' : saved;
      }
    } catch {}
    return 'mute_original';
  });

  const handleAudioModeChange = (mode: 'mute_original' | 'mute_vocal') => {
    setAudioMode(mode);
    try {
      localStorage.setItem('jai_dubber_autodub_audio_mode', mode);
    } catch {}
  };

  // Skip already dubbed videos
  const [skipExisting, setSkipExisting] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('jai_dubber_autodub_skip_existing');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  const handleSkipExistingChange = (skip: boolean) => {
    setSkipExisting(skip);
    try {
      localStorage.setItem('jai_dubber_autodub_skip_existing', skip ? 'true' : 'false');
    } catch {}
  };

  // Recent folders history (similar to Windows File Explorer address bar dropdown)
  const [recentFolders, setRecentFolders] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('jai_dubber_recent_folders');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      'C:\\JAI DUBBER\\M3',
      'C:\\VoxCPM',
      'D:\\TikTok\\Videos',
      'D:\\YouTube\\Clip',
    ];
  });

  const recordRecentFolder = (folder: string) => {
    const clean = (folder || '').trim().replace(/[\\/]+$/, '');
    if (!clean) return;
    setRecentFolders((prev) => {
      const filtered = prev.filter((p) => p.toLowerCase() !== clean.toLowerCase());
      const updated = [clean, ...filtered].slice(0, 20);
      try {
        localStorage.setItem('jai_dubber_recent_folders', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Open folder directly in Windows File Explorer
  const openInFileExplorer = async (targetPath: string) => {
    const p = (targetPath || '').trim().replace(/[\\/]+$/, '');
    if (!p) {
      onShowToast?.('warning', 'សូមបញ្ចូលទីតាំង Folder ជាមុនសិន');
      return;
    }
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.openPath) {
        await electronAPI.openPath(p);
        onShowToast?.('success', 'បានបើក Windows File Explorer', p);
        return;
      }
      const res = await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: p }),
      });
      if (res.ok) {
        onShowToast?.('success', 'បានបើក Windows File Explorer', p);
      } else {
        const data = await res.json().catch(() => ({}));
        onShowToast?.('error', 'មិនអាចបើក Folder បានទេ', data.error || 'Server error');
      }
    } catch {
      onShowToast?.('error', 'មិនអាចទាក់ទង Server បានទេ');
    }
  };

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<AutoDubProgress | null>(null);
  const [results, setResults] = useState<AutoDubResult[]>([]);
  // Set when the run halted because every key and model ran out of quota.
  const [quotaStopped, setQuotaStopped] = useState<{ done: number; total: number } | null>(null);

  // Tab state: 'config' (Queue & Setup) or 'console' (Live Terminal)
  const [activeTab, setActiveTab] = useState<'config' | 'console'>(initialTab);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | 'stage' | 'success' | 'warn-error'>('all');
  const [autoScroll, setAutoScroll] = useState(true);

  // Sync initialTab when modal opens or prop changes
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Real-time Dubbing Processing Console state synced with global logger
  const [logs, setLogs] = useState<ConsoleLogItem[]>(() => globalConsoleLogger.getAll());
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const consoleContainerRef = useRef<HTMLDivElement>(null);
  const lastLoggedKeyRef = useRef<string>('');

  useEffect(() => {
    const unsub = globalConsoleLogger.subscribe((all) => {
      setLogs(all);
    });
    return unsub;
  }, []);

  const addLog = (text: string, type: ConsoleLogItem['type'] = 'info') => {
    globalConsoleLogger.add(text, type);
  };

  useEffect(() => {
    if (autoScroll && consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, activeTab]);

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.time}] [${l.type.toUpperCase()}] ${l.text}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  // A ref, not state: the running loop reads this between stages and would
  // otherwise keep seeing the value captured when it started.
  const cancelRef = useRef(false);
  // Mirrors quotaStopped for the async run, which cannot see the state update.
  const quotaStoppedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    try {
      setSourceFolder(localStorage.getItem('jai_dubber_autodub_source') || '');
      setOutputFolder(localStorage.getItem('jai_dubber_autodub_output') || '');
    } catch {
      /* first run */
    }
    setProgress(null);
    setResults([]);
    setQuotaStopped(null);
    setScanError('');
    setLogs([]);
    lastLoggedKeyRef.current = '';
    cancelRef.current = false;
  }, [isOpen]);

  // Whenever the source or output folder changes, scan videos and check already dubbed status.
  useEffect(() => {
    if (!isOpen || !sourceFolder) {
      setVideos([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const found = await listVideosInFolder(sourceFolder, outputFolder);
        if (!cancelled) {
          setVideos(found);
          setScanError('');
        }
      } catch (err: any) {
        if (!cancelled) {
          setVideos([]);
          setScanError(err?.message || 'មិនអាចអានថតបានទេ។');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, sourceFolder, outputFolder]);

  if (!isOpen) return null;

  const choose = async (which: 'source' | 'output') => {
    if (isRunning) return;
    setIsPicking(which);
    setScanError('');
    try {
      let startingPath = (which === 'source' ? sourceFolder : outputFolder).trim();
      if (!startingPath) {
        startingPath =
          (which === 'source' ? outputFolder : sourceFolder).trim() ||
          localStorage.getItem('jai_dubber_last_active_dir') ||
          '';
      }

      // 1. Electron Desktop API if available (Instant native OS dialog)
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.selectDirectory) {
        const picked = await electronAPI.selectDirectory(startingPath || undefined);
        if (picked && typeof picked === 'string') {
          const cleanPath = picked.replace(/[\\/]+$/, '');
          if (which === 'source') {
            setSourceFolder(cleanPath);
            localStorage.setItem('jai_dubber_autodub_source', cleanPath);
          } else {
            setOutputFolder(cleanPath);
            localStorage.setItem('jai_dubber_autodub_output', cleanPath);
          }
          localStorage.setItem('jai_dubber_last_active_dir', cleanPath);
          recordRecentFolder(cleanPath);
        }
        return;
      }
      if (electronAPI?.showOpenDialog) {
        const result = await electronAPI.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
          defaultPath: startingPath || undefined,
          title: 'ជ្រើសរើស Folder (Select Folder)',
        });
        if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
          const cleanPath = String(result.filePaths[0]).replace(/[\\/]+$/, '');
          if (which === 'source') {
            setSourceFolder(cleanPath);
            localStorage.setItem('jai_dubber_autodub_source', cleanPath);
          } else {
            setOutputFolder(cleanPath);
            localStorage.setItem('jai_dubber_autodub_output', cleanPath);
          }
          localStorage.setItem('jai_dubber_last_active_dir', cleanPath);
          recordRecentFolder(cleanPath);
        }
        return;
      }

      // 2. Native Windows Folder Picker via Server (Instant binary or PowerShell)
      const picked = await pickFolder(startingPath);
      if (picked) {
        if (which === 'source') {
          setSourceFolder(picked);
          localStorage.setItem('jai_dubber_autodub_source', picked);
        } else {
          setOutputFolder(picked);
          localStorage.setItem('jai_dubber_autodub_output', picked);
        }
        localStorage.setItem('jai_dubber_last_active_dir', picked);
        recordRecentFolder(picked);
        return;
      }
    } catch (err: any) {
      console.warn('Folder picker notice:', err?.message);
      if (err?.message && !err.message.includes('cancel')) {
        onShowToast?.('info', 'Windows File Explorer', err.message || 'សូមពិនិត្យផ្ទាំងជ្រើសរើស Folder');
      }
    } finally {
      setIsPicking(null);
    }
  };

  const handleStart = async () => {
    if (isRunning) return;

    if (apiKeys.length === 0 && !geminiActive) {
      onShowToast?.('error', 'រកមិនឃើញ API Key!', 'សូមបញ្ចូល Gemini API Key ក្នុង Settings ជាមុនសិន។');
      return;
    }
    if (!sourceFolder || !outputFolder) {
      onShowToast?.('warning', 'សូមជ្រើសរើសថត!', 'ត្រូវការទាំងថតវីដេអូ និងថតសម្រាប់រក្សាទុក។');
      return;
    }
    if (videos.length === 0) {
      onShowToast?.('warning', 'គ្មានវីដេអូ!', 'ថតដែលបានជ្រើសរើសគ្មានឯកសារវីដេអូទេ។');
      return;
    }

    cancelRef.current = false;
    quotaStoppedRef.current = false;
    setIsRunning(true);
    setResults([]);
    setQuotaStopped(null);
    setActiveTab('console');
    lastLoggedKeyRef.current = '';

    addLog(`🚀 ចាប់ផ្ដើម Auto Dubbing (សរុប ${videos.length} វីដេអូ)...`, 'info');
    addLog(
      `⚡ ម៉ាស៊ីន AI: ${selectedEngine === 'fast-whisper' ? 'Fast-Whisper + Gemini AI' : 'Gemini SRT'} (${selectedModel})`,
      'info'
    );
    addLog(
      `🎬 របៀប Export: ${
        burnSubtitles
          ? 'Burn Subtitles (បិទភ្ជាប់ Subtitle ជាមួយទម្រង់អក្សរ និងប្រអប់)'
          : 'Lossless Stream Copy (គុណភាពដើម 100%, វីដេអូសុទ្ធ)'
      }`,
      'info'
    );
    if (useDemucs) {
      addLog(
        '🎵 Demucs AI: បើកដំណើរការ Vocal Isolation (លុបសំឡេងចិនដើម ១០០% ទុកតែភ្លេង BGM + SFX)',
        'info'
      );
    }

    try {
      const preset = PRESET_STYLES.find((p) => p.id === subtitleStyle?.styleType);
      let effectiveTextColor = subtitleStyle?.color;
      if (!effectiveTextColor) {
        if (preset?.style?.color) {
          effectiveTextColor = String(preset.style.color);
        } else if (subtitleStyle?.styleType === 'yellow') {
          effectiveTextColor = '#facc15';
        } else {
          effectiveTextColor = '#ffffff';
        }
      }

      let effectiveBgColor = subtitleStyle?.bgColor;
      if (!effectiveBgColor) {
        if (preset?.style?.backgroundColor) {
          effectiveBgColor = String(preset.style.backgroundColor);
        } else if (subtitleStyle?.styleType === 'box' || !subtitleStyle?.styleType) {
          effectiveBgColor = '#000000';
        } else {
          effectiveBgColor = '#000000';
        }
      }

      const effectiveMaxLines = subtitleStyle?.maxLines !== undefined ? subtitleStyle.maxLines : 1;

      const finished = await runAutoDubbing({
        sourceFolder,
        outputFolder,
        apiKeys,
        geminiModel: selectedModel,
        dramaStyle,
        voice,
        audioMode,
        burnSubtitles,
        subtitleFont: subtitleStyle?.fontFamily || 'Battambang',
        subtitleColor: effectiveTextColor,
        subtitleYPct: subtitleStyle?.yPercent !== undefined ? subtitleStyle.yPercent : 70,
        subtitleFontSize: subtitleStyle?.fontSize || 15,
        subtitleWidthPct: subtitleStyle?.widthPercent || 88,
        subtitleBgColor: effectiveBgColor,
        subtitleBgOpacity: subtitleStyle?.bgOpacity !== undefined ? subtitleStyle.bgOpacity : 100,
        subtitleStyleType: subtitleStyle?.styleType || 'box',
        subtitleMaxLines: effectiveMaxLines,
        subtitleStyle,
        skipExisting,
        onProgress: (prog) => {
          setProgress(prog);
          const detail = prog.detail || stageLabel(prog.stage);
          const logKey = `${prog.index}-${prog.stage}-${detail}`;
          if (detail && logKey !== lastLoggedKeyRef.current) {
            lastLoggedKeyRef.current = logKey;
            let logType: ConsoleLogItem['type'] = 'stage';
            if (prog.stage === 'failed') logType = 'error';
            else if (prog.stage === 'done') logType = 'success';
            addLog(`[${prog.index}/${prog.total}] ${prog.video.name} ➔ ${detail}`, logType);
          }
        },
        onVideoDone: (result) => {
          setResults((prev) => [...prev, result]);
          if (result.ok) {
            if (result.reason?.includes('រំលង') || result.reason?.includes('already')) {
              addLog(`⏭️ [រំលង] ${result.video.name} — Dubbed រួចរាល់`, 'info');
            } else {
              addLog(`✅ [ជោគជ័យ] ${result.video.name} ➔ ${result.outputPath || 'ជោគជ័យ'}`, 'success');
            }
          } else {
            addLog(`❌ [បរាជ័យ] ${result.video.name}: ${result.reason || 'កំហុសមិនស្គាល់'}`, 'error');
          }
        },
        onQuotaExhausted: (_video, index, total) => {
          quotaStoppedRef.current = true;
          setQuotaStopped({ done: index, total });
          addLog(`⚠️ [អស់ Quota] Key & Model ទាំងអស់អស់កូតាត្រឹមភាគទី ${index}/${total}។`, 'warn');
        },
        isCancelled: () => cancelRef.current,
      });

      const ok = finished.filter((r) => r.ok).length;
      const failed = finished.length - ok;
      if (quotaStoppedRef.current) {
        addLog(`⚠️ Auto Dubbing បានផ្អាក (អស់ Quota)។ ជោគជ័យ ${ok}/${finished.length} វីដេអូ។`, 'warn');
        onShowToast?.(
          'warning',
          'អស់កូតា (Quota) ហើយ!',
          `បានធ្វើរួច ${ok} វីដេអូ។ Key និងម៉ូដែលទាំងអស់អស់កូតា — សូមរង់ចាំ រួចចុច Start ម្តងទៀត (វីដេអូដែលរួចហើយនឹងត្រូវរំលង)។`
        );
      } else if (cancelRef.current) {
        addLog(`🛑 អ្នកប្រើប្រាស់បានចុច Stop។ បានធ្វើរួច ${ok} វីដេអូ មុនពេលបញ្ឈប់។`, 'warn');
        onShowToast?.('info', 'បានបញ្ឈប់', `បានធ្វើរួច ${ok} វីដេអូ មុនពេលបញ្ឈប់។`);
      } else {
        addLog(`🎉 Auto Dubbing បានបញ្ចប់ទាំងស្រុង! ជោគជ័យ: ${ok} វីដេអូ${failed > 0 ? `, បរាជ័យ: ${failed}` : ''}។`, failed === 0 ? 'success' : 'warn');
        onShowToast?.(
          failed === 0 ? 'success' : 'warning',
          'Auto Dubbing រួចរាល់!',
          `ជោគជ័យ ${ok} វីដេអូ${failed > 0 ? `, បរាជ័យ ${failed}` : ''}។`
        );
      }
    } catch (err: any) {
      addLog(`❌ [កំហុសប្រព័ន្ធ] ${err?.message || 'មិនស្គាល់មូលហេតុ'}`, 'error');
      onShowToast?.('error', 'Auto Dubbing មានបញ្ហា!', err?.message || 'មិនស្គាល់មូលហេតុ');
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  const stageLabel = (stage: string) =>
    ({
      loading: 'បើកវីដេអូ',
      transcribing: 'ស្រង់អត្ថបទ',
      voicing: 'បង្កើតសំឡេង',
      exporting: 'Export',
      done: 'រួចរាល់',
      failed: 'បរាជ័យ',
    } as Record<string, string>)[stage] || stage;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-[#0b111c] border border-[#1c2a42] rounded-sm w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header with animated texture from Image 2 */}
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-cyan-500/50 bg-[#0a1624] shrink-0 overflow-hidden shadow-md">
          {/* Animated Header Dot/Diamond Texture Layer */}
          <div
            className="absolute inset-0 pointer-events-none animated-header-texture opacity-90 z-0"
            style={{
              backgroundImage: `url(${headerTextureTile})`,
              backgroundRepeat: 'repeat-x',
              backgroundSize: '1024px 100%',
            }}
          />
          {/* Vignette overlay */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#07111c]/75 via-transparent to-[#07111c]/75 z-0" />

          <div className="relative z-10 flex items-center gap-2">
            <Bot className="w-4 h-4 text-fuchsia-400" />
            <h2 className="text-sm font-bold text-fuchsia-300 font-mono tracking-wider drop-shadow-sm">
              AUTO DUBBING
            </h2>
          </div>
          <button
            onClick={() => (isRunning ? undefined : onClose())}
            disabled={isRunning}
            className="relative z-10 text-slate-300 hover:text-white p-1 rounded-sm hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            title={isRunning ? 'កំពុងដំណើរការ...' : 'បិទ'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pinned Tab Bar */}
        <div className="flex items-center justify-between border-b border-[#1c2a42] px-4 bg-[#0d1524] shrink-0">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('config')}
              className={`px-3.5 py-2.5 text-xs font-mono font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === 'config'
                  ? 'border-fuchsia-400 text-fuchsia-300 bg-fuchsia-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>Queue & Config</span>
              {videos.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#18253b] text-slate-300 font-mono">
                  {results.length}/{videos.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('console')}
              className={`px-3.5 py-2.5 text-xs font-mono font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === 'console'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10 shadow-[0_2px_8px_rgba(6,182,212,0.2)]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Console Log (Live Output)</span>
              {isRunning && (
                <span className="flex h-2 w-2 relative ml-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                {logs.length}
              </span>
            </button>
          </div>

          {/* Quick status on the right */}
          <div className="flex items-center gap-2">
            {isRunning && progress ? (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>[{progress.index}/{progress.total}] {Math.max(0, Math.min(100, Math.round(progress.percent ?? 0)))}%</span>
              </div>
            ) : results.length > 0 ? (
              <div className="flex items-center gap-1 text-[11px] font-mono text-cyan-300">
                <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                <span>ជោគជ័យ {succeeded}/{results.length}</span>
              </div>
            ) : (
              <span className="text-[10px] font-mono text-slate-500">Ready</span>
            )}
          </div>
        </div>

        {/* Live progress pinned on top of both tabs */}
        {isRunning && progress && (
          <div className="mx-4 mt-3 bg-[#0d1624] border border-cyan-500/40 rounded-sm p-3 flex flex-col gap-2 shrink-0 shadow-lg">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-fuchsia-300 font-bold truncate">
                [{progress.index}/{progress.total}] {progress.video.name}
              </span>
              <span className="text-cyan-300 bg-cyan-950/90 border border-cyan-500/50 px-2 py-0.5 rounded text-[10px] font-mono font-bold min-w-[42px] text-center">
                {Math.max(0, Math.min(100, Math.round(progress.percent ?? 0)))}%
              </span>
            </div>
            <div className="h-1.5 bg-[#142033] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, progress.percent ?? 0))}%` }}
              />
            </div>
            {progress.detail && (
              <p className="text-[11px] font-khmer text-slate-300 truncate">{progress.detail}</p>
            )}
          </div>
        )}

        {quotaStopped && (
          <div className="mx-4 mt-3 bg-amber-950/40 border border-amber-500/50 rounded-sm p-3 flex items-start gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] font-khmer text-amber-200 leading-relaxed">
              បានឈប់ត្រឹមវីដេអូទី {quotaStopped.done}/{quotaStopped.total} ព្រោះ API Key
              និងម៉ូដែល Gemini ទាំងអស់អស់កូតា។ សូមរង់ចាំបន្តិច (ឬបន្ថែម Key ថ្មី) រួចចុច Start
              ម្តងទៀត — វីដេអូដែលធ្វើរួចហើយនឹងត្រូវរំលងដោយស្វ័យប្រវត្តិ។
            </div>
          </div>
        )}

        {/* Tab 1: Queue & Configuration */}
        {activeTab === 'config' && (
          <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
          {/* Datalist for autocomplete recent folders */}
          <datalist id="autodub-recent-folders">
            {recentFolders.map((f, i) => (
              <option key={`${f}-${i}`} value={f} />
            ))}
          </datalist>

          {/* Source folder */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono font-bold text-slate-200">
              Select Folder:
            </label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={sourceFolder}
                  onChange={(e) => handleSourceFolderChange(e.target.value)}
                  disabled={isRunning}
                  list="autodub-recent-folders"
                  placeholder="D:\YouTube\Clip\MV\My Show"
                  className="w-full bg-[#09101b] border border-[#1b2b45] focus:border-fuchsia-400 px-3 py-2.5 rounded-sm text-xs text-fuchsia-200 font-mono focus:outline-none disabled:opacity-50"
                />
              </div>
              <button
                type="button"
                onClick={() => choose('source')}
                disabled={isRunning || isPicking !== null}
                title="Browse Folder"
                className="px-3 py-2.5 rounded-sm bg-[#221238] hover:bg-[#33184f] active:scale-95 text-fuchsia-300 hover:text-white border border-fuchsia-500/40 text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-sm"
              >
                {isPicking === 'source' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-400" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5 text-fuchsia-400" />
                )}
                <span>Browse</span>
              </button>
            </div>

            {videos.length > 0 && (
              <div className="flex items-center justify-between text-[11px] font-mono mt-1 px-0.5">
                <span className="text-emerald-400 font-bold">
                  រកឃើញវីដេអូ {videos.length} ឯកសារ
                </span>
                {videos.filter((v) => v.alreadyDubbed).length > 0 && (
                  <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-mono">
                    Dubbed រួច {videos.filter((v) => v.alreadyDubbed).length} ឯកសារ
                  </span>
                )}
              </div>
            )}
            {scanError && <p className="text-[11px] font-khmer text-rose-300">{scanError}</p>}
          </div>

          {/* Output folder */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono font-bold text-slate-200">
              Export to:
            </label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={outputFolder}
                  onChange={(e) => handleOutputFolderChange(e.target.value)}
                  disabled={isRunning}
                  list="autodub-recent-folders"
                  placeholder="D:\YouTube\Movies\Export"
                  className="w-full bg-[#09101b] border border-[#1b2b45] focus:border-cyan-400 px-3 py-2.5 rounded-sm text-xs text-cyan-200 font-mono focus:outline-none disabled:opacity-50"
                />
              </div>
              <button
                type="button"
                onClick={() => choose('output')}
                disabled={isRunning || isPicking !== null}
                title="ជ្រើសរើស Folder (Browse Folder)"
                className="px-3 py-2.5 rounded-sm bg-[#122238] hover:bg-[#1a3354] active:scale-95 text-cyan-300 hover:text-white border border-cyan-500/40 text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-sm"
              >
                {isPicking === 'output' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>Browse</span>
              </button>
            </div>

            <p className="text-[10px] font-khmer text-slate-500">
              ឯកសារនឹងរក្សាទុកជា <span className="font-mono">EP001_KH.mp4</span> តាមឈ្មោះដើម។{' '}
              {audioMode === 'mute_vocal'
                ? 'លុបតែសំឡេងនិយាយដើម (រក្សាទុកភ្លេង BGM និង Sound Effects ឱ្យនៅដដែល)។'
                : 'សំឡេងដើមនឹងត្រូវបានបិទ (Mute) ទាំងស្រុង។'}
            </p>
          </div>

          {/* Transcribe & Dubbing Configuration */}
          <div className="bg-[#0e1624] border border-[#1e2f47] p-3 rounded-sm flex flex-col gap-3">
            {/* Row 1: Gemini Model & Khmer Voice */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Gemini Model */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono font-bold text-slate-200">
                  GEMINI MODEL:
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={isRunning}
                  className="w-full bg-[#09101b] border border-[#1b2b45] text-cyan-200 focus:border-cyan-400 rounded-sm px-2.5 py-2 text-xs font-mono focus:outline-none disabled:opacity-50 cursor-pointer"
                >
                  {!DEFAULT_GEMINI_MODELS.some((m) => m.id === selectedModel) && (
                    <option value={selectedModel}>{selectedModel}</option>
                  )}
                  {GEMINI_GROUPS.map((grp) => {
                    const groupModels = DEFAULT_GEMINI_MODELS.filter((m) => getModelGroup(m) === grp.key);
                    if (groupModels.length === 0) return null;
                    return (
                      <optgroup
                        key={grp.key}
                        label={grp.label}
                        className="bg-[#0b1320] text-cyan-300 font-bold font-mono"
                      >
                        {groupModels.map((m) => (
                          <option
                            key={m.id}
                            value={m.id}
                            className="bg-[#09101b] text-slate-100 font-normal py-1"
                          >
                            {m.displayName}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              {/* Khmer Voice */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono font-bold text-slate-200">
                  KHMER VOICE:
                </label>
                <select
                  value={voice}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  disabled={isRunning}
                  className="w-full bg-[#09101b] border border-[#1b2b45] text-cyan-200 focus:border-cyan-400 rounded-sm px-2.5 py-2 text-xs font-mono focus:outline-none disabled:opacity-50 cursor-pointer"
                >
                  <option value="auto">Auto Detect</option>
                  <option value="km-KH-PisethNeural">Piseth (Male)</option>
                  <option value="km-KH-SreymomNeural">Sreymom (Female)</option>
                </select>
              </div>
            </div>

            {/* Row 2: Audio Mode & Export Subtitles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#18273d]">
              {/* Audio Mode */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono font-bold text-slate-200">
                  AUDIO MODE:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleAudioModeChange('mute_original')}
                    className={`py-2 px-2 rounded-sm border text-[11px] font-mono font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      audioMode === 'mute_original'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                        : 'bg-[#09101b] border-[#1c2a40] text-slate-400 hover:text-slate-300'
                    } disabled:opacity-50`}
                    title="Mute Original"
                  >
                    <span>🔇 Mute Original</span>
                  </button>
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleAudioModeChange('mute_vocal')}
                    className={`py-2 px-2 rounded-sm border text-[11px] font-mono font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      audioMode === 'mute_vocal' || audioMode === 'duck_original'
                        ? 'bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-200'
                        : 'bg-[#09101b] border-[#1c2a40] text-slate-400 hover:text-slate-300'
                    } disabled:opacity-50`}
                    title="Mute Vocal Only (AI Vocal Isolation)"
                  >
                    <span>🎤 Mute Vocal Only</span>
                  </button>
                </div>
              </div>

              {/* Export Subtitle Mode */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono font-bold text-slate-200">
                  EXPORT SUBTITLES:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleBurnSubtitlesChange(true)}
                    className={`py-2 px-2 rounded-sm border text-[11px] font-mono font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      burnSubtitles
                        ? 'bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-300'
                        : 'bg-[#09101b] border-[#1c2a40] text-slate-400 hover:text-slate-300'
                    } disabled:opacity-50`}
                    title="Burn Subtitle"
                  >
                    <span>🎨 Burn Subtitle</span>
                  </button>
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleBurnSubtitlesChange(false)}
                    className={`py-2 px-2 rounded-sm border text-[11px] font-mono font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      !burnSubtitles
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                        : 'bg-[#09101b] border-[#1c2a40] text-slate-400 hover:text-slate-300'
                    } disabled:opacity-50`}
                    title="Clean Video"
                  >
                    <span>⚡ Clean Video</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

            {/* Quick Console Jump Banner */}
            <div className="bg-[#09121e] border border-cyan-500/30 rounded-sm px-3 py-2 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 truncate">
                <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="text-cyan-300 font-bold">Console Log:</span>
                <span className="text-slate-400 truncate text-[11px]">
                  {logs.length > 0 ? logs[logs.length - 1].text : 'Ready'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('console')}
                className="px-2.5 py-1 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ml-2"
              >
                <span>មើល Console ➔</span>
              </button>
            </div>

            {/* Finished videos */}
            {results.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[11px] font-mono text-slate-400">
                  ជោគជ័យ <span className="text-emerald-400 font-bold">{succeeded}</span>
                  {failed > 0 && (
                    <>
                      {' '}
                      | បរាជ័យ <span className="text-rose-400 font-bold">{failed}</span>
                    </>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto border border-[#182338] rounded-sm">
                  {results.map((result, idx) => (
                    <div
                      key={`${result.video.path}-${idx}`}
                      className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono border-b border-[#141f33] last:border-b-0"
                    >
                      {result.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )}
                      <span className="text-slate-300 truncate flex-1">{result.video.name}</span>
                      <span className={result.ok ? 'text-emerald-400/80' : 'text-rose-300/90'}>
                        {result.ok
                          ? result.lines !== undefined
                            ? `${result.lines} បន្ទាត់`
                            : 'បានធ្វើរួចហើយ'
                          : result.reason}
                      </span>
                    </div>
                  ))}
                </div>
                {outputFolder && (
                  <button
                    type="button"
                    onClick={() => openInFileExplorer(outputFolder)}
                    className="w-full mt-1.5 py-2 px-3 rounded-sm bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-500/50 text-cyan-300 hover:text-white text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <FolderOpen className="w-4 h-4 text-cyan-400" />
                    <span>📂 បើកមើល Folder ដែលបាន Export ក្នុង Windows File Explorer</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Dedicated Full-Height Console View */}
        {activeTab === 'console' && (
          <div className="p-4 flex flex-col gap-2.5 flex-1 min-h-0 bg-[#060b13] overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#09121e] border border-[#17253b] rounded-sm shrink-0">
              {/* Filter pills */}
              <div className="flex items-center gap-1.5 text-[11px] font-mono">
                <span className="text-slate-400 text-[10px] mr-1">Filter:</span>
                <button
                  type="button"
                  onClick={() => setLogFilter('all')}
                  className={`px-2 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                    logFilter === 'all'
                      ? 'bg-cyan-500 text-black font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  All ({logs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLogFilter('stage')}
                  className={`px-2 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                    logFilter === 'stage'
                      ? 'bg-cyan-400 text-black font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Stages ({logs.filter((l) => l.type === 'stage').length})
                </button>
                <button
                  type="button"
                  onClick={() => setLogFilter('success')}
                  className={`px-2 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                    logFilter === 'success'
                      ? 'bg-emerald-400 text-black font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Success ({logs.filter((l) => l.type === 'success').length})
                </button>
                <button
                  type="button"
                  onClick={() => setLogFilter('warn-error')}
                  className={`px-2 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                    logFilter === 'warn-error'
                      ? 'bg-rose-500 text-white font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Warn/Err ({logs.filter((l) => l.type === 'warn' || l.type === 'error').length})
                </button>
              </div>

              {/* Console Actions */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] font-mono text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  <span>Auto Scroll</span>
                </label>
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  title="ចម្លង Log ទាំងអស់ (Copy all logs)"
                  className="px-2 py-1 text-[11px] font-mono text-slate-300 hover:text-white rounded bg-[#132338] hover:bg-[#1a304d] border border-cyan-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copiedLogs ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-300">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-cyan-400" />
                      <span>Copy Logs</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => globalConsoleLogger.clear()}
                  title="សម្អាត Console (Clear)"
                  className="px-2 py-1 text-[11px] font-mono text-slate-400 hover:text-rose-300 rounded bg-[#132338] hover:bg-rose-950/40 border border-slate-700 hover:border-rose-600/40 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {/* Terminal Log Area */}
            <div
              ref={consoleContainerRef}
              className="flex-1 min-h-[380px] max-h-[58vh] overflow-y-auto p-3 font-mono text-[11px] leading-5 select-text bg-[#03070f] border border-cyan-500/30 rounded-sm space-y-1 scrollbar-thin scrollbar-thumb-[#16253b] scrollbar-track-transparent shadow-inner"
            >
              {logs.length === 0 ? (
                <div className="text-slate-500 space-y-1 select-none">
                  <div>[SYSTEM] JAI DUBBER Processing Console v1.0.5 initialized.</div>
                  <div>
                    [CONFIG] Engine:{' '}
                    {selectedEngine === 'fast-whisper'
                      ? 'Fast-Whisper (Large-v3-Turbo) + Gemini Story Analysis'
                      : 'Gemini SRT Audio Direct'}
                  </div>
                  <div>[CONFIG] Model: {selectedModel}</div>
                  <div>
                    [CONFIG] Mode:{' '}
                    {burnSubtitles
                      ? 'Burn Subtitles (បិទភ្ជាប់ Subtitle ជាមួយទម្រង់អក្សរ និងប្រអប់)'
                      : 'Lossless Stream Copy (គុណភាពដើម 100%, វីដេអូសុទ្ធ Clean Video)'}
                  </div>
                  <div className="text-cyan-500/80">
                    [READY] ជ្រើសរើស Folder រួចចុច &quot;Start&quot; ដើម្បីចាប់ផ្ដើមដំណើការ Auto Dubbing...
                  </div>
                </div>
              ) : (
                logs
                  .filter((log) => {
                    if (logFilter === 'all') return true;
                    if (logFilter === 'stage') return log.type === 'stage';
                    if (logFilter === 'success') return log.type === 'success';
                    if (logFilter === 'warn-error') return log.type === 'warn' || log.type === 'error';
                    return true;
                  })
                  .map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-2 hover:bg-white/[0.03] px-1.5 py-0.5 rounded transition-colors"
                    >
                      <span className="text-slate-500 shrink-0 select-none text-[10px]">
                        [{log.time}]
                      </span>
                      <span
                        className={`break-words flex-1 ${
                          log.type === 'success'
                            ? 'text-emerald-300 font-semibold'
                            : log.type === 'error'
                            ? 'text-rose-400 font-semibold'
                            : log.type === 'warn'
                            ? 'text-amber-300 font-semibold'
                            : log.type === 'stage'
                            ? 'text-cyan-200'
                            : 'text-slate-300'
                        }`}
                      >
                        {log.text}
                      </span>
                    </div>
                  ))
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#1c2a42] bg-[#101827] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <p className="text-[10px] font-khmer text-slate-400">
              ដំណើរការម្តងមួយវីដេអូ៖ បើកវីដេអូ → ស្រង់អត្ថបទ → បង្កើតសំឡេង → Export។
            </p>
            {activeTab === 'config' && (
              <button
                type="button"
                onClick={() => setActiveTab('console')}
                className="px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-[10px] font-mono flex items-center gap-1 transition-all cursor-pointer"
              >
                <Terminal className="w-3 h-3 text-cyan-400" />
                <span>Console Log ({logs.length})</span>
              </button>
            )}
          </div>
          {isRunning ? (
            <button
              onClick={() => {
                cancelRef.current = true;
              }}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-sm text-xs transition-all cursor-pointer active:scale-95"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={!sourceFolder || !outputFolder || videos.length === 0}
              className="flex items-center gap-1.5 bg-gradient-to-r from-fuchsia-500 to-cyan-500 hover:from-fuchsia-400 hover:to-cyan-400 text-black font-bold px-5 py-2 rounded-sm text-xs shadow-[0_0_14px_rgba(217,70,239,0.4)] transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              Start
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
