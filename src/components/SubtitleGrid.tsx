import React, { useRef, useState, useEffect } from 'react';
import {
  Plus,
  Upload,
  Sparkles,
  Volume2,
  Loader2,
  SlidersHorizontal,
  Zap,
  Square,
  Play,
  RotateCcw
} from 'lucide-react';
import { SubtitleSegment } from '../types';
import { formatTimeCode, parseTimeCode } from '../utils/timeFormat';

// Dedicated smooth timecode input component that doesn't reset while typing
const TimeCodeInput: React.FC<{
  valueSeconds: number;
  onChangeSeconds: (seconds: number) => void;
  className?: string;
}> = ({ valueSeconds, onChangeSeconds, className }) => {
  const [localText, setLocalText] = useState(() => formatTimeCode(valueSeconds));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalText(formatTimeCode(valueSeconds));
    }
  }, [valueSeconds, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseTimeCode(localText);
    onChangeSeconds(parsed);
    setLocalText(formatTimeCode(parsed));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="relative flex items-center w-full">
      <input
        type="text"
        value={localText}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onChange={(e) => setLocalText(e.target.value)}
        onKeyDown={handleKeyDown}
        className={className || "w-full bg-[#131d2e] border border-[#202e47] text-cyan-300 font-mono text-center rounded-sm py-1 px-2 text-xs focus:outline-none focus:border-cyan-400"}
      />
    </div>
  );
};

/**
 * Turns a progress frame into a short status line. The server reports which
 * stage it is in and, once transcribing, which batch of utterances is in flight.
 */
function formatTranscribeStatus(
  progress?: {
    stage: string;
    chunkIndex: number;
    totalChunks: number;
    keyLabel?: string;
    model?: string;
  } | null
): string {
  if (!progress) return 'TRANSCRIBING...';
  const { stage, chunkIndex, totalChunks, keyLabel, model } = progress;

  const current = stage === 'chunk' ? Math.min(chunkIndex + 1, totalChunks) : Math.min(chunkIndex, totalChunks);
  const pct = totalChunks > 0 ? Math.min(100, Math.max(0, Math.round((current / totalChunks) * 100))) : 0;

  if (keyLabel) {
    const done = totalChunks > 1 ? ` (${pct}%)` : '';
    const on = model ? ` · ${model}` : '';
    return `KEY ${keyLabel}${on}${done}...`;
  }
  switch (stage) {
    case 'preparing':
      return 'PREPARING VIDEO...';
    case 'probing':
      return 'READING VIDEO...';
    case 'detecting':
      return 'DETECTING SPEECH...';
    case 'extracting':
      return 'EXTRACTING AUDIO...';
    case 'planned':
      return 'SPEECH MAPPED';
    case 'reading':
      return totalChunks > 1
        ? `READING: ${pct}%`
        : 'READING DIALOGUE...';
    case 'translating':
      return totalChunks > 1
        ? `TRANSLATING: ${pct}%`
        : 'TRANSLATING...';
    case 'chunk':
    case 'chunkDone':
    case 'transcribing':
    case 'batchDone':
      return totalChunks > 0
        ? `TRANSCRIBING: ${pct}%`
        : 'TRANSCRIBING...';
    default:
      return totalChunks > 0 ? `TRANSCRIBING: ${pct}%` : 'TRANSCRIBING...';
  }
}

interface SubtitleGridProps {
  subtitles: SubtitleSegment[];
  currentTime: number;
  isTranscribing: boolean;
  /** Live per-chunk progress from the transcription stream, null when idle. */
  transcribeProgress?: {
    stage: string;
    chunkIndex: number;
    totalChunks: number;
    keyLabel?: string;
    model?: string;
  } | null;
  activeGender?: 'auto' | 'male' | 'female';
  onToggleGender?: (gender: 'auto' | 'male' | 'female') => void;
  onUpdateSegment: (id: string, updates: Partial<SubtitleSegment>) => void;
  onDeleteSegment: (id: string) => void;
  onAddSegment: () => void;
  onImportSRTFile: (file: File) => void;
  onTranscribeAI: () => void;
  onStopTranscribe?: () => void;
  onGenerateTTS: (segment: SubtitleSegment, playPreview?: boolean) => void;
  onGenerateAllTTS: () => void;
  isGeneratingTTS?: boolean;
  onStopGenerateTTS?: () => void;
  onSelectSegment: (id: string, time: number) => void;
  onToggleCheckSegment: (id: string) => void;
  onToggleCheckAll: (check: boolean) => void;
  onAutoSpeedAdjust: () => void;
  onFitTimeline: () => void;
  onMoveSegment: (index: number, direction: 'up' | 'down') => void;
}

export const SubtitleGrid: React.FC<SubtitleGridProps> = ({
  subtitles,
  currentTime,
  isTranscribing,
  transcribeProgress,
  activeGender,
  onToggleGender,
  onUpdateSegment,
  onDeleteSegment,
  onAddSegment,
  onImportSRTFile,
  onTranscribeAI,
  onStopTranscribe,
  onGenerateTTS,
  onGenerateAllTTS,
  isGeneratingTTS,
  onStopGenerateTTS,
  onSelectSegment,
  onToggleCheckSegment,
  onToggleCheckAll,
  onAutoSpeedAdjust,
  onFitTimeline,
  onMoveSegment,
}) => {
  const srtInputRef = useRef<HTMLInputElement | null>(null);

  const checkedCount = subtitles.filter((s) => s.isChecked).length;
  const allChecked = subtitles.length > 0 && checkedCount === subtitles.length;

  const handleSRTChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImportSRTFile(e.target.files[0]);
    }
  };

  return (
    <div className="flex-1 bg-[#0c121d] border border-[#1c293f] rounded-sm flex flex-col overflow-hidden shadow-lg select-none">
      {/* Grid Top Header */}
      <div className="bg-[#111927] border-b border-[#1c293f] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-cyan-300 font-mono tracking-wider">
            SUBTITLE DATA GRID <span className="font-khmer text-slate-400 font-normal text-xs">(របាយការណ៍អត្ថបទបញ្ចូល)</span>
          </h2>
          <div className="text-[11px] font-mono text-slate-400 bg-[#172235] border border-[#23334d] px-2 py-0.5 rounded-sm">
            TOTAL SEGMENTS: <span className="text-cyan-400 font-bold">{subtitles.length}</span> | CHECKED:{' '}
            <span className="text-emerald-400 font-bold">{checkedCount}</span>
          </div>
          {isTranscribing && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold bg-cyan-950/80 border border-cyan-400/60 text-cyan-300 px-2.5 py-0.5 rounded-sm shadow-[0_0_10px_rgba(6,182,212,0.3)] whitespace-nowrap shrink-0">
              <Loader2 className="w-3 h-3 animate-spin text-cyan-400 shrink-0" />
              <span>{formatTranscribeStatus(transcribeProgress)}</span>
            </div>
          )}
        </div>

        {/* Voice Gender Switcher on Right of Subtitle Data Grid Panel */}
        {onToggleGender && (
          <div className="flex items-center gap-2 font-mono">
            <span className="text-slate-400 text-xs font-bold tracking-wider">TO:</span>
            <button
              onClick={() => onToggleGender('auto')}
              className={`px-3 py-1 rounded-sm border text-xs font-bold font-mono transition-all cursor-pointer ${
                activeGender === 'auto'
                  ? 'border-emerald-400 bg-emerald-950/70 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.45)] ring-1 ring-emerald-400/50'
                  : 'border-emerald-700/60 bg-[#062018] text-emerald-400 hover:border-emerald-400 hover:bg-emerald-950/40'
              }`}
              title="ចាប់សម្លេងស្រី ឬ ប្រុសដោយស្វ័យប្រវត្តិតាមតួអង្គ (Auto Detect Gender)"
            >
              AUTO (ស្វ័យប្រវត្តិ)
            </button>
            <button
              onClick={() => onToggleGender('male')}
              className={`px-3 py-1 rounded-sm border text-xs font-bold font-mono transition-all cursor-pointer ${
                activeGender === 'male'
                  ? 'border-sky-400 bg-sky-950/70 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.45)] ring-1 ring-sky-400/50'
                  : 'border-sky-700/60 bg-[#071d33] text-sky-400 hover:border-sky-400 hover:bg-sky-950/40'
              }`}
              title="កំណត់សំឡេងទាំងអស់ជាសំឡេងប្រុស (Piseth)"
            >
              MALE (ប្រុស)
            </button>
            <button
              onClick={() => onToggleGender('female')}
              className={`px-3 py-1 rounded-sm border text-xs font-bold font-mono transition-all cursor-pointer ${
                activeGender === 'female'
                  ? 'border-pink-400 bg-pink-950/70 text-pink-300 shadow-[0_0_10px_rgba(244,114,182,0.45)] ring-1 ring-pink-400/50'
                  : 'border-pink-700/60 bg-[#280c1d] text-pink-400 hover:border-pink-400 hover:bg-pink-950/40'
              }`}
              title="កំណត់សំឡេងទាំងអស់ជាសំឡេងស្រី (Sreymom)"
            >
              FEMALE (ស្រី)
            </button>
          </div>
        )}
      </div>

      {/* Main Data Table */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#090e17]">
        {subtitles.length === 0 ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-slate-500 gap-3 p-6">
            <div className="w-12 h-12 rounded-lg border border-[#1e2d45] bg-[#101826] flex items-center justify-center text-slate-400">
              <Square className="w-6 h-6 text-slate-600" />
            </div>
            <p className="font-mono text-xs text-slate-400 tracking-wider text-center">
              NO SUBTITLE LINES LOADED. IMPORT SRT OR MANUAL ADD BELOW.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead className="sticky top-0 bg-[#0d1421] border-b border-[#1c293f] text-[11px] text-slate-400 font-semibold uppercase tracking-wider z-10">
              <tr>
                <th className="p-2.5 w-10 text-center border-r border-[#1c293f]">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => onToggleCheckAll(e.target.checked)}
                    className="accent-cyan-400 rounded cursor-pointer"
                  />
                </th>
                <th className="p-2.5 w-24 border-r border-[#1c293f]">START</th>
                <th className="p-2.5 w-24 border-r border-[#1c293f]">END</th>
                <th className="p-2.5 border-r border-[#1c293f]">KHMER SUBTITLE TEXT (EDITABLE)</th>
                <th className="p-2.5 w-44 border-r border-[#1c293f]">VOICE PROFILE</th>
                <th className="p-2.5 w-20 border-r border-[#1c293f] text-center">SPEED</th>
                <th className="p-2.5 w-32 text-center">AUDIO LINK</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172338]">
              {subtitles.map((seg, idx) => {
                const isActive = currentTime >= seg.startTime && currentTime <= seg.endTime;
                return (
                  <tr
                    key={seg.id}
                    onClick={() => onSelectSegment(seg.id, seg.startTime)}
                    className={`transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-cyan-950/40 border-l-2 border-l-cyan-400'
                        : seg.isChecked
                        ? 'bg-[#111a28]'
                        : 'hover:bg-[#0e1624]'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="p-2 text-center border-r border-[#172338]" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!seg.isChecked}
                        onChange={() => onToggleCheckSegment(seg.id)}
                        className="accent-cyan-400 rounded cursor-pointer"
                      />
                    </td>

                    {/* Start Time */}
                    <td className="p-2 border-r border-[#172338]" onClick={(e) => e.stopPropagation()}>
                      <TimeCodeInput
                        valueSeconds={seg.startTime}
                        onChangeSeconds={(val) => onUpdateSegment(seg.id, { startTime: val })}
                      />
                    </td>

                    {/* End Time */}
                    <td className="p-2 border-r border-[#172338]" onClick={(e) => e.stopPropagation()}>
                      <TimeCodeInput
                        valueSeconds={seg.endTime}
                        onChangeSeconds={(val) => onUpdateSegment(seg.id, { endTime: val })}
                      />
                    </td>

                    {/* Khmer Subtitle Input */}
                    <td className="p-2 border-r border-[#172338]" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={seg.text}
                        onChange={(e) => onUpdateSegment(seg.id, { text: e.target.value })}
                        placeholder="បញ្ចូលអត្ថបទរត់ជាភាសាខ្មែរនៅទីនេះ..."
                        className="w-full bg-[#121c2d] border border-[#1f2e47] text-white font-khmer rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-400 h-9"
                      />
                    </td>

                    {/* Voice Profile Selector */}
                    <td className="p-2 border-r border-[#172338]" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={seg.voiceProfile}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          onUpdateSegment(seg.id, {
                            voiceProfile: val,
                            gender: val.includes('Sreymom') ? 'female' : 'male',
                          });
                        }}
                        className={`w-full bg-[#131d2e] border rounded px-2 py-1 text-xs focus:outline-none font-khmer font-medium transition-colors ${
                          seg.voiceProfile?.includes('Sreymom') || seg.gender === 'female'
                            ? 'border-pink-500/40 text-pink-300 focus:border-pink-400'
                            : 'border-sky-500/40 text-sky-300 focus:border-sky-400'
                        }`}
                      >
                        <option value="km-KH-PisethNeural" className="text-sky-300 bg-[#0c1626]">Piseth (ប្រុស)</option>
                        <option value="km-KH-SreymomNeural" className="text-pink-300 bg-[#1f0f1c]">Sreymom (ស្រី)</option>
                      </select>
                    </td>

                    {/* Speed Selector */}
                    <td className="p-2 border-r border-[#172338] text-center" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={seg.speed || 1.0}
                        onChange={(e) =>
                          onUpdateSegment(seg.id, {
                            speed: Number(e.target.value),
                            ttsSpeed: Number(e.target.value),
                          })
                        }
                        className="bg-[#131d2e] border border-[#202e47] text-cyan-300 rounded px-1 py-1 text-xs text-center focus:outline-none focus:border-cyan-400 font-mono"
                      >
                        {seg.speed && ![0.8, 1.0, 1.1, 1.2, 1.25, 1.5, 2.0, 2.5].includes(seg.speed) && (
                          <option value={seg.speed}>{seg.speed}x</option>
                        )}
                        <option value={0.8}>0.8x</option>
                        <option value={1.0}>1.0x</option>
                        <option value={1.1}>1.1x</option>
                        <option value={1.2}>1.2x</option>
                        <option value={1.25}>1.25x</option>
                        <option value={1.5}>1.5x</option>
                        <option value={2.0}>2.0x</option>
                        <option value={2.5}>2.5x</option>
                      </select>
                    </td>

                    {/* Audio Synthesis & Play Status (AUDIO LINK) */}
                    <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        {!seg.audioUrl ? (
                          <>
                            {/* GENERATE Button (Initial State before audio generated) */}
                            <button
                              onClick={() => onGenerateTTS(seg, true)}
                              disabled={seg.isGenerating}
                              title="បង្កើត និងស្ដាប់សំឡេង (Generate & Play Audio)"
                              className="bg-[#182538] hover:bg-[#22354f] text-slate-300 hover:text-white border border-[#283b54] rounded px-2.5 py-1 text-[10px] font-bold font-mono transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50 active:scale-95"
                            >
                              {seg.isGenerating ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                                  <span>GEN...</span>
                                </>
                              ) : (
                                <span>GENERATE</span>
                              )}
                            </button>

                            {/* Refresh Icon Button */}
                            <button
                              onClick={() => onGenerateTTS(seg, false)}
                              disabled={seg.isGenerating}
                              title="បង្កើតសំឡេង (Generate Audio)"
                              className="w-6 h-6 rounded-full bg-[#121c2d] border border-[#20314d] text-slate-400 hover:text-cyan-300 hover:bg-[#1a2942] flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Play Icon Button (Borderless, slightly smaller size) */}
                            <button
                              onClick={() => onGenerateTTS(seg, true)}
                              disabled={seg.isGenerating}
                              title="ស្ដាប់សំឡេង (Play Audio)"
                              className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 transition-all cursor-pointer active:scale-95 flex items-center justify-center border-none outline-none"
                            >
                              {seg.isGenerating ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                              )}
                            </button>

                            {/* Regenerate / Refresh Button */}
                            <button
                              onClick={() => onGenerateTTS(seg, false)}
                              disabled={seg.isGenerating}
                              title="បង្កើតសំឡេងឡើងវិញ (Regenerate Audio)"
                              className="w-6 h-6 rounded-full bg-[#121c2d] border border-[#20314d] text-slate-400 hover:text-cyan-300 hover:bg-[#1a2942] flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Grid Bottom Action Toolbar */}
      <div className="bg-[#111927] border-t border-[#1c293f] p-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Add Row */}
          <button
            onClick={onAddSegment}
            className="flex items-center gap-1.5 bg-[#162338] hover:bg-[#1e2e4a] border border-[#233552] text-slate-200 px-3 py-1.5 rounded-sm text-xs font-mono transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span>+ ADD ROW</span>
          </button>

          {/* Import Subtitles SRT */}
          <button
            onClick={() => srtInputRef.current?.click()}
            className="flex items-center gap-1.5 bg-[#162338] hover:bg-[#1e2e4a] border border-[#233552] text-slate-200 px-3 py-1.5 rounded-sm text-xs font-mono transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>IMPORT SRT</span>
          </button>
          <input
            type="file"
            ref={srtInputRef}
            onChange={handleSRTChange}
            accept=".srt"
            className="hidden"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* AI Transcribe */}
          {isTranscribing ? (
            <button
              onClick={onStopTranscribe || onTranscribeAI}
              className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-rose-600 border border-red-400 hover:from-red-500 hover:to-rose-500 text-white font-bold px-3.5 py-1.5 rounded-sm text-xs font-mono shadow-[0_0_12px_rgba(239,68,68,0.6)] transition-all cursor-pointer active:scale-95"
              title="ចុចដើម្បីបញ្ឈប់ការ Transcribe (Click to Stop)"
            >
              <Loader2 className="w-3.5 h-3.5 text-white animate-spin shrink-0" />
              <div className="w-2.5 h-2.5 bg-white rounded-none shrink-0" />
              <span className="font-bold tracking-wider">STOP TRANSCRIBE</span>
            </button>
          ) : (
            <button
              onClick={onTranscribeAI}
              className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 px-3.5 py-1.5 rounded-sm text-xs font-mono transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>TRANSCRIBE</span>
            </button>
          )}

          {/* Gen Selected / Stop Gen */}
          {isGeneratingTTS ? (
            <button
              onClick={onStopGenerateTTS || onGenerateAllTTS}
              className="flex items-center gap-1.5 bg-gradient-to-r from-red-600 to-rose-600 border border-red-400 hover:from-red-500 hover:to-rose-500 text-white font-bold px-4 py-1.5 rounded-sm text-xs font-mono shadow-[0_0_12px_rgba(239,68,68,0.6)] transition-all cursor-pointer active:scale-95 animate-pulse"
              title="ចុចដើម្បីបញ្ឈប់ការបង្កើតសំឡេង (Click to Stop Voice Generation)"
            >
              <Square className="w-3.5 h-3.5 text-white fill-current" />
              <span>STOP GEN</span>
            </button>
          ) : (
            <button
              onClick={onGenerateAllTTS}
              className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold px-4 py-1.5 rounded-sm text-xs font-mono shadow-[0_0_12px_rgba(147,51,234,0.5)] transition-all cursor-pointer active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-current" />
              <span>GEN SELECTED</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
