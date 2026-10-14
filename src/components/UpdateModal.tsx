import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  ArrowUpCircle,
  ExternalLink,
  Calendar,
  ShieldCheck,
  Loader2,
  Download,
  AlertCircle,
  Check,
} from 'lucide-react';
import { openExternalUrl } from '../utils/desktopUtils';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion?: string;
}

interface ChangelogItem {
  version: string;
  date: string;
  isCurrent?: boolean;
  highlights: {
    icon: string;
    title: string;
    desc: string;
  }[];
}

const CHANGELOG_DATA: ChangelogItem[] = [
  {
    version: 'v1.0.5',
    date: '14 តុលា 2026',
    isCurrent: true,
    highlights: [
      {
        icon: '⚡',
        title: 'Microsoft Edge TTS 7.3.1 Engine',
        desc: 'ដោះស្រាយបញ្ហា Error 403 Forbidden និងសំឡេង Robot ដោយជោគជ័យ ១០០%។ បង្កើតសំឡេងខ្មែរ Neural (Piseth & Sreymom) បានយ៉ាងរលូន លឿន និងពិរោះធម្មជាតិ។',
      },
      {
        icon: '📊',
        title: 'Per-Episode Progress Percentage (0% - 100%)',
        desc: 'ប្ដូរស្លាក "processing" ទៅជាភាគរយជាក់ស្ដែង 0% ដល់ 100% ក្នុងមួយភាគ ដោយ Reset មក 0% រាល់ពេលចូលភាគថ្មី។',
      },
      {
        icon: '🎛️',
        title: 'AI Vocal Remover Dual Mode',
        desc: 'បន្ថែមប៊ូតុង ២ ជម្រើសសម្រាប់ AI Vocal Remover ឱ្យដំណើរការភ្លាមៗពេលចុចជ្រើសរើស ដូចទៅនឹងផ្ទាំង Auto Dubbing។',
      },
      {
        icon: '📂',
        title: 'Export Folder Quick Open',
        desc: 'ប្ដូរ Button ទៅជា "OPEN" ក្រោយ Export ចប់ ដើម្បីបើក Folder វីដេអូបានភ្លាមៗក្នុង Windows Explorer។',
      },
      {
        icon: '🔄',
        title: 'GitHub Auto-Update System & UI Refactor',
        desc: 'ភ្ជាប់ប្រព័ន្ធ GitHub Releases Auto-Update (SavoeunVanda/JAI-DUBBER-APP), ប្ដូរ AI Engine ទៅជា LICENSE, និងផ្លាស់ប្ដូរ AI Engine ចូលក្នុង Settings។',
      },
    ],
  },
  {
    version: 'v1.0.4',
    date: '02 តុលា 2026',
    highlights: [
      {
        icon: '🎙️',
        title: 'Acoustic Pitch Detection (F0)',
        desc: 'ស្ដាប់រលកសំឡេងដើមដើម្បីកំណត់សំឡេងប្រុស/ស្រីដោយស្វ័យប្រវត្តិតាម F0 Vocal Cords Frequency។',
      },
      {
        icon: '🤖',
        title: 'Fast Whisper & Gemini 3.5 Engine Integration',
        desc: 'គាំទ្រការស្រង់សំឡេង និងបកប្រែវីដេអូកម្រិតខ្ពស់ជាមួយ Gemini និង Whisper Large-v3-Turbo។',
      },
      {
        icon: '⚡',
        title: 'Lossless Stream Copy Export',
        desc: 'រក្សាគុណភាពវីដេអូដើម ១០០% ដោយមិនបាច់ Re-render ឡើងវិញ សន្សំសំចៃពេលខ្លាំង។',
      },
    ],
  },
  {
    version: 'v1.0.0',
    date: '30 កញ្ញា 2026',
    highlights: [
      {
        icon: '🎬',
        title: 'Auto Dubbing Core Launch',
        desc: 'មុខងារ Dubbing វីដេអូចិន/អង់គ្លេសមកខ្មែរដោយស្វ័យប្រវត្តិកម្រិត Studio ជាមួយពុម្ពអក្សរខ្មែរ Hanuman & Battambang។',
      },
      {
        icon: '🔒',
        title: 'Device-Locked License System',
        desc: 'ប្រព័ន្ធគ្រប់គ្រងអាជ្ញាប័ណ្ណប្រើប្រាស់ប្រកបដោយសុវត្ថិភាពខ្ពស់។',
      },
    ],
  },
];

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  currentVersion = '1.0.5',
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    checked: boolean;
    hasUpdate: boolean;
    latestVersion?: string;
    releaseName?: string;
    releaseNotes?: string;
    downloadUrl?: string;
    htmlUrl?: string;
    message?: string;
    error?: string;
  }>({
    checked: false,
    hasUpdate: false,
  });

  // Listen to native Electron updater events
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.onUpdaterStatus) {
      const unsub = electronAPI.onUpdaterStatus((data: any) => {
        if (!data) return;
        if (data.status === 'checking') {
          setIsChecking(true);
        } else if (data.status === 'available') {
          setIsChecking(false);
          setUpdateInfo((prev) => ({
            ...prev,
            checked: true,
            hasUpdate: true,
            latestVersion: data.version,
            releaseNotes: data.releaseNotes,
          }));
        } else if (data.status === 'not-available') {
          setIsChecking(false);
          setUpdateInfo((prev) => ({
            ...prev,
            checked: true,
            hasUpdate: false,
            message: `លោកអ្នកកំពុងប្រើប្រាស់កំណែចុងក្រោយបំផុត (v${currentVersion}) គ្មានការ Update ថ្មីនៅឡើយទេ!`,
          }));
        } else if (data.status === 'downloading') {
          setDownloadProgress(data.percent || 0);
        } else if (data.status === 'downloaded') {
          setDownloadProgress(100);
          setIsDownloaded(true);
        } else if (data.status === 'error') {
          setIsChecking(false);
          console.warn('[Updater] Status error:', data.error);
        }
      });
      return unsub;
    }
  }, [currentVersion]);

  // Check update function via /api/updater/check
  const handleCheckUpdate = async () => {
    setIsChecking(true);
    setUpdateInfo({ checked: false, hasUpdate: false });
    setDownloadProgress(null);
    setIsDownloaded(false);

    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.checkForUpdates) {
        electronAPI.checkForUpdates().catch(() => {});
      }

      const res = await fetch('/api/updater/check');
      const data = await res.json();

      if (data && data.ok) {
        setUpdateInfo({
          checked: true,
          hasUpdate: !!data.hasUpdate,
          latestVersion: data.latestVersion ? `v${data.latestVersion}` : `v${currentVersion}`,
          releaseName: data.releaseName,
          releaseNotes: data.releaseNotes,
          downloadUrl: data.downloadUrl,
          htmlUrl: data.htmlUrl,
          message: data.message,
        });
      } else {
        setUpdateInfo({
          checked: true,
          hasUpdate: false,
          message: `លោកអ្នកកំពុងប្រើប្រាស់កំណែចុងក្រោយបំផុត (v${currentVersion})!`,
        });
      }
    } catch (err: any) {
      setUpdateInfo({
        checked: true,
        hasUpdate: false,
        message: `លោកអ្នកកំពុងប្រើប្រាស់កំណែចុងក្រោយបំផុត (v${currentVersion})!`,
        error: err.message,
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleStartDownload = () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.downloadUpdate) {
      setDownloadProgress(0);
      electronAPI.downloadUpdate().catch((e: any) => {
        console.warn('downloadUpdate error:', e);
        if (updateInfo.downloadUrl) {
          openExternalUrl(updateInfo.downloadUrl);
        }
      });
    } else if (updateInfo.downloadUrl) {
      openExternalUrl(updateInfo.downloadUrl);
    }
  };

  const handleInstallAndRestart = () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.quitAndInstall) {
      electronAPI.quitAndInstall();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl bg-[#0b121e] border border-cyan-500/40 rounded-sm overflow-hidden shadow-2xl flex flex-col font-mono text-xs max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#0f1b2b] border-b border-cyan-500/30 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-black font-bold shadow-md">
              <Sparkles className="w-4 h-4 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm tracking-wider">JAI DUBBER UPDATER</h3>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-mono font-bold">
                  v{currentVersion}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                GitHub Releases Auto-Update (SavoeunVanda/JAI-DUBBER-APP)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-cyan-900 scrollbar-track-transparent">
          {/* Status Banner */}
          <div
            className={`p-3.5 rounded border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-inner transition-all ${
              updateInfo.hasUpdate
                ? 'bg-gradient-to-r from-amber-950/40 to-[#19140a] border-amber-500/60'
                : 'bg-gradient-to-r from-[#0d1e33] to-[#0d1624] border-cyan-500/30'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${
                  updateInfo.hasUpdate
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                }`}
              >
                {updateInfo.hasUpdate ? (
                  <ArrowUpCircle className="w-5 h-5 text-amber-400 animate-bounce" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">
                    {updateInfo.hasUpdate ? updateInfo.latestVersion : `Version v${currentVersion}`}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.2 rounded font-bold border ${
                      updateInfo.hasUpdate
                        ? 'bg-amber-950 text-amber-300 border-amber-500/50'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {updateInfo.hasUpdate ? 'New Release Available' : 'Latest Installed'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 font-khmer mt-0.5">
                  {updateInfo.hasUpdate
                    ? `រកឃើញកំណែថ្មី ${updateInfo.latestVersion}! សូមចុច Download & Install ដើម្បីធ្វើបច្ចុប្បន្នភាព។`
                    : updateInfo.message ||
                      'កម្មវិធីរបស់អ្នកមានមុខងារ AI និងការ Update ថ្មីៗបំផុតរួចរាល់ហើយ។'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              {updateInfo.hasUpdate ? (
                isDownloaded ? (
                  <button
                    type="button"
                    onClick={handleInstallAndRestart}
                    className="w-full sm:w-auto px-4 py-2 rounded bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95 animate-pulse"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Restart & Install Now</span>
                  </button>
                ) : downloadProgress !== null ? (
                  <div className="w-full sm:w-44 flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] text-cyan-300">
                      <span>Downloading...</span>
                      <span>{downloadProgress}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-cyan-500/30">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                        style={{ width: `${Math.max(3, downloadProgress)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartDownload}
                    className="w-full sm:w-auto px-4 py-2 rounded bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5 text-black" />
                    <span>Download & Install</span>
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={isChecking}
                  className="w-full sm:w-auto px-3.5 py-2 rounded bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isChecking ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>កំពុងពិនិត្យ...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Check Update</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* GitHub Release Notes if available */}
          {updateInfo.hasUpdate && updateInfo.releaseNotes && (
            <div className="p-3 rounded bg-amber-950/20 border border-amber-500/40 text-xs">
              <div className="font-bold text-amber-300 font-mono mb-1">
                📝 RELEASE NOTES ({updateInfo.latestVersion}):
              </div>
              <div className="text-slate-300 whitespace-pre-wrap font-khmer text-[11px] leading-relaxed bg-black/40 p-2.5 rounded border border-white/5 max-h-36 overflow-y-auto">
                {updateInfo.releaseNotes}
              </div>
            </div>
          )}

          {/* Section: What's New / Changelog History */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono text-cyan-300 font-bold border-b border-[#1c2a42] pb-1.5">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>កំណត់ត្រានៃការ UPDATE ថ្មីៗ (RELEASE NOTES & CHANGELOG)</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  openExternalUrl('https://github.com/SavoeunVanda/JAI-DUBBER-APP/releases')
                }
                className="text-[10px] text-cyan-400 hover:text-cyan-200 font-normal flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>GitHub Releases</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
            </div>

            <div className="space-y-4 pt-1">
              {CHANGELOG_DATA.map((item) => (
                <div
                  key={item.version}
                  className={`rounded border p-3.5 flex flex-col gap-2.5 transition-all ${
                    item.isCurrent
                      ? 'bg-[#0f1d2e]/80 border-cyan-500/50 shadow-md ring-1 ring-cyan-500/20'
                      : 'bg-[#090f18] border-[#18263a] opacity-80 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-cyan-300 font-mono">
                        {item.version}
                      </span>
                      {item.isCurrent && (
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/50 font-bold">
                          Current Version
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-khmer flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {item.date}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 pt-1">
                    {item.highlights.map((h, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 p-2 rounded bg-black/30 border border-white/5 hover:border-cyan-500/20 transition-colors"
                      >
                        <span className="text-base shrink-0 leading-tight select-none">
                          {h.icon}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-bold text-slate-200">{h.title}</span>
                          <span className="text-[11px] font-khmer text-slate-400 leading-relaxed">
                            {h.desc}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#0f1b2b] border-t border-[#1c2a42] p-3 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>GitHub Auto-Updater: SavoeunVanda/JAI-DUBBER-APP</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-bold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
