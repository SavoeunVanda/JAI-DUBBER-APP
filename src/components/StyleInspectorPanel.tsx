import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Type,
  Droplet,
  Trash2,
  X,
  RotateCw,
  ImageIcon,
  RefreshCw,
  Activity,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  ArrowLeftRight,
  Move,
  Gauge,
} from 'lucide-react';
import { TextOverlayItem, BlurBoxItem, ImageOverlayItem, TextOverlayAnimation } from '../types';
import { detectAllSystemFonts, DetectedFontsResult } from '../utils/fontDetector';

interface StyleInspectorPanelProps {
  // Text overlays
  textOverlays: TextOverlayItem[];
  selectedTextId: string | null;
  onSelectTextId: (id: string | null) => void;
  onUpdateTextOverlay: (id: string, updates: Partial<TextOverlayItem>) => void;
  onAddTextOverlay?: () => void;
  onDeleteTextOverlay: (id: string) => void;

  // Blur boxes
  blurBoxes: BlurBoxItem[];
  selectedBlurId: string | null;
  onSelectBlurId: (id: string | null) => void;
  onUpdateBlurBox: (id: string, updates: Partial<BlurBoxItem>) => void;
  onAddBlurBox?: () => void;
  onDeleteBlurBox: (id: string) => void;

  // Image overlays
  imageOverlays?: ImageOverlayItem[];
  selectedImageId?: string | null;
  onSelectImageId?: (id: string | null) => void;
  onUpdateImageOverlay?: (id: string, updates: Partial<ImageOverlayItem>) => void;
  onDeleteImageOverlay?: (id: string) => void;

  // Optional legacy props
  subtitleStyle?: any;
  onUpdateSubtitleStyle?: (style: any) => void;
  selectedSubId?: string | null;
  onSelectSubId?: (id: string | null) => void;
  isMuteOriginalVocals?: boolean;
  onToggleMuteVocals?: () => void;
  bgmMixLevel?: number;
  onChangeBgmMix?: (level: number) => void;
}

export const StyleInspectorPanel: React.FC<StyleInspectorPanelProps> = ({
  textOverlays,
  selectedTextId,
  onSelectTextId,
  onUpdateTextOverlay,
  onDeleteTextOverlay,
  blurBoxes,
  selectedBlurId,
  onSelectBlurId,
  onUpdateBlurBox,
  onDeleteBlurBox,
  imageOverlays = [],
  selectedImageId = null,
  onSelectImageId = (_id: string | null) => {},
  onUpdateImageOverlay = (_id: string, _updates: Partial<ImageOverlayItem>) => {},
  onDeleteImageOverlay = (_id: string) => {},
}) => {
  const selectedText = selectedTextId ? (textOverlays.find((t) => t.id === selectedTextId) || null) : null;
  const selectedBlur = selectedBlurId ? (blurBoxes.find((b) => b.id === selectedBlurId) || null) : null;
  const selectedImage = selectedImageId ? (imageOverlays.find((img) => img.id === selectedImageId) || null) : null;

  const isVisible = Boolean(selectedText || selectedBlur || selectedImage);

  // Detected System Fonts from User's PC
  const [detectedFonts, setDetectedFonts] = useState<DetectedFontsResult>({
    khmerFonts: ['Battambang', 'Nokora', 'Hanuman', 'Moul', 'Content', 'Kantumruy Pro', 'Siemreap', 'Bokor', 'Koulen'],
    systemFonts: [],
    allFonts: ['Battambang', 'Nokora', 'Hanuman', 'Moul', 'Content', 'Kantumruy Pro', 'Siemreap', 'Bokor', 'Koulen'],
    hasLocalFontAccess: false,
  });
  const [isScanningFonts, setIsScanningFonts] = useState(false);

  useEffect(() => {
    let isMounted = true;
    detectAllSystemFonts(false).then((res) => {
      if (isMounted) {
        setDetectedFonts(res);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleScanAllLocalFonts = async () => {
    setIsScanningFonts(true);
    try {
      const res = await detectAllSystemFonts(true);
      setDetectedFonts(res);
    } catch (e) {
      console.warn('Scan fonts error:', e);
    } finally {
      setIsScanningFonts(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.aside
          key={selectedText ? `text-${selectedText.id}` : selectedBlur ? `blur-${selectedBlur.id}` : `img-${selectedImage?.id}`}
          initial={{ width: 0, opacity: 0, x: 25 }}
          animate={{ width: 330, opacity: 1, x: 0 }}
          exit={{ width: 0, opacity: 0, x: 25 }}
          transition={{
            type: 'spring',
            damping: 24,
            stiffness: 240,
            mass: 0.8,
            opacity: { duration: 0.25, delay: 0.08 },
            width: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
            x: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
          }}
          className="bg-[#0c121c] border-l border-[#1b263b] flex flex-col h-full overflow-hidden select-none shrink-0 shadow-2xl z-30"
          style={{ willChange: 'width, opacity, transform' }}
        >
          <div className="w-[330px] flex flex-col h-full overflow-hidden shrink-0">
      {/* ======================= CASE 1: SELECTED TEXT OVERLAY ======================= */}
      {selectedText && (
        <>
          {/* Header */}
          <div className="bg-[#121b2b] border-b border-[#202d45] px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Type className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-cyan-300 font-khmer">
                  Text Overlay #{textOverlays.findIndex((t) => t.id === selectedText.id) + 1}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Inspector Panel</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectTextId(null)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              title="បិទផ្ទាំង (Deselect)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
            <div className="bg-[#121b2b] border border-cyan-500/40 rounded-xl p-3 flex flex-col gap-2.5 text-xs font-mono shadow-[0_0_12px_rgba(6,182,212,0.15)]">
              {/* Header of selected card */}
              <div className="flex items-center justify-between pb-1.5 border-b border-cyan-500/20">
                <div className="flex items-center gap-1.5 text-cyan-300 font-bold font-khmer">
                  <Type className="w-3.5 h-3.5" />
                  <span>កែសម្រួលអក្សរ</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTextOverlay(selectedText.id);
                    onSelectTextId(null);
                  }}
                  className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer flex items-center gap-1 text-[11px] font-khmer"
                  title="លុប Text Overlay នេះ"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>លុប</span>
                </button>
              </div>

              {/* Text Content */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400 font-khmer">អត្ថបទ (Text):</label>
                <textarea
                  rows={2}
                  value={selectedText.text}
                  onChange={(e) => onUpdateTextOverlay(selectedText.id, { text: e.target.value })}
                  placeholder="បញ្ចូលអក្សរលើវីដេអូ..."
                  className="w-full bg-[#0c1424] border border-[#22324d] focus:border-cyan-400 focus:bg-[#101b2e] rounded-lg px-2.5 py-1.5 text-white text-xs outline-none transition-all font-khmer resize-none"
                />
              </div>

              {/* Font Family Selection */}
              <div className="flex flex-col gap-2 bg-[#0c1424] border border-[#22324d] rounded-lg p-2.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="font-khmer flex items-center gap-1.5 text-cyan-300 font-semibold">
                    <Type className="w-3.5 h-3.5 text-cyan-400" />
                    <span>ពុម្ពអក្សរ (Font):</span>
                    {detectedFonts.allFonts.length > 0 && (
                      <span className="text-[9px] text-cyan-400 font-mono">
                        ({detectedFonts.allFonts.length})
                      </span>
                    )}
                  </span>
                  {detectedFonts.hasLocalFontAccess && (
                    <button
                      type="button"
                      onClick={handleScanAllLocalFonts}
                      disabled={isScanningFonts}
                      className="p-1 rounded text-cyan-400 hover:text-cyan-200 hover:bg-[#1f304d] transition-colors cursor-pointer"
                      title="ស្កេន Font ទាំងអស់នៅលើកុំព្យូទ័រ (Scan All PC Fonts)"
                      aria-label="ស្កេន Font"
                    >
                      <RefreshCw className={`w-3 h-3 ${isScanningFonts ? 'animate-spin text-amber-400' : ''}`} />
                    </button>
                  )}
                </div>

                <select
                  value={selectedText.fontFamily || 'Battambang'}
                  onChange={(e) => {
                    if (e.target.value === '__scan_local_fonts__') {
                      handleScanAllLocalFonts();
                      return;
                    }
                    onUpdateTextOverlay(selectedText.id, { fontFamily: e.target.value });
                  }}
                  className="w-full bg-[#162133] border border-[#23334d] text-cyan-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-400 font-khmer cursor-pointer font-semibold"
                >
                  {detectedFonts.hasLocalFontAccess && (
                    <option value="__scan_local_fonts__" className="text-amber-300 font-bold bg-[#1a263d]">
                      🔄 ស្កេន Font ក្នុងកុំព្យូទ័រទាំងអស់ (Scan All PC Fonts)...
                    </option>
                  )}

                  {selectedText.fontFamily &&
                    !detectedFonts.allFonts.includes(selectedText.fontFamily) && (
                      <option value={selectedText.fontFamily}>
                        {selectedText.fontFamily} (បច្ចុប្បន្ន)
                      </option>
                    )}

                  <optgroup label="🇰🇭 Khmer Fonts (ពុម្ពអក្សរខ្មែរ)">
                    {detectedFonts.khmerFonts.map((font) => (
                      <option
                        key={`khmer-${font}`}
                        value={font}
                        style={{ fontFamily: `"${font}", sans-serif` }}
                      >
                        {font}
                      </option>
                    ))}
                  </optgroup>

                  {detectedFonts.systemFonts.length > 0 && (
                    <optgroup label="💻 System Fonts លើកុំព្យូទ័រ (PC Fonts)">
                      {detectedFonts.systemFonts.map((font) => (
                        <option
                          key={`sys-${font}`}
                          value={font}
                          style={{ fontFamily: `"${font}", sans-serif` }}
                        >
                          {font}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {/* Quick Font Preset Buttons */}
                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  {[
                    { label: 'Battambang', val: 'Battambang' },
                    { label: 'Kantumruy', val: 'Kantumruy Pro' },
                    { label: 'មូល (Moul)', val: 'Moul' },
                    { label: 'Nokora', val: 'Nokora' },
                    { label: 'Hanuman', val: 'Hanuman' },
                    { label: 'Content', val: 'Content' },
                  ].map((f) => {
                    const active = (selectedText.fontFamily || 'Battambang') === f.val;
                    return (
                      <button
                        key={f.val}
                        type="button"
                        onClick={() => onUpdateTextOverlay(selectedText.id, { fontFamily: f.val })}
                        className={`py-1 px-1.5 text-[10.5px] rounded border transition-all cursor-pointer truncate ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_8px_rgba(6,182,212,0.25)]'
                            : 'bg-[#141f30] border-[#22334e] text-slate-400 hover:text-white hover:border-slate-500'
                        }`}
                        style={{ fontFamily: `"${f.val}", sans-serif` }}
                        title={f.label}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Size & Width Grid */}
              <div className="grid grid-cols-2 gap-2">
                {/* Font Size */}
                <div className="flex flex-col gap-1 bg-[#0c1424] border border-[#22324d] rounded-lg p-2">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>Size:</span>
                    <span className="text-cyan-300 font-bold">{selectedText.fontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={72}
                    value={selectedText.fontSize}
                    onChange={(e) =>
                      onUpdateTextOverlay(selectedText.id, { fontSize: Number(e.target.value) })
                    }
                    className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                  />
                </div>

                {/* Width % */}
                <div className="flex flex-col gap-1 bg-[#0c1424] border border-[#22324d] rounded-lg p-2">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>Width:</span>
                    <span className="text-cyan-300 font-bold">{selectedText.widthPercent || 60}%</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={95}
                    value={selectedText.widthPercent || 60}
                    onChange={(e) =>
                      onUpdateTextOverlay(selectedText.id, { widthPercent: Number(e.target.value) })
                    }
                    className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                  />
                </div>
              </div>

              {/* Color & Background Row */}
              <div className="flex items-center justify-between gap-2 bg-[#0c1424] border border-[#22324d] rounded-lg p-2 text-[11px]">
                {/* Text Color */}
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Color:</span>
                  <input
                    type="color"
                    value={selectedText.color}
                    onChange={(e) =>
                      onUpdateTextOverlay(selectedText.id, { color: e.target.value })
                    }
                    className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                  />
                </div>

                {/* Background Toggle & Color */}
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer text-slate-300 font-khmer">
                    <input
                      type="checkbox"
                      checked={selectedText.hasBg !== false && Boolean(selectedText.bgColor || selectedText.backgroundColor) && (selectedText.bgColor || selectedText.backgroundColor) !== 'transparent'}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        const currentBg = selectedText.bgColor || selectedText.backgroundColor || 'rgba(0, 0, 0, 0.65)';
                        const effective = isChecked ? (currentBg === 'transparent' ? 'rgba(0, 0, 0, 0.65)' : currentBg) : 'transparent';
                        onUpdateTextOverlay(selectedText.id, {
                          hasBg: isChecked,
                          bgColor: effective,
                          backgroundColor: isChecked ? effective : '',
                        });
                      }}
                      className="rounded accent-cyan-400 cursor-pointer"
                    />
                    <span>BG:</span>
                  </label>
                  {selectedText.hasBg !== false &&
                    Boolean(selectedText.bgColor || selectedText.backgroundColor) &&
                    (selectedText.bgColor || selectedText.backgroundColor) !== 'transparent' && (
                      <input
                        type="color"
                        value={
                          (selectedText.bgColor || selectedText.backgroundColor || '#000000').startsWith('#')
                            ? (selectedText.bgColor || selectedText.backgroundColor || '#000000')
                            : '#000000'
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          onUpdateTextOverlay(selectedText.id, {
                            hasBg: true,
                            bgColor: val,
                            backgroundColor: val,
                          });
                        }}
                        className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                      />
                    )}
                </div>
              </div>

              {/* Round Corners (Border Radius) Slider & Presets */}
              <div className="flex flex-col gap-2 bg-[#0c1424] border border-[#22324d] rounded-lg p-2.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="font-khmer flex items-center gap-1.5">
                    <svg
                      className="w-3 h-3 text-cyan-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 18V10C6 7.79 7.79 6 10 6H18V18H6Z" />
                    </svg>
                    ជ្រុងមូល (Round Corners):
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={selectedText.borderRadius !== undefined ? selectedText.borderRadius : 8}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(60, Number(e.target.value)));
                        onUpdateTextOverlay(selectedText.id, { borderRadius: val });
                      }}
                      className="w-10 bg-[#162133] border border-[#23334d] rounded px-1 py-0.5 text-center text-cyan-300 font-bold outline-none text-xs"
                    />
                    <span>px</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={60}
                  value={selectedText.borderRadius !== undefined ? selectedText.borderRadius : 8}
                  onChange={(e) =>
                    onUpdateTextOverlay(selectedText.id, { borderRadius: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />

                {/* Quick Corner Presets */}
                <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                  {[
                    { label: 'ស្រួច (0px)', val: 0 },
                    { label: '8px', val: 8 },
                    { label: '16px', val: 16 },
                    { label: 'មូល (30px)', val: 30 },
                  ].map((p) => {
                    const curr = selectedText.borderRadius !== undefined ? selectedText.borderRadius : 8;
                    const active = curr === p.val;
                    return (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => onUpdateTextOverlay(selectedText.id, { borderRadius: p.val })}
                        className={`py-1 text-[10px] rounded border transition-all cursor-pointer font-khmer ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-semibold'
                            : 'bg-[#141f30] border-[#22334e] text-slate-400 hover:text-white hover:border-slate-500'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Feather (Soft Edges) Slider & Presets */}
              <div className="flex flex-col gap-2 bg-[#0c1424] border border-[#22324d] rounded-lg p-2.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="font-khmer flex items-center gap-1.5">
                    <svg
                      className="w-3 h-3 text-cyan-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="17 11 12 6 7 11" />
                      <polyline points="17 18 12 13 7 18" />
                    </svg>
                    គែមទន់ (Feather):
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={selectedText.feather !== undefined ? selectedText.feather : 0}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(50, Number(e.target.value)));
                        onUpdateTextOverlay(selectedText.id, { feather: val });
                      }}
                      className="w-10 bg-[#162133] border border-[#23334d] rounded px-1 py-0.5 text-center text-cyan-300 font-bold outline-none text-xs"
                    />
                    <span>px</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={50}
                  value={selectedText.feather !== undefined ? selectedText.feather : 0}
                  onChange={(e) =>
                    onUpdateTextOverlay(selectedText.id, { feather: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />

                {/* Quick Feather Presets */}
                <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                  {[
                    { label: 'គ្មាន (0px)', val: 0 },
                    { label: '10px', val: 10 },
                    { label: '20px', val: 20 },
                    { label: '35px', val: 35 },
                  ].map((p) => {
                    const curr = selectedText.feather !== undefined ? selectedText.feather : 0;
                    const active = curr === p.val;
                    return (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => onUpdateTextOverlay(selectedText.id, { feather: p.val })}
                        className={`py-1 text-[10px] rounded border transition-all cursor-pointer font-khmer ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-semibold'
                            : 'bg-[#141f30] border-[#22334e] text-slate-400 hover:text-white hover:border-slate-500'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rotation Control */}
              <div className="flex flex-col gap-2 bg-[#0c1424] border border-[#22324d] rounded-lg p-2.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="font-khmer flex items-center gap-1.5">
                    <RotateCw className="w-3 h-3 text-cyan-400" />
                    បង្វិល (Rotation):
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={360}
                      value={selectedText.rotation !== undefined ? selectedText.rotation : 0}
                      onChange={(e) => {
                        const val = ((Number(e.target.value) % 360) + 360) % 360;
                        onUpdateTextOverlay(selectedText.id, { rotation: val });
                      }}
                      className="w-12 bg-[#162133] border border-[#23334d] rounded px-1 py-0.5 text-center text-cyan-300 font-bold outline-none text-xs"
                    />
                    <span>°</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={360}
                  value={selectedText.rotation !== undefined ? selectedText.rotation : 0}
                  onChange={(e) =>
                    onUpdateTextOverlay(selectedText.id, { rotation: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />

                {/* Quick Rotation Angle Presets */}
                <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                  {[
                    { label: '0° (ត្រង់)', val: 0 },
                    { label: '45°', val: 45 },
                    { label: '90°', val: 90 },
                    { label: '180°', val: 180 },
                  ].map((p) => {
                    const curr = selectedText.rotation !== undefined ? selectedText.rotation : 0;
                    const active = curr === p.val;
                    return (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => onUpdateTextOverlay(selectedText.id, { rotation: p.val })}
                        className={`py-1 text-[10px] rounded border transition-all cursor-pointer font-khmer ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-semibold'
                            : 'bg-[#141f30] border-[#22334e] text-slate-400 hover:text-white hover:border-slate-500'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Opacity Control */}
              <div className="flex flex-col gap-1.5 bg-[#0c1424] border border-[#22324d] rounded-lg p-2 text-[11px]">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-khmer">ភាពស្រអាប់ (Opacity):</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={selectedText.opacity !== undefined ? selectedText.opacity : 100}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(100, Number(e.target.value)));
                        onUpdateTextOverlay(selectedText.id, { opacity: val });
                      }}
                      className="w-10 bg-[#162133] border border-[#23334d] rounded px-1 py-0.5 text-center text-cyan-300 font-bold outline-none text-xs"
                    />
                    <span>%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={selectedText.opacity !== undefined ? selectedText.opacity : 100}
                  onChange={(e) =>
                    onUpdateTextOverlay(selectedText.id, { opacity: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Moving Loop / Animation Controls */}
              <div className="flex flex-col gap-2 bg-[#0c1424] border border-[#22324d] rounded-lg p-2.5 text-[11px]">
                <div className="flex items-center justify-between text-slate-300">
                  <div className="flex items-center gap-1.5 font-bold font-khmer">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    <span>ចលនារំកិល (Moving Loop):</span>
                  </div>
                  {selectedText.animation && selectedText.animation !== 'none' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-mono font-bold animate-pulse">
                      ACTIVE
                    </span>
                  )}
                </div>

                {/* Animation Directions Grid */}
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'none', label: 'គ្មានចលនា (Static)', icon: X },
                    { id: 'up', label: 'ពីក្រោមឡើងលើ', icon: ArrowUp },
                    { id: 'down', label: 'ពីលើចុះក្រោម', icon: ArrowDown },
                    { id: 'left_to_right', label: 'ពីឆ្វេងទៅស្ដាំ', icon: ArrowRight },
                    { id: 'right_to_left', label: 'ពីស្ដាំទៅឆ្វេង', icon: ArrowLeft },
                    { id: 'bounce_vertical', label: 'ឡើង/ចុះ ឆ្លាស់គ្នា', icon: ArrowUpDown },
                    { id: 'bounce_horizontal', label: 'ឆ្វេង/ស្ដាំ ឆ្លាស់គ្នា', icon: ArrowLeftRight },
                    { id: 'bounce_all', label: 'ឆ្លាស់គ្នាសព្វទិស (Bounce)', icon: Move },
                  ].map((anim) => {
                    const isActive = (selectedText.animation || 'none') === anim.id;
                    const IconCmp = anim.icon;
                    return (
                      <button
                        key={anim.id}
                        type="button"
                        onClick={() =>
                          onUpdateTextOverlay(selectedText.id, {
                            animation: anim.id as TextOverlayAnimation,
                            animationSpeed: selectedText.animationSpeed || 5,
                          })
                        }
                        className={`px-2 py-1.5 rounded-sm flex items-center gap-1.5 text-[10px] font-khmer transition-all cursor-pointer border ${
                          isActive
                            ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400 font-bold shadow-[0_0_8px_rgba(34,211,238,0.25)]'
                            : 'bg-[#152033] hover:bg-[#1a2840] text-slate-400 hover:text-slate-200 border-transparent'
                        }`}
                      >
                        <IconCmp className={`w-3 h-3 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                        <span className="truncate">{anim.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Speed Slider - Only visible when animation is active */}
                {selectedText.animation && selectedText.animation !== 'none' && (
                  <div className="mt-1 pt-2 border-t border-[#1b283e] flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-slate-400">
                      <div className="flex items-center gap-1 font-khmer">
                        <Gauge className="w-3 h-3 text-cyan-400" />
                        <span>ល្បឿនរំកិល (Speed):</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={selectedText.animationSpeed || 5}
                          onChange={(e) => {
                            const val = Math.max(1, Math.min(10, Number(e.target.value)));
                            onUpdateTextOverlay(selectedText.id, { animationSpeed: val });
                          }}
                          className="w-9 bg-[#162133] border border-[#23334d] rounded px-1 py-0.5 text-center text-cyan-300 font-bold outline-none text-xs"
                        />
                        <span className="text-[10px] text-slate-400 font-khmer">
                          {(selectedText.animationSpeed || 5) <= 3
                            ? '(យឺត)'
                            : (selectedText.animationSpeed || 5) >= 8
                            ? '(លឿន)'
                            : '(មធ្យម)'}
                        </span>
                      </div>
                    </div>

                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={selectedText.animationSpeed || 5}
                      onChange={(e) =>
                        onUpdateTextOverlay(selectedText.id, { animationSpeed: Number(e.target.value) })
                      }
                      className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                    />

                    {/* Quick speed preset pills */}
                    <div className="flex items-center justify-between gap-1 pt-0.5 text-[9px] font-khmer">
                      {[
                        { label: 'យឺតខ្លាំង', val: 1 },
                        { label: 'យឺត (Slow)', val: 3 },
                        { label: 'មធ្យម (Normal)', val: 5 },
                        { label: 'លឿន (Fast)', val: 8 },
                        { label: 'លឿនបំផុត', val: 10 },
                      ].map((sp) => (
                        <button
                          key={sp.val}
                          type="button"
                          onClick={() => onUpdateTextOverlay(selectedText.id, { animationSpeed: sp.val })}
                          className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                            (selectedText.animationSpeed || 5) === sp.val
                              ? 'bg-cyan-500/30 text-cyan-300 font-bold border border-cyan-400/50'
                              : 'bg-[#152033] text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {sp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Position Guide */}
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-[#1b283e]">
                <span>
                  Position: X {Math.round(selectedText.x)}% / Y {Math.round(selectedText.y)}%
                </span>
                <span className="text-cyan-400 font-khmer">អូសលើវីដេអូដើម្បីប្តូរទីតាំង</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ======================= CASE 2: SELECTED BLUR MASK ======================= */}
      {selectedBlur && !selectedText && (
        <>
          {/* Header */}
          <div className="bg-[#121b2b] border-b border-[#202d45] px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Droplet className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-cyan-300 font-khmer">
                  Blur Mask #{blurBoxes.findIndex((b) => b.id === selectedBlur.id) + 1}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Inspector Panel</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectBlurId(null)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              title="បិទផ្ទាំង (Deselect)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
            <div className="bg-[#121b2b] border border-cyan-500/40 rounded-xl p-3 flex flex-col gap-2.5 text-xs font-mono shadow-[0_0_12px_rgba(6,182,212,0.15)]">
              {/* Header of selected card */}
              <div className="flex items-center justify-between pb-1.5 border-b border-cyan-500/20">
                <div className="flex items-center gap-1.5 text-cyan-300 font-bold font-khmer">
                  <Droplet className="w-3.5 h-3.5" />
                  <span>កែសម្រួលផ្ទាំងបាំង Blur</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteBlurBox(selectedBlur.id);
                    onSelectBlurId(null);
                  }}
                  className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer flex items-center gap-1 text-[11px] font-khmer"
                  title="លុប Blur Box នេះ"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>លុប</span>
                </button>
              </div>

              {/* Blur Intensity Slider */}
              <div className="flex flex-col gap-1.5 bg-[#0c1424] border border-[#22324d] rounded-lg p-2.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="font-khmer">កម្រិត Blur (Intensity):</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={4}
                      max={40}
                      value={selectedBlur.blurAmount}
                      onChange={(e) => {
                        const val = Math.max(4, Math.min(40, Number(e.target.value)));
                        onUpdateBlurBox(selectedBlur.id, { blurAmount: val });
                      }}
                      className="w-10 bg-[#162133] border border-[#23334d] rounded px-1 py-0.5 text-center text-cyan-300 font-bold outline-none text-xs"
                    />
                    <span>px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={4}
                  max={40}
                  value={selectedBlur.blurAmount}
                  onChange={(e) =>
                    onUpdateBlurBox(selectedBlur.id, { blurAmount: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Round Corners (Corner Radius) Slider & Presets */}
              <div className="flex flex-col gap-2 bg-[#0c1424] border border-[#22324d] rounded-lg p-2.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="font-khmer flex items-center gap-1.5">
                    <svg
                      className="w-3 h-3 text-cyan-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 18V10C6 7.79 7.79 6 10 6H18V18H6Z" />
                    </svg>
                    ជ្រុងមូល (Round Corners):
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={selectedBlur.borderRadius !== undefined ? selectedBlur.borderRadius : 8}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(60, Number(e.target.value)));
                        onUpdateBlurBox(selectedBlur.id, { borderRadius: val });
                      }}
                      className="w-10 bg-[#162133] border border-[#23334d] rounded px-1 py-0.5 text-center text-cyan-300 font-bold outline-none text-xs"
                    />
                    <span>px</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={60}
                  value={selectedBlur.borderRadius !== undefined ? selectedBlur.borderRadius : 8}
                  onChange={(e) =>
                    onUpdateBlurBox(selectedBlur.id, { borderRadius: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />

                {/* Quick Presets */}
                <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                  {[
                    { label: 'ស្រួច (0px)', val: 0 },
                    { label: '8px', val: 8 },
                    { label: '16px', val: 16 },
                    { label: 'មូល (30px)', val: 30 },
                  ].map((p) => {
                    const curr = selectedBlur.borderRadius !== undefined ? selectedBlur.borderRadius : 8;
                    const active = curr === p.val;
                    return (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => onUpdateBlurBox(selectedBlur.id, { borderRadius: p.val })}
                        className={`py-1 text-[10px] rounded border transition-all cursor-pointer font-khmer ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-semibold'
                            : 'bg-[#141f30] border-[#22334e] text-slate-400 hover:text-white hover:border-slate-500'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Feather (Soft Edges) Slider & Presets */}
              <div className="flex flex-col gap-2 bg-[#0c1424] border border-[#22324d] rounded-lg p-2.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="font-khmer flex items-center gap-1.5">
                    <svg
                      className="w-3 h-3 text-cyan-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="17 11 12 6 7 11" />
                      <polyline points="17 18 12 13 7 18" />
                    </svg>
                    គែមទន់ (Feather):
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={selectedBlur.feather !== undefined ? selectedBlur.feather : 0}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(50, Number(e.target.value)));
                        onUpdateBlurBox(selectedBlur.id, { feather: val });
                      }}
                      className="w-10 bg-[#162133] border border-[#23334d] rounded px-1 py-0.5 text-center text-cyan-300 font-bold outline-none text-xs"
                    />
                    <span>px</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={50}
                  value={selectedBlur.feather !== undefined ? selectedBlur.feather : 0}
                  onChange={(e) =>
                    onUpdateBlurBox(selectedBlur.id, { feather: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />

                {/* Quick Preset Buttons */}
                <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                  {[
                    { label: 'គ្មាន (0px)', val: 0 },
                    { label: '10px', val: 10 },
                    { label: '20px', val: 20 },
                    { label: '35px', val: 35 },
                  ].map((p) => {
                    const curr = selectedBlur.feather !== undefined ? selectedBlur.feather : 0;
                    const active = curr === p.val;
                    return (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => onUpdateBlurBox(selectedBlur.id, { feather: p.val })}
                        className={`py-1 text-[10px] rounded border transition-all cursor-pointer font-khmer ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-semibold'
                            : 'bg-[#141f30] border-[#22334e] text-slate-400 hover:text-white hover:border-slate-500'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rotation Control */}
              <div className="flex flex-col gap-2 bg-[#0c1424] border border-[#22324d] rounded-lg p-2.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="font-khmer flex items-center gap-1.5">
                    <RotateCw className="w-3 h-3 text-cyan-400" />
                    បង្វិល (Rotation):
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={360}
                      value={selectedBlur.rotation !== undefined ? selectedBlur.rotation : 0}
                      onChange={(e) => {
                        const val = ((Number(e.target.value) % 360) + 360) % 360;
                        onUpdateBlurBox(selectedBlur.id, { rotation: val });
                      }}
                      className="w-12 bg-[#162133] border border-[#23334d] rounded px-1 py-0.5 text-center text-cyan-300 font-bold outline-none text-xs"
                    />
                    <span>°</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={360}
                  value={selectedBlur.rotation !== undefined ? selectedBlur.rotation : 0}
                  onChange={(e) =>
                    onUpdateBlurBox(selectedBlur.id, { rotation: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />

                {/* Quick Rotation Angle Presets */}
                <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                  {[
                    { label: '0° (ត្រង់)', val: 0 },
                    { label: '45°', val: 45 },
                    { label: '90°', val: 90 },
                    { label: '180°', val: 180 },
                  ].map((p) => {
                    const curr = selectedBlur.rotation !== undefined ? selectedBlur.rotation : 0;
                    const active = curr === p.val;
                    return (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => onUpdateBlurBox(selectedBlur.id, { rotation: p.val })}
                        className={`py-1 text-[10px] rounded border transition-all cursor-pointer font-khmer ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-semibold'
                            : 'bg-[#141f30] border-[#22334e] text-slate-400 hover:text-white hover:border-slate-500'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Size: Width & Height */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1 bg-[#0c1424] border border-[#22324d] rounded-lg p-2">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>Width:</span>
                    <span className="text-cyan-300 font-bold">
                      {Math.round(selectedBlur.widthPercent ?? selectedBlur.width ?? 30)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={90}
                    value={selectedBlur.widthPercent ?? selectedBlur.width ?? 30}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateBlurBox(selectedBlur.id, { width: val, widthPercent: val });
                    }}
                    className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                  />
                </div>

                <div className="flex flex-col gap-1 bg-[#0c1424] border border-[#22324d] rounded-lg p-2">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>Height:</span>
                    <span className="text-cyan-300 font-bold">
                      {Math.round(selectedBlur.heightPercent ?? selectedBlur.height ?? 18)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={90}
                    value={selectedBlur.heightPercent ?? selectedBlur.height ?? 18}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateBlurBox(selectedBlur.id, { height: val, heightPercent: val });
                    }}
                    className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                  />
                </div>
              </div>

              {/* Position Guide */}
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-[#1b283e]">
                <span>
                  Position: X {Math.round(selectedBlur.xPercent ?? selectedBlur.x ?? 50)}% / Y{' '}
                  {Math.round(selectedBlur.yPercent ?? selectedBlur.y ?? 50)}%
                </span>
                <span className="text-cyan-400 font-khmer">អូសលើវីដេអូដើម្បីប្តូរទីតាំង</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ======================= CASE 3: SELECTED IMAGE OVERLAY ======================= */}
      {selectedImage && (
        <>
          {/* Header */}
          <div className="bg-[#121b2b] border-b border-[#202d45] px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-cyan-300 font-khmer">
                  Image Overlay #{imageOverlays.findIndex((img) => img.id === selectedImage.id) + 1}
                </span>
                <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                  {selectedImage.name || 'Image'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectImageId(null)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              title="បិទផ្ទាំង (Deselect)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Settings */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
            {/* Image Preview & Delete Button */}
            <div className="bg-[#121b2b] border border-[#202d45] rounded-xl p-2.5 flex items-center gap-3">
              <div className="w-14 h-14 bg-black/60 rounded-lg border border-[#202d45] flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={selectedImage.imageUrl}
                  alt={selectedImage.name || 'Image Preview'}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <span className="text-xs text-slate-300 font-medium truncate">
                  {selectedImage.name || 'Custom Image'}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteImageOverlay(selectedImage.id)}
                  className="mt-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-[11px] font-khmer transition-all cursor-pointer w-fit"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>លុបរូបភាព</span>
                </button>
              </div>
            </div>

            {/* Alignment Shortcuts */}
            <div className="bg-[#121b2b] border border-[#202d45] rounded-xl p-3 flex flex-col gap-2">
              <label className="text-[11px] font-bold text-slate-300 font-khmer">
                ទីតាំងរហ័ស (Quick Align):
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'ឆ្វេងលើ', x: 20, y: 20 },
                  { label: 'កណ្ដាលលើ', x: 50, y: 20 },
                  { label: 'ស្ដាំលើ', x: 80, y: 20 },
                  { label: 'ឆ្វេងកណ្ដាល', x: 20, y: 50 },
                  { label: 'កណ្ដាលចំ', x: 50, y: 50 },
                  { label: 'ស្ដាំកណ្ដាល', x: 80, y: 50 },
                  { label: 'ឆ្វេងក្រោម', x: 20, y: 80 },
                  { label: 'កណ្ដាលក្រោម', x: 50, y: 80 },
                  { label: 'ស្ដាំក្រោម', x: 80, y: 80 },
                ].map((pos, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      onUpdateImageOverlay(selectedImage.id, {
                        x: pos.x,
                        y: pos.y,
                        xPercent: pos.x,
                        yPercent: pos.y,
                      })
                    }
                    className="py-1 px-1 rounded bg-[#162236] hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-500/40 text-slate-300 border border-[#22324d] text-[10px] font-khmer transition-all cursor-pointer text-center"
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Size & Opacity Controls */}
            <div className="bg-[#121b2b] border border-[#202d45] rounded-xl p-3 flex flex-col gap-3">
              {/* Width Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300 font-khmer">
                  <span>ទំហំទទឹង (Width %):</span>
                  <span className="text-cyan-400 font-mono font-bold">
                    {Math.round(selectedImage.widthPercent ?? selectedImage.width ?? 25)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={selectedImage.widthPercent ?? selectedImage.width ?? 25}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onUpdateImageOverlay(selectedImage.id, { width: val, widthPercent: val });
                  }}
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Opacity Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300 font-khmer">
                  <span>កម្រិតថ្លា (Opacity %):</span>
                  <span className="text-cyan-400 font-mono font-bold">
                    {selectedImage.opacity ?? 100}%
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={selectedImage.opacity ?? 100}
                  onChange={(e) =>
                    onUpdateImageOverlay(selectedImage.id, { opacity: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Corner Radius Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300 font-khmer">
                  <span>ជ្រុងកោង (Border Radius):</span>
                  <span className="text-cyan-400 font-mono font-bold">
                    {selectedImage.borderRadius ?? 0}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={selectedImage.borderRadius ?? 0}
                  onChange={(e) =>
                    onUpdateImageOverlay(selectedImage.id, { borderRadius: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Feather Soft Edge Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300 font-khmer">
                  <span>គែមទន់ (Edge Feather):</span>
                  <span className="text-cyan-400 font-mono font-bold">
                    {selectedImage.feather ?? 0}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={selectedImage.feather ?? 0}
                  onChange={(e) =>
                    onUpdateImageOverlay(selectedImage.id, { feather: Number(e.target.value) })
                  }
                  className="w-full h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Rotation Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300 font-khmer">
                  <span>មុំបង្វិល (Rotation):</span>
                  <span className="text-cyan-400 font-mono font-bold">
                    {selectedImage.rotation ?? 0}°
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={selectedImage.rotation ?? 0}
                    onChange={(e) =>
                      onUpdateImageOverlay(selectedImage.id, { rotation: Number(e.target.value) })
                    }
                    className="flex-1 h-1.5 bg-[#162133] rounded-full cursor-pointer accent-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateImageOverlay(selectedImage.id, {
                        rotation: ((selectedImage.rotation ?? 0) + 45) % 360,
                      })
                    }
                    className="p-1 rounded bg-[#162236] hover:bg-cyan-500/20 text-cyan-300 border border-[#22324d] cursor-pointer"
                    title="បង្វិល +45°"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Position Guide */}
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-[#1b283e]">
                <span>
                  Position: X {Math.round(selectedImage.xPercent ?? selectedImage.x ?? 50)}% / Y{' '}
                  {Math.round(selectedImage.yPercent ?? selectedImage.y ?? 50)}%
                </span>
                <span className="text-cyan-400 font-khmer">អូសលើវីដេអូដើម្បីប្តូរទីតាំង</span>
              </div>
            </div>
          </div>
        </>
      )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
