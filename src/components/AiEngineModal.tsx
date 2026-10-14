import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Cpu,
  Terminal,
  Zap,
  Sparkles,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Check,
} from 'lucide-react';

interface AiComponentStatus {
  installed: boolean;
  version?: string;
  detail?: string;
  error?: string;
}

interface AiEngineStatusData {
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

interface InstallProgressData {
  isInstalling: boolean;
  step: string;
  progressPercent: number;
  logs: string[];
  success?: boolean;
  error?: string;
}

interface AiEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiEngineModal: React.FC<AiEngineModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<AiEngineStatusData | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [progress, setProgress] = useState<InstallProgressData | null>(null);
  const [showLogs, setShowLogs] = useState<boolean>(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(async (force = false) => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch(`/api/ai-engine/status?refresh=${force}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.status) {
          setStatus(data.status);
          if (data.progress) {
            setProgress(data.progress);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load AI Engine status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  const handleStartInstall = async () => {
    try {
      setShowLogs(true);
      const res = await fetch('/api/ai-engine/install', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Failed to start installation');
      } else {
        const progRes = await fetch('/api/ai-engine/progress');
        const progData = await progRes.json();
        if (progData.ok && progData.progress) {
          setProgress(progData.progress);
        }
      }
    } catch (err: any) {
      alert('Error starting installation: ' + (err.message || err));
    }
  };

  const handleCancelInstall = async () => {
    try {
      await fetch('/api/ai-engine/cancel', { method: 'POST' });
    } catch {}
  };

  // Poll progress while installing
  useEffect(() => {
    let timer: any = null;
    if (progress?.isInstalling) {
      timer = setInterval(async () => {
        try {
          const res = await fetch('/api/ai-engine/progress');
          const data = await res.json();
          if (data.ok && data.progress) {
            setProgress(data.progress);
            if (logContainerRef.current) {
              logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
            }
            if (!data.progress.isInstalling) {
              fetchStatus(true);
            }
          }
        } catch {}
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [progress?.isInstalling, fetchStatus]);

  // Load status on open
  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen, fetchStatus]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-[#0c1424] border border-[#1e2f4a] rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#101a2e] border-b border-[#1c2a42]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-cyan-950/80 border border-cyan-500/50 text-cyan-400 shadow-sm">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  AI ENGINE & ACCELERATION MANAGER
                </h2>
                {status?.isFullyReady && (
                  <span className="text-[10px] bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded font-mono font-semibold">
                    READY 100%
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-khmer mt-0.5">
                គ្រប់គ្រង និងដំឡើងម៉ាស៊ីន AI ក្នុងកុំព្យូទ័រ (Demucs BGM/Vocal Separation & Fast-Whisper)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchStatus(true)}
              disabled={isLoadingStatus || progress?.isInstalling}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-200 disabled:opacity-40 cursor-pointer flex items-center gap-1.5 px-3 py-1.5 bg-[#152133] hover:bg-[#1c2d46] border border-[#223552] rounded transition-all"
              title="ពិនិត្យមើលស្ថានភាពម៉ាស៊ីន AI ឡើងវិញ"
            >
              {isLoadingStatus ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span>Refresh</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          {/* Status Grid Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Python Environment */}
            <div className="bg-[#090f1a] border border-[#1e2f4a] p-3 rounded flex flex-col gap-1.5 shadow-sm">
              <div className="text-xs text-slate-400 flex items-center justify-between font-mono">
                <span className="flex items-center gap-1.5 font-bold">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  Python
                </span>
                {status?.python?.installed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <div className="text-xs font-bold text-white font-mono truncate" title={status?.python?.path || ''}>
                {status?.python?.installed ? `Python ${status.python.version || '3.11'}` : 'Missing (ត្រូវការ 3.10+)'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono truncate" title={status?.python?.path || ''}>
                {status?.python?.installed ? (status.python.path ? pathBasename(status.python.path) : 'Found in System') : 'Not Found in System'}
              </div>
            </div>

            {/* 2. PyTorch & GPU */}
            <div className="bg-[#090f1a] border border-[#1e2f4a] p-3 rounded flex flex-col gap-1.5 shadow-sm">
              <div className="text-xs text-slate-400 flex items-center justify-between font-mono">
                <span className="flex items-center gap-1.5 font-bold">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  GPU / PyTorch
                </span>
                {status?.torch?.installed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <div className="text-xs font-bold text-emerald-300 font-mono truncate" title={status?.torch?.device || ''}>
                {status?.torch?.installed
                  ? status.torch.cuda
                    ? 'NVIDIA CUDA (GPU)'
                    : 'CPU Mode'
                  : 'Missing (មិនទាន់ដំឡើង)'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono truncate" title={status?.gpu?.name || ''}>
                {status?.gpu?.hasNvidiaGpu ? status.gpu.name : 'Standard CPU Acceleration'}
              </div>
            </div>

            {/* 3. Demucs AI */}
            <div className="bg-[#090f1a] border border-[#1e2f4a] p-3 rounded flex flex-col gap-1.5 shadow-sm">
              <div className="text-xs text-slate-400 flex items-center justify-between font-mono">
                <span className="flex items-center gap-1.5 font-bold">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  Demucs AI
                </span>
                {status?.demucs?.installed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <div className="text-xs font-bold text-purple-300 font-mono truncate">
                {status?.demucs?.installed ? `Demucs (${status.demucs.version || 'v4.0'})` : 'Missing (មិនទាន់ដំឡើង)'}
              </div>
              <div className="text-[10px] text-slate-500 font-khmer truncate">
                {status?.demucs?.installed ? 'លុបសំឡេងចិន & ស្រង់ BGM' : 'ពុំទាន់ដំឡើង'}
              </div>
            </div>

            {/* 4. Faster-Whisper */}
            <div className="bg-[#090f1a] border border-[#1e2f4a] p-3 rounded flex flex-col gap-1.5 shadow-sm">
              <div className="text-xs text-slate-400 flex items-center justify-between font-mono">
                <span className="flex items-center gap-1.5 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  Fast-Whisper
                </span>
                {status?.whisper?.installed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <div className="text-xs font-bold text-cyan-300 font-mono truncate">
                {status?.whisper?.installed ? `Whisper (${status.whisper.version || 'v1.2'})` : 'Missing (មិនទាន់ដំឡើង)'}
              </div>
              <div className="text-[10px] text-slate-500 font-khmer truncate">
                {status?.whisper?.installed ? 'ស្រង់សំឡេងនិយាយ & Time' : 'ពុំទាន់ដំឡើង'}
              </div>
            </div>
          </div>

          {/* Action Card: Status or 1-Click Install Button */}
          {status?.isFullyReady && !progress?.isInstalling ? (
            <div className="bg-emerald-950/20 border border-emerald-500/40 p-4 rounded flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-bold text-emerald-300 font-khmer">
                    ម៉ាស៊ីន AI Engine ទាំងអស់បានដំឡើងរួចរាល់ ១០០% (Fully Ready)
                  </div>
                  <div className="text-xs text-slate-300 font-khmer mt-0.5">
                    {status.torch.cuda
                      ? `ដំណើរការដោយកាតក្រាហ្វិក ${status.torch.device || 'NVIDIA CUDA'} (Super Fast Acceleration)`
                      : 'ដំណើរការដោយស៊ីភីយូ (CPU Mode)'} — រួចរាល់សម្រាប់មុខងារ Auto Dubbing និង Demucs BGM/Vocal Isolation។
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartInstall}
                className="px-3.5 py-1.5 bg-[#152133] hover:bg-[#1e314d] border border-emerald-500/50 text-emerald-300 rounded text-xs font-khmer font-bold transition-all cursor-pointer shrink-0 active:scale-95"
              >
                🔄 ដំឡើងសារឡើងវិញ / Update
              </button>
            </div>
          ) : !progress?.isInstalling ? (
            <div className="bg-amber-950/20 border border-amber-500/40 p-4 rounded flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-500/20 text-amber-400 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-bold text-amber-300 font-khmer">
                    កុំព្យូទ័រនេះមិនទាន់មាន AI Engine គ្រប់គ្រាន់នៅឡើយទេ
                  </div>
                  <div className="text-xs text-slate-300 font-khmer mt-0.5">
                    ដើម្បីប្រើប្រាស់ Fast-Whisper និង Demucs លុបសំឡេងចិនដើម សូមចុចប៊ូតុងខាងស្ដាំដើម្បីដំឡើងដោយស្វ័យប្រវត្តិ (1-Click Auto Install)។
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartInstall}
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-extrabold text-xs rounded shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shrink-0"
              >
                <Download className="w-4 h-4" />
                <span className="font-khmer font-bold">ដំឡើង AI Engine ដោយស្វ័យប្រវត្តិ (1-Click)</span>
              </button>
            </div>
          ) : null}

          {/* Installation Progress & Live Terminal Output */}
          {(progress?.isInstalling || (progress?.logs && progress.logs.length > 0)) && (
            <div className="bg-[#070d18] border border-[#1a2942] p-3.5 rounded flex flex-col gap-2.5 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {progress.isInstalling ? (
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  ) : progress.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  )}
                  <span className="text-xs font-bold text-white font-khmer">
                    {progress.isInstalling
                      ? 'កំពុងដំណើរការដំឡើង AI Engine ដោយស្វ័យប្រវត្តិ (Auto Installing...)...'
                      : progress.success
                      ? '✅ ការដំឡើង AI Engine ត្រូវបានបញ្ចប់ដោយជោគជ័យ ១០០%!'
                      : '❌ ការដំឡើងបានជួបប្រទះបញ្ហា'}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
                    {progress.progressPercent}%
                  </span>
                  {progress.isInstalling && (
                    <button
                      type="button"
                      onClick={handleCancelInstall}
                      className="text-xs font-mono text-red-400 hover:text-red-300 px-2.5 py-1 bg-red-950/40 border border-red-800/50 rounded cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowLogs(!showLogs)}
                    className="text-xs font-mono text-slate-400 hover:text-slate-200 px-2.5 py-1 bg-[#141f33] border border-[#223552] rounded cursor-pointer transition-all"
                  >
                    {showLogs ? 'Hide Logs' : 'Show Logs'}
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-[#121c2d] h-2 rounded-full overflow-hidden border border-[#1e2f4a]">
                <div
                  className={`h-full transition-all duration-300 ${
                    progress.success
                      ? 'bg-emerald-400'
                      : progress.error
                      ? 'bg-red-400'
                      : 'bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400'
                  }`}
                  style={{ width: `${Math.max(5, progress.progressPercent)}%` }}
                />
              </div>

              {/* Terminal Logs Window */}
              {showLogs && (
                <div
                  ref={logContainerRef}
                  className="bg-[#04070e] border border-[#142033] p-3 rounded text-[11px] font-mono text-slate-300 max-h-56 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 select-text"
                >
                  {progress.logs.map((log, index) => (
                    <div
                      key={index}
                      className={`leading-tight ${
                        log.includes('ជោគជ័យ') || log.includes('✅')
                          ? 'text-emerald-300 font-bold'
                          : log.includes('❌') || log.includes('កំហុស') || log.includes('error')
                          ? 'text-red-300'
                          : log.includes('🚀') || log.includes('⚡')
                          ? 'text-cyan-300'
                          : log.includes('⚠️')
                          ? 'text-amber-300'
                          : 'text-slate-400'
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-[#101a2e] border-t border-[#1c2a42] px-5 py-3 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

function pathBasename(fullPath: string): string {
  const parts = fullPath.split(/[/\\]/);
  return parts[parts.length - 1] || fullPath;
}
