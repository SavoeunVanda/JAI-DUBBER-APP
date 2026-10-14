import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle, Info, X, AlertTriangle } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[99999] flex flex-col gap-2.5 max-w-sm w-[calc(100vw-40px)] sm:w-80 pointer-events-none transition-all duration-300">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const displayDuration = toast.duration !== undefined ? toast.duration : 3000;

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, displayDuration);
    return () => clearTimeout(timer);
  }, [toast.id, displayDuration, onDismiss]);

  const config = {
    success: {
      bg: 'bg-[#091b15] border-emerald-500/70 text-emerald-200',
      icon: <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />,
      accent: 'bg-emerald-500',
    },
    error: {
      bg: 'bg-[#1c0a0e] border-rose-500/80 text-rose-200',
      icon: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
      accent: 'bg-rose-500',
    },
    warning: {
      bg: 'bg-[#1c1409] border-amber-500/80 text-amber-200',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
      accent: 'bg-amber-500',
    },
    info: {
      bg: 'bg-[#09172a] border-cyan-500/80 text-cyan-200',
      icon: <Info className="w-5 h-5 text-cyan-400 shrink-0" />,
      accent: 'bg-cyan-500',
    },
  }[toast.type];

  return (
    <div
      className={`pointer-events-auto relative overflow-hidden flex items-start gap-3 p-3.5 border rounded-sm shadow-2xl backdrop-blur-md transition-all duration-300 animate-slide-in font-khmer text-xs ${config.bg}`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${config.accent}`} />
      <div className="mt-0.5 ml-1">{config.icon}</div>
      <div className="flex-1 pr-1">
        <h4 className="font-bold text-sm tracking-wide leading-snug mb-0.5">{toast.title}</h4>
        {toast.message && (
          <p className="text-xs opacity-90 leading-relaxed font-sans break-words">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-slate-400 hover:text-white p-1 rounded-sm hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
        title="បិទ"
      >
        <X className="w-4 h-4" />
      </button>

      {/* 3-second countdown indicator */}
      <div
        className={`absolute bottom-0 left-0 h-0.5 ${config.accent} opacity-50`}
        style={{
          width: '100%',
          animation: `toastProgress ${displayDuration}ms linear forwards`,
        }}
      />
    </div>
  );
};
