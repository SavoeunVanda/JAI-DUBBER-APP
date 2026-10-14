import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, Copy, Check, AlertCircle, Loader2, Lock, Sparkles, RefreshCw, LogOut, ExternalLink, Clock } from 'lucide-react';
import { AppLogo } from './Header';
import { openExternalUrl } from '../utils/desktopUtils';

export interface LicenseStatus {
  isActivated: boolean;
  licenseKey?: string;
  customerName?: string;
  customerContact?: string;
  planType?: string;
  activatedAt?: string;
  expiresAt?: string | null;
  machineId: string;
  daysRemaining?: number | null;
  message?: string;
}

interface LicenseModalProps {
  isOpen: boolean;
  onClose?: () => void;
  status: LicenseStatus | null;
  onActivated: (status: LicenseStatus) => void;
  onDeactivated?: () => void;
  canClose?: boolean;
}

export const LicenseModal: React.FC<LicenseModalProps> = ({
  isOpen,
  onClose,
  status,
  onActivated,
  onDeactivated,
  canClose = false,
}) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [machineId, setMachineId] = useState(status?.machineId || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedHwid, setCopiedHwid] = useState(false);

  useEffect(() => {
    if (status?.machineId) {
      setMachineId(status.machineId);
    } else if (isOpen) {
      fetch('/api/license/machine-id')
        .then((r) => r.json())
        .then((d) => {
          if (d.machineId) setMachineId(d.machineId);
        })
        .catch(() => {});
    }
  }, [isOpen, status]);

  // Real-time countdown timer state
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  } | null>(null);

  useEffect(() => {
    if (!status?.expiresAt) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const target = new Date(status.expiresAt!).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [status?.expiresAt]);

  const formatCountdown = () => {
    if (!status?.expiresAt) {
      return '♾️ គ្មានថ្ងៃផុតកំណត់ (Lifetime)';
    }
    if (!timeLeft) {
      return 'កំពុងគណនា...';
    }
    if (timeLeft.isExpired) {
      return '⚠️ បានផុតកំណត់ហើយ (Expired)';
    }

    const { days, hours, minutes, seconds } = timeLeft;
    const pad = (n: number) => String(n).padStart(2, '0');

    if (days > 0) {
      return `${days} ថ្ងៃ ${pad(hours)} ម៉ោង ${pad(minutes)} នាទី ${pad(seconds)} វិនាទី`;
    }
    return `${pad(hours)} ម៉ោង ${pad(minutes)} នាទី ${pad(seconds)} វិនាទី`;
  };

  if (!isOpen) return null;

  const handleCopyHwid = () => {
    if (!machineId) return;
    navigator.clipboard.writeText(machineId);
    setCopiedHwid(true);
    setTimeout(() => setCopiedHwid(false), 2000);
  };

  const handleActivate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!licenseKey.trim()) {
      setErrorMsg('សូមបញ្ចូល License Key របស់អ្នក!');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: licenseKey.trim() }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setSuccessMsg(data.message || 'បាន Activate កម្មវិធីដោយជោគជ័យ!');
        setTimeout(() => {
          onActivated({
            isActivated: true,
            ...data.data,
          });
        }, 800);
      } else {
        setErrorMsg(data.message || 'License Key មិនត្រឹមត្រូវ ឬផុតកំណត់!');
      }
    } catch (err: any) {
      setErrorMsg(`កំហុសក្នុងការតភ្ជាប់: ${err.message || 'សូមពិនិត្យមើលអ៊ីនធឺណិត'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('តើអ្នកពិតជាចង់ដក License Key ចេញពីកុំព្យូទ័រនេះមែនទេ?')) return;
    setIsLoading(true);
    try {
      await fetch('/api/license/deactivate', { method: 'POST' });
      setLicenseKey('');
      setSuccessMsg('');
      if (onDeactivated) onDeactivated();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const isActivated = Boolean(status?.isActivated);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={() => {
        if (canClose && isActivated && onClose) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#0c1421] border border-cyan-500/40 rounded-xl shadow-2xl shadow-cyan-500/10 overflow-hidden flex flex-col"
      >
        {/* Top Header Glow Bar */}
        <div className="h-1 bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-emerald-400" />

        {/* Modal Header */}
        <div className="p-6 pb-4 flex items-center justify-between border-b border-[#18273d]">
          <div className="flex items-center gap-3">
            <AppLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white font-mono tracking-wider">
                  JAI DUBBER PRO
                </h2>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                  isActivated
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}>
                  {isActivated ? 'ACTIVATED' : 'LOCKED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-khmer mt-0.5">
                {isActivated ? 'ព័ត៌មានអាជ្ញាប័ណ្ណប្រើប្រាស់' : 'ប្រព័ន្ធសុវត្ថិភាពចាក់សោរអាជ្ញាប័ណ្ណ (License Activation)'}
              </p>
            </div>
          </div>

          {canClose && isActivated && onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800/60 transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-5">
          {/* Machine ID Box */}
          <div className="bg-[#080d16] border border-[#1b2b45] p-3.5 rounded-lg flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono text-cyan-300 font-bold uppercase flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                MACHINE HARDWARE ID (HWID):
              </label>
              <button
                type="button"
                onClick={handleCopyHwid}
                className="text-[10px] font-mono text-cyan-400 hover:text-cyan-200 flex items-center gap-1 cursor-pointer transition-colors"
              >
                {copiedHwid ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedHwid ? 'Copied!' : 'Copy ID'}</span>
              </button>
            </div>
            <div className="font-mono text-xs text-slate-300 bg-[#0e1726] px-3 py-2 rounded border border-[#233552] select-all break-all">
              {machineId || 'កំពុងទាញយក Machine ID...'}
            </div>
            <p className="text-[10px] text-slate-400 font-khmer">
              * លេខកូដសម្គាល់ម៉ាស៊ីននេះ ត្រូវបានចងភ្ជាប់ជាមួយ License Key របស់អ្នកដោយស្វ័យប្រវត្តិ។
            </p>
          </div>

          {/* Active License Details (When already activated) */}
          {isActivated && status ? (
            <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-lg flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">អតិថិជន (Owner):</span>
                <span className="font-bold text-white">{status.customerName || 'VIP User'}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">ប្រភេទគម្រោង (Plan):</span>
                <span className="font-bold text-cyan-300 uppercase">
                  {status.planType === 'lifetime'
                    ? '🌟 LIFETIME (ទិញដាច់)'
                    : status.planType === 'yearly' || status.planType === '1year'
                    ? '🥇 1 YEAR (១ ឆ្នាំ)'
                    : status.planType === 'trial' || status.planType === '1day'
                    ? '⚡ TRIAL (១ ថ្ងៃ)'
                    : status.planType === '1week'
                    ? '📅 1 WEEK (១ សប្តាហ៍)'
                    : status.planType === '3month'
                    ? '🥉 3 MONTHS (៣ ខែ)'
                    : status.planType === '6month'
                    ? '🥈 6 MONTHS (៦ ខែ)'
                    : '⏳ 1 MONTH (១ ខែ)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono py-0.5">
                <span className="text-slate-400">កាលបរិច្ឆេទផុតកំណត់:</span>
                <div className="text-right">
                  <div
                    className={`font-bold font-mono flex items-center justify-end gap-1.5 ${
                      timeLeft?.isExpired ? 'text-rose-400' : 'text-emerald-300'
                    }`}
                  >
                    {!timeLeft?.isExpired && status.expiresAt && (
                      <Clock className="w-3.5 h-3.5 animate-pulse text-emerald-400 shrink-0" />
                    )}
                    <span>{formatCountdown()}</span>
                  </div>
                  {status.expiresAt && (
                    <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                      (ផុតកំណត់នៅ៖ {new Date(status.expiresAt).toLocaleDateString('km-KH', { year: 'numeric', month: '2-digit', day: '2-digit' })})
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs font-mono border-t border-emerald-500/20 pt-2">
                <span className="text-slate-400">License Key:</span>
                <span className="font-mono font-bold text-slate-300">{status.licenseKey || '••••-••••-••••'}</span>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleDeactivate}
                  disabled={isLoading}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-950/40 border border-rose-500/30 hover:bg-rose-900/40 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>ដក License ចេញ (Deactivate)</span>
                </button>
              </div>
            </div>
          ) : (
            /* Input Form when NOT activated */
            <form onSubmit={handleActivate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-cyan-400" />
                  LICENSE KEY (កូដអាជ្ញាប័ណ្ណ):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                    placeholder="JAIDUB-XXXX-XXXX-XXXX-XXXX"
                    disabled={isLoading}
                    autoFocus
                    className="w-full bg-[#09101b] border border-cyan-500/40 focus:border-cyan-400 px-3.5 py-3 rounded-lg text-sm text-cyan-200 font-mono tracking-wider focus:outline-none uppercase placeholder:text-slate-600 disabled:opacity-50"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2 font-khmer">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2 font-khmer">
                  <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Glowing Activate Button */}
              <button
                type="submit"
                disabled={isLoading || !licenseKey.trim()}
                className="glowing-rainbow-btn w-full mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="glowing-rainbow-btn-inner py-3 text-sm font-bold tracking-wide">
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
                      <span>កំពុងផ្ទៀងផ្ទាត់ KEY...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <span>ACTIVATE LICENSE ឥឡូវនេះ</span>
                    </>
                  )}
                </div>
              </button>
            </form>
          )}

          {/* Contact Support & Buy Key Info */}
          <div className="border-t border-[#18273d] pt-3 text-center">
            <p className="text-[11px] text-slate-400 font-khmer">
              មិនទាន់មាន License Key មែនទេ? សូមទាក់ទងមកកាន់យើងខ្ញុំដើម្បីជាវ៖
            </p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => openExternalUrl('https://t.me/Vandazz_Official')}
                className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0088cc]/15 hover:bg-[#0088cc]/25 border border-[#0088cc]/40 hover:border-[#0088cc] text-xs font-mono transition-all duration-200 cursor-pointer shadow-sm hover:shadow-[0_0_12px_rgba(0,136,204,0.3)] active:scale-95"
                title="ចុចដើម្បីឆាតទៅកាន់ Telegram @Vandazz_Official"
              >
                <svg className="w-3.5 h-3.5 text-[#0088cc] group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                </svg>
                <span className="text-cyan-400 font-semibold">Telegram:</span>
                <span className="text-white font-bold group-hover:text-cyan-300">@Vandazz_Official</span>
                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-white transition-colors" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
