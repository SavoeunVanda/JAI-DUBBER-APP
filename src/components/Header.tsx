import React from 'react';
import { Settings, Download, Bot, Terminal, Cpu, Key, Sparkles } from 'lucide-react';
import headerTextureTile from '../assets/header_texture_tile.png';

interface HeaderProps {
  serverStatus: string;
  geminiActive: boolean;
  onOpenExportModal: () => void;
  onOpenAutoDubbing: () => void;
  onOpenAiEngine?: () => void;
  onOpenConsole?: () => void;
  onOpenSettings: () => void;
  onOpenLicense?: () => void;
  onOpenUpdateModal?: () => void;
  licenseStatus?: any;
}

export const AppLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const containerSize = size === 'sm' ? 'w-7 h-7 rounded-[8px]' : size === 'lg' ? 'w-10 h-10 rounded-[12px]' : 'w-9 h-9 rounded-[10px]';
  const innerSize = size === 'sm' ? 'rounded-[6.5px]' : size === 'lg' ? 'rounded-[10.5px]' : 'rounded-[8.5px]';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <div className={`relative ${containerSize} p-[1.5px] bg-gradient-to-tr from-[#a855f7] via-[#00d2ff] to-[#00f5d4] shadow-[0_0_14px_rgba(0,210,255,0.4)] flex items-center justify-center shrink-0 overflow-hidden`}>
      <div className={`w-full h-full bg-[#080d16] ${innerSize} flex items-center justify-center relative overflow-hidden`}>
        <img
          src="/favicon.png"
          alt="JAI DUBBER"
          className="w-full h-full object-cover select-none pointer-events-none"
          onError={(e) => {
            // fallback if image fails
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      </div>
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({
  onOpenExportModal,
  onOpenAutoDubbing,
  onOpenAiEngine,
  onOpenConsole,
  onOpenSettings,
  onOpenLicense,
  onOpenUpdateModal,
  licenseStatus,
}) => {
  return (
    <header className="relative h-14 bg-[#081724] border-b border-[#06b6d4]/50 px-4 flex items-center justify-between select-none overflow-hidden shadow-[0_4px_20px_rgba(6,182,212,0.2)]">
      {/* Animated Header Dot/Diamond Texture Layer from Image 2 */}
      <div
        className="absolute inset-0 pointer-events-none animated-header-texture opacity-90 z-0"
        style={{
          backgroundImage: `url(${headerTextureTile})`,
          backgroundRepeat: 'repeat-x',
          backgroundSize: '1024px 100%',
        }}
      />
      {/* Subtle depth vignette to blend edges cleanly */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#06111d]/75 via-transparent to-[#06111d]/75 z-0" />

      {/* Left Branding */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <AppLogo size="md" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold tracking-widest text-lg text-white font-mono drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                JAI DUBBER
              </h1>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-mono font-bold shadow-sm backdrop-blur-xs">
                v1.0.5
              </span>
              {/* Check Update Button */}
              <button
                type="button"
                onClick={onOpenUpdateModal}
                title="ពិនិត្យមើលកំណែថ្មី និងកំណត់ត្រា Changelog (Check for Updates)"
                className="text-[10px] px-2.5 py-0.5 rounded font-mono font-bold transition-all cursor-pointer backdrop-blur-xs flex items-center gap-1.5 bg-gradient-to-r from-amber-500/25 via-yellow-500/20 to-amber-500/25 text-[#fbbf24] border border-amber-400/80 shadow-[0_0_10px_rgba(245,158,11,0.3)] hover:bg-amber-500/35 hover:shadow-[0_0_14px_rgba(245,158,11,0.6)] active:scale-95"
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Check Update</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-300 tracking-wider drop-shadow-sm">
              DEVELOPED BY <span className="text-cyan-400 font-semibold">VANDA</span>
            </p>
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="relative z-10 flex items-center gap-2.5">
        {/* LICENSE: License Key & Activation Status */}
        <button
          onClick={onOpenLicense}
          title="License Key & Activation Status - ព័ត៌មានអាជ្ញាប័ណ្ណ និងកូដដំណើរការ"
          className="glowing-rainbow-btn text-xs font-mono font-bold active:scale-95"
        >
          <div className="glowing-rainbow-btn-inner text-cyan-300 hover:text-cyan-100">
            <Key className="w-3.5 h-3.5 text-cyan-400" />
            <span>LICENSE</span>
          </div>
        </button>

        {/* Auto Dubbing: runs the whole flow over a folder of videos */}
        <button
          onClick={onOpenAutoDubbing}
          title="Auto Dubbing - បកប្រែវីដេអូទាំងអស់ក្នុងថតដោយស្វ័យប្រវត្តិ"
          className="glowing-rainbow-btn text-xs font-mono font-bold active:scale-95"
        >
          <div className="glowing-rainbow-btn-inner !bg-[#160d24] hover:!bg-[#1f1233] text-fuchsia-300 hover:text-fuchsia-100">
            <Bot className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>AUTO DUBBING</span>
          </div>
        </button>

        {/* Export Button */}
        <button
          onClick={onOpenExportModal}
          className="glowing-rainbow-btn text-xs font-mono font-bold active:scale-95"
          title="Export Project"
        >
          <div className="glowing-rainbow-btn-inner !bg-[#081e22] hover:!bg-[#0c2a30] text-teal-300 hover:text-teal-100">
            <Download className="w-3.5 h-3.5 text-teal-400" />
            <span>EXPORT</span>
          </div>
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="glowing-rainbow-btn text-xs font-mono active:scale-95"
          title="Studio Settings"
        >
          <div className="glowing-rainbow-btn-inner !px-2 text-slate-200 hover:text-white">
            <Settings className="w-4 h-4 text-cyan-300" />
          </div>
        </button>
      </div>
    </header>
  );
};

