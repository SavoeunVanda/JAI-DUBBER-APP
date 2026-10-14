import React, { useState, useRef, useEffect } from 'react';

interface CustomColorPickerProps {
  color: string;
  onChange: (hex: string) => void;
  label?: string;
  compact?: boolean;
}

// Convert Hex to HSV
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
  if (clean.length !== 6) clean = 'ffffff';
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const v = max;
  const s = max === 0 ? 0 : d / max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

// Convert HSV to Hex
function hsvToHex(h: number, s: number, v: number): string {
  const sNorm = s / 100;
  const vNorm = v / 100;
  const c = vNorm * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vNorm - c;

  let r = 0,
    g = 0,
    b = 0;
  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h <= 360) {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Color Swatches Palette Grid matching user request (Small & Many)
const PALETTE_SWATCHES = [
  '#ffffff', '#e2e8f0', '#94a3b8', '#64748b', '#334155', '#1e293b', '#0f172a', '#000000',
  '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a', '#ff0055',
  '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407', '#ff6600',
  '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03', '#ffff00',
  '#a3e635', '#84cc16', '#65a30d', '#4d7c0f', '#3f6212', '#365314', '#1a2e05', '#00ff00',
  '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22', '#00ffcc',
  '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e', '#082f49', '#00ffff',
  '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554', '#0066ff',
  '#c084fc', '#a855f7', '#9333ea', '#7e22ce', '#6b21a8', '#581c87', '#3b0764', '#ff00ff',
  '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843', '#500724', '#ff007f',
];

export const CustomColorPicker: React.FC<CustomColorPickerProps> = ({
  color,
  onChange,
  label = 'Color',
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [eyedropperSupported, setEyedropperSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'EyeDropper' in window) {
      setEyedropperSupported(true);
    }
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const satValBoxRef = useRef<HTMLDivElement>(null);
  const hueBarRef = useRef<HTMLDivElement>(null);

  const currentColor = color || '#ffffff';
  const hsv = hexToHsv(currentColor);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle Saturation/Value 2D Area Mouse Dragging
  const handleSatValMove = (e: MouseEvent | React.MouseEvent) => {
    if (!satValBoxRef.current) return;
    const rect = satValBoxRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const newS = Math.round((x / rect.width) * 100);
    const newV = Math.round((1 - y / rect.height) * 100);

    const newHex = hsvToHex(hsv.h, newS, newV);
    onChange(newHex);
  };

  const handleSatValMouseDown = (e: React.MouseEvent) => {
    handleSatValMove(e);
    const onMouseMove = (moveEvent: MouseEvent) => handleSatValMove(moveEvent);
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Handle Hue Bar Mouse Dragging
  const handleHueMove = (e: MouseEvent | React.MouseEvent) => {
    if (!hueBarRef.current) return;
    const rect = hueBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));

    const newH = Math.round((x / rect.width) * 360);
    const newHex = hsvToHex(newH, hsv.s, hsv.v);
    onChange(newHex);
  };

  const handleHueMouseDown = (e: React.MouseEvent) => {
    handleHueMove(e);
    const onMouseMove = (moveEvent: MouseEvent) => handleHueMove(moveEvent);
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleEyeDropper = async () => {
    if (typeof window !== 'undefined' && 'EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        if (result && result.sRGBHex) {
          onChange(result.sRGBHex);
        }
      } catch (e) {
        // User canceled eyedropper
      }
    }
  };

  const pureHueHex = hsvToHex(hsv.h, 100, 100);

  return (
    <div ref={containerRef} className="relative inline-block w-full">
      {/* Label on top */}
      {label && (
        <div className="flex items-center h-5 mb-1">
          <label className="text-[10px] text-slate-400 font-mono">
            {label}:
          </label>
        </div>
      )}

      {/* Trigger Button (Full width color box matching container width) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-8 flex items-center justify-center bg-[#162133] border border-[#23334d] hover:border-cyan-400/60 rounded px-1 py-1 transition-all cursor-pointer shadow-sm"
      >
        <div
          className="w-full h-full rounded border border-white/20 shadow-inner"
          style={{ backgroundColor: currentColor }}
        />
      </button>

      {/* Popover Color Picker Modal (Comfortable width, right-aligned to fit inside panel) */}
      {isOpen && (
        <div className="absolute right-0 bottom-full mb-1.5 z-[999] w-60 bg-[#0d1626] border border-[#1e2f4a] rounded-xl p-3 shadow-2xl flex flex-col gap-2.5 backdrop-blur-md">
          {/* 1. Saturation / Value 2D Canvas Picker */}
          <div
            ref={satValBoxRef}
            onMouseDown={handleSatValMouseDown}
            className="relative w-full h-28 rounded-lg cursor-crosshair overflow-hidden shadow-inner select-none border border-black/40"
            style={{
              backgroundColor: pureHueHex,
              backgroundImage: `
                linear-gradient(to top, #000, transparent),
                linear-gradient(to right, #fff, transparent)
              `,
            }}
          >
            {/* Pointer handle */}
            <div
              className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_4px_rgba(0,0,0,0.9)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                backgroundColor: currentColor,
              }}
            />
          </div>

          {/* 2. Eyedropper + Hue Rainbow Spectrum Bar */}
          <div className="flex items-center gap-2">
            {eyedropperSupported && (
              <button
                type="button"
                onClick={handleEyeDropper}
                className="p-1.5 bg-[#070d18] hover:bg-[#18263e] border border-[#1b2b45] text-slate-300 hover:text-white rounded-md transition-colors cursor-pointer shrink-0"
                title="Pick color from screen"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m2 22 1-1h3l9-9" />
                  <path d="M3 21v-3l9-9" />
                  <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9" />
                </svg>
              </button>
            )}
            <div
              ref={hueBarRef}
              onMouseDown={handleHueMouseDown}
              className="relative flex-1 h-3 rounded-full cursor-pointer select-none border border-black/30 shadow-inner"
              style={{
                background:
                  'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
              }}
            >
              {/* Hue slider thumb handle */}
              <div
                className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_4px_rgba(0,0,0,0.9)] -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `${(hsv.h / 360) * 100}%`,
                  backgroundColor: pureHueHex,
                }}
              />
            </div>
          </div>

          {/* 3. Hex Selector Row */}
          <div className="bg-[#070c16] border border-[#1b2b45] rounded-lg px-2.5 py-1 flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-400 font-bold text-[11px]">Hex</span>
            <span className="text-slate-500 font-bold">#</span>
            <input
              type="text"
              value={currentColor.replace('#', '').toUpperCase()}
              onChange={(e) => {
                const val = e.target.value.trim();
                if (/^[0-9A-Fa-f]{3,6}$/.test(val)) {
                  onChange(`#${val}`);
                }
              }}
              className="w-full bg-transparent text-xs font-mono font-bold text-cyan-300 uppercase focus:outline-none tracking-widest"
            />
          </div>

          {/* 4. Color Swatches Palette Grid (8 Columns x Many Rows with small swatches) */}
          <div className="grid grid-cols-8 gap-1 pt-1.5 max-h-36 overflow-y-auto custom-scrollbar border-t border-[#1b2b45]">
            {PALETTE_SWATCHES.map((swatch, idx) => {
              const isSelected = currentColor.toLowerCase() === swatch.toLowerCase();
              return (
                <button
                  key={`${swatch}-${idx}`}
                  type="button"
                  onClick={() => onChange(swatch)}
                  className={`w-full aspect-square rounded-sm border transition-all cursor-pointer flex items-center justify-center ${
                    isSelected
                      ? 'border-white ring-1 ring-cyan-400 scale-110 z-10 shadow-[0_0_6px_rgba(34,211,238,0.7)]'
                      : 'border-black/30 hover:border-white/60 hover:scale-105'
                  }`}
                  style={{ backgroundColor: swatch }}
                  title={swatch}
                >
                  {isSelected && (
                    <svg className="w-2 h-2 text-black drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
