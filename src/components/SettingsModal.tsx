import React, { useState, useEffect, useCallback } from 'react';
import { X, Sliders, Sparkles, Check, Plus, Trash2, Key, CheckCircle2, AlertCircle, Loader2, ShieldCheck, RotateCcw, ExternalLink, RefreshCw, List, Cpu } from 'lucide-react';
import { GeminiApiKeyConfig } from '../types';
import { validateGeminiKeyDirect } from '../utils/clientAiFallback';
import { openExternalUrl } from '../utils/desktopUtils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGender: 'auto' | 'male' | 'female';
  onSetDefaultGender: (gender: 'auto' | 'male' | 'female') => void;
  geminiActive: boolean;
  apiKeys: GeminiApiKeyConfig[];
  onAddApiKey: (key: string, name?: string) => void;
  onAddApiKeys?: (keys: string[]) => void;
  onRemoveApiKey: (id: string) => void;
  onToggleApiKey: (id: string) => void;
  onToggleAllApiKeys?: (active: boolean) => void;
  onClearAllApiKeys?: () => void;
  transcribeEngine: 'fast-whisper' | 'srt';
  onSetTranscribeEngine: (engine: 'fast-whisper' | 'srt') => void;
  geminiModel: string;
  onSetGeminiModel: (model: string) => void;
  onOpenAiEngine?: () => void;
}

export function extractApiKeys(input: string): string[] {
  if (!input || !input.trim()) return [];

  // Split by newlines, commas, semicolons, and spaces
  const rawTokens = input
    .split(/[\r\n,;]+/)
    .flatMap((line) => line.split(/\s+/))
    .map((token) =>
      token
        .trim()
        .replace(/^["'`\[\](){}<>]+|["'`\[\](){}<>,;]+$/g, '')
        .replace(/^(Bearer\s+|Key\s*\d*:\s*|\d+\.\s*|-\s*)/i, '')
        .trim()
    )
    .filter((token) => token.length > 0);

  const validKeys: string[] = [];
  const seen = new Set<string>();

  for (const token of rawTokens) {
    if (token.startsWith('ya29.')) continue;
    const isGeminiFormat =
      (token.startsWith('AIza') || token.startsWith('AQ.') || /^[A-Za-z0-9_-]{20,}$/.test(token)) &&
      token.length >= 20;

    if (isGeminiFormat && !seen.has(token)) {
      seen.add(token);
      validKeys.push(token);
    }
  }

  return validKeys;
}

export type GeminiModelGroup = 'Gemini 3' | 'Gemini 2.5' | 'Deprecated';

export interface GeminiModelItem {
  id: string;
  displayName: string;
  group?: GeminiModelGroup;
  available?: boolean;
}

export const GEMINI_GROUPS: Array<{ key: GeminiModelGroup; label: string }> = [
  { key: 'Gemini 3', label: '── Gemini 3 ──' },
  { key: 'Gemini 2.5', label: '── Gemini 2.5 ──' },
  { key: 'Deprecated', label: '── Deprecated ──' },
];

export const DEFAULT_GEMINI_MODELS: GeminiModelItem[] = [
  // ── Gemini 3 ──
  { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', group: 'Gemini 3' },
  { id: 'gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', group: 'Gemini 3' },
  { id: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', group: 'Gemini 3' },
  { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash (Stable)', group: 'Gemini 3' },
  { id: 'gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash Lite (Text-out / លឿន & ណែនាំ)', group: 'Gemini 3' },
  { id: 'gemini-3.5-transcribe', displayName: 'Gemini 3.5 Transcribe (Live Audio Only - មិនគាំទ្រ JSON Mode)', group: 'Gemini 3' },
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

function getModelGroup(model: GeminiModelItem): GeminiModelGroup {
  if (model.group) return model.group;
  const id = model.id.toLowerCase();
  if (id.includes('3.') || id.includes('gemini-3')) return 'Gemini 3';
  if (id.includes('2.5')) return 'Gemini 2.5';
  return 'Deprecated';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  defaultGender,
  onSetDefaultGender,
  geminiActive,
  apiKeys,
  onAddApiKey,
  onAddApiKeys,
  onRemoveApiKey,
  onToggleApiKey,
  onToggleAllApiKeys,
  onClearAllApiKeys,
  transcribeEngine,
  onSetTranscribeEngine,
  geminiModel,
  onSetGeminiModel,
  onOpenAiEngine,
}) => {
  const [newKeyInput, setNewKeyInput] = useState('');
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkKeysInput, setBulkKeysInput] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { valid: boolean; message: string }>>({});
  const [inputError, setInputError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const bulkDetectedKeys = React.useMemo(() => extractApiKeys(bulkKeysInput), [bulkKeysInput]);
  const bulkDetectedCount = bulkDetectedKeys.length;

  // Which models this key may actually call. Asked of Google rather than
  // hardcoded, because a baked-in catalogue goes stale and offering a model the
  // key cannot use is worse than offering none.
  const [models, setModels] = useState<GeminiModelItem[]>(DEFAULT_GEMINI_MODELS);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState('');

  const activeKeysCount = apiKeys.filter((k) => k.isActive).length;

  const loadModels = useCallback(async () => {
    const active = apiKeys.filter((k) => k.isActive).map((k) => k.key);
    if (active.length === 0) return;

    setIsLoadingModels(true);
    setModelError('');
    try {
      const response = await fetch('/api/gemini-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeys: active }),
      });

      // An older server has no such route and answers with the app's HTML.
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        setModelError('Server កំពុងដំណើរការកំណែចាស់។ សូម Restart កម្មវិធី។');
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        setModelError(data?.error || 'មិនអាចទាញយកបញ្ជីម៉ូដែលបានទេ។');
        return;
      }
      // The choices are fixed; only the availability check can fail, and that
      // is a note beside a working dropdown rather than an error replacing it.
      setModels(Array.isArray(data.models) ? data.models : []);
      setModelError(data.checked === false && data.error ? data.error : '');
    } catch {
      setModelError('មិនអាចទាក់ទងទៅ Server បានទេ។');
    } finally {
      setIsLoadingModels(false);
    }
  }, [apiKeys]);

  // Fetch once when Settings opens with a key present, so the list is there
  // without the user having to ask for it.
  useEffect(() => {
    if (isOpen && activeKeysCount > 0 && models.length === 0 && !isLoadingModels && !modelError) {
      loadModels();
    }
  }, [isOpen, activeKeysCount, models.length, isLoadingModels, modelError, loadModels]);

  if (!isOpen) return null;

  const handleAddKey = () => {
    const trimmedInput = newKeyInput.trim();
    if (!trimmedInput) {
      setInputError('សូមបញ្ចូល ឬបិទភ្ជាប់ Gemini API Key!');
      return;
    }
    if (trimmedInput.startsWith('ya29.')) {
      setInputError('អ្នកបានបញ្ចូល Google OAuth Token (ya29...)។ សូមប្រើប្រាស់ Gemini API Key (AIzaSy...) ដែលបង្កើតពី Google AI Studio (aistudio.google.com)។');
      return;
    }

    const extracted = extractApiKeys(trimmedInput);
    if (extracted.length === 0) {
      setInputError('ទ្រង់ទ្រាយ API Key មិនត្រឹមត្រូវ (ត្រូវចាប់ផ្តើមដោយ AIzaSy... ឬ AQ....) ដែលមានយ៉ាងតិច 20 តួអក្សរ');
      return;
    }

    const existingKeySet = new Set(apiKeys.map((k) => k.key.trim()));
    const uniqueNew = extracted.filter((k) => !existingKeySet.has(k));
    const duplicatesCount = extracted.length - uniqueNew.length;

    if (uniqueNew.length === 0) {
      setInputError(
        extracted.length === 1
          ? 'Key នេះមានក្នុងបញ្ជីរួចរាល់ហើយ!'
          : `Key ទាំង ${extracted.length} នេះមានក្នុងបញ្ជីរួចរាល់ហើយ!`
      );
      return;
    }

    if (onAddApiKeys) {
      onAddApiKeys(uniqueNew);
    } else {
      uniqueNew.forEach((k) => onAddApiKey(k));
    }

    setNewKeyInput('');
    setInputError('');

    if (duplicatesCount > 0) {
      setSuccessMessage(`បានបន្ថែម ${uniqueNew.length} Keys ថ្មីដោយជោគជ័យ! (រំលង ${duplicatesCount} Keys ដែលមានរួចហើយ)`);
    } else if (uniqueNew.length === 1) {
      setSuccessMessage('បានបន្ថែម 1 API Key ដោយជោគជ័យ!');
    } else {
      setSuccessMessage(`បានបន្ថែម ${uniqueNew.length} API Keys ដោយជោគជ័យ!`);
    }

    setTimeout(() => {
      setSuccessMessage('');
    }, 4500);
  };

  const handleSaveBulkKeys = () => {
    const trimmed = bulkKeysInput.trim();
    if (!trimmed) {
      setBulkError('Please enter or paste Gemini API Keys!');
      return;
    }
    const extracted = extractApiKeys(trimmed);
    if (extracted.length === 0) {
      setBulkError('No valid Gemini API Keys found (AIzaSy... or AQ.... with at least 20 chars).');
      return;
    }

    const existingKeySet = new Set(apiKeys.map((k) => k.key.trim()));
    const uniqueNew = extracted.filter((k) => !existingKeySet.has(k));
    const duplicatesCount = extracted.length - uniqueNew.length;

    if (uniqueNew.length === 0) {
      setBulkError(
        extracted.length === 1
          ? 'Key នេះមានក្នុងបញ្ជីរួចរាល់ហើយ!'
          : `Key ទាំង ${extracted.length} នេះមានក្នុងបញ្ជីរួចរាល់ហើយ!`
      );
      return;
    }

    if (onAddApiKeys) {
      onAddApiKeys(uniqueNew);
    } else {
      uniqueNew.forEach((k) => onAddApiKey(k));
    }

    setBulkKeysInput('');
    setBulkError('');
    setIsBulkOpen(false);

    if (duplicatesCount > 0) {
      setSuccessMessage(`បានបន្ថែម ${uniqueNew.length} Keys ថ្មីដោយជោគជ័យ! (រំលង ${duplicatesCount} Keys ដែលមានរួចហើយ)`);
    } else {
      setSuccessMessage(`បានបន្ថែម ${uniqueNew.length} API Keys ដោយជោគជ័យ!`);
    }

    setTimeout(() => {
      setSuccessMessage('');
    }, 4500);
  };

  const handleTestAllKeys = async () => {
    if (apiKeys.length === 0 || isTestingAll) return;
    setIsTestingAll(true);
    for (const item of apiKeys) {
      await handleTestKey(item.id, item.key);
    }
    setIsTestingAll(false);
  };

  const handleToggleAllActive = () => {
    const allActive = apiKeys.every((k) => k.isActive);
    if (onToggleAllApiKeys) {
      onToggleAllApiKeys(!allActive);
    } else {
      apiKeys.forEach((k) => {
        if (k.isActive === allActive) onToggleApiKey(k.id);
      });
    }
  };

  const handleTestKey = async (id: string, keyString: string) => {
    setTestingKeyId(id);
    try {
      // 1. Try Express backend server validation first
      const resp = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyString }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setTestResults((prev) => ({
          ...prev,
          [id]: { valid: !!data.valid, message: data.message || (data.valid ? 'Valid' : 'Invalid') },
        }));
        return;
      }
      throw new Error('Server returned non-200');
    } catch {
      // 2. If backend server is unreachable (e.g. standalone .exe / desktop build), fallback to direct Google Gemini REST API validation
      try {
        const directResult = await validateGeminiKeyDirect(keyString);
        setTestResults((prev) => ({
          ...prev,
          [id]: directResult,
        }));
      } catch (fallbackErr: any) {
        setTestResults((prev) => ({
          ...prev,
          [id]: { valid: false, message: fallbackErr?.message || 'មិនអាចតភ្ជាប់ទៅ Server ឬ Google API បានទេ' },
        }));
      }
    } finally {
      setTestingKeyId(null);
    }
  };


  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#0d1421] border border-[#1e2d45] rounded-sm overflow-hidden shadow-2xl flex flex-col font-mono text-xs max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#111a2a] border-b border-[#1c2a42] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">JAI DUBBER STUDIO SETTINGS</h3>
            <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-mono font-bold">
              v1.0.5
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-sm hover:bg-[#1a273d] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-4 text-slate-300 overflow-y-auto custom-scrollbar">
          {/* Gemini API Key Management Section */}
          <div className="bg-[#111928] border border-[#1c2a42] p-3.5 rounded-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-300 font-bold uppercase text-[11px]">
                <Key className="w-4 h-4 text-amber-400" />
                <span>GEMINI API KEYS MANAGER (គ្រប់គ្រង API KEYS)</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  openExternalUrl('https://aistudio.google.com/app/apikey');
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/50 hover:border-amber-400 rounded-sm text-[11px] font-bold transition-all shrink-0 shadow-sm group cursor-pointer active:scale-95"
                title="ចុចដើម្បីបើក Web Browser ទៅយក Gemini API Key ឥតគិតថ្លៃ"
              >
                <Key className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                <span className="font-khmer font-bold">យក KEY</span>
                <ExternalLink className="w-3 h-3 opacity-80 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 font-khmer leading-relaxed">
              អ្នកអាចរក្សាទុក <span className="text-cyan-300 font-bold">API Key ច្រើន</span>។ ពេលចុច
              <span className="text-emerald-400 font-bold"> Transcribe</span> លើវីដេអូ ប្រព័ន្ធនឹងបង្វិលប្រើ Key ទាំងនេះដោយស្វ័យប្រវត្តិ (Auto-Rotation) ប្រសិនបើ Key ណាមួយផុត Quota!
            </p>

            {/* Input to add single Key (Matching user Image 1) */}
            <div className="flex flex-col gap-2 bg-[#090f1a] p-2.5 border border-[#1c2a42] rounded-sm">
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Paste Gemini API Key (AIzaSy... or AQ.Ab8...)"
                  value={newKeyInput}
                  onChange={(e) => {
                    setNewKeyInput(e.target.value);
                    if (inputError) setInputError('');
                    if (successMessage) setSuccessMessage('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKey();
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-[#141f33] border border-[#223552] rounded-sm text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
                />
                <button
                  onClick={handleAddKey}
                  disabled={!newKeyInput.trim()}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-bold rounded-sm flex items-center gap-1.5 transition-all cursor-pointer text-xs shrink-0 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Key</span>
                </button>
              </div>

              {/* Status & Feedback */}
              {inputError && (
                <div className="text-red-400 text-[10px] font-khmer flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{inputError}</span>
                </div>
              )}
              {successMessage && (
                <div className="text-emerald-400 text-[10px] font-khmer flex items-center gap-1 bg-emerald-950/30 border border-emerald-500/30 px-2 py-1 rounded-sm">
                  <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
                  <span>{successMessage}</span>
                </div>
              )}
            </div>

            {/* List Header and Bulk Paste Toggle (Matching user Image 1 & Image 2) */}
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-slate-300 font-khmer">
                  បញ្ជី API KEYS ដែលបានរក្សាទុក ({apiKeys.length}):
                </div>

                <div className="flex items-center gap-2">
                  {!isBulkOpen ? (
                    <div className="flex items-center gap-2">
                      {apiKeys.length > 0 && (
                        <button
                          type="button"
                          onClick={handleTestAllKeys}
                          disabled={isTestingAll}
                          className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer text-[10px] font-khmer hover:underline mr-1 disabled:opacity-50"
                          title="តេស្តពិនិត្យមើល Keys ទាំងអស់ក្នុងពេលតែមួយ"
                        >
                          {isTestingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                          <span>តេស្តទាំងអស់</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setIsBulkOpen(true);
                          setBulkError('');
                        }}
                        className="px-2.5 py-1 bg-[#091220] hover:bg-cyan-950/40 text-cyan-400 border border-cyan-500 rounded-sm text-[11px] font-mono flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                      >
                        <List className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Bulk Paste Keys</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsBulkOpen(false);
                          setBulkKeysInput('');
                          setBulkError('');
                        }}
                        className="px-2.5 py-1 bg-[#091220] hover:bg-slate-800 text-cyan-400 border border-cyan-500 rounded-sm text-[11px] font-mono flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                      >
                        <List className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Cancel</span>
                      </button>

                      {apiKeys.length > 0 && onClearAllApiKeys && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('តើអ្នកប្រាកដជាចង់លុប API Keys ទាំងអស់នេះមែនទេ?')) {
                              onClearAllApiKeys();
                            }
                          }}
                          className="px-2.5 py-1 bg-red-950/30 hover:bg-red-900/40 text-red-400 border border-red-800/50 rounded-sm text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                          title="លុប Keys ទាំងអស់"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          <span>Clear All</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Bulk Paste Box (Image 2: Opened when Bulk Paste Keys is clicked) */}
              {isBulkOpen && (
                <div className="bg-[#090f1a] border border-[#1e2f4a] p-3 rounded-sm flex flex-col gap-2 shadow-inner animate-in fade-in duration-150">
                  <div className="text-[11px] text-slate-300 font-sans">
                    Paste Multiple Gemini API Keys (One per line or comma-separated):
                  </div>

                  <textarea
                    rows={4}
                    placeholder={`AIzaSyExampleKey1...\nAIzaSyExampleKey2...\nAIzaSyExampleKey3...`}
                    value={bulkKeysInput}
                    onChange={(e) => {
                      setBulkKeysInput(e.target.value);
                      if (bulkError) setBulkError('');
                    }}
                    className="w-full px-3 py-2 bg-[#121c2d] border border-[#223552] focus:border-cyan-400 rounded-sm text-white font-mono text-xs focus:outline-none custom-scrollbar leading-relaxed resize-y placeholder:text-slate-600"
                  />

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      {bulkError && (
                        <div className="text-red-400 text-[10px] font-khmer flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span>{bulkError}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {bulkDetectedCount > 0 && (
                        <span className="text-cyan-300 font-mono text-[10px] bg-cyan-950/70 border border-cyan-500/40 px-2 py-0.5 rounded font-bold">
                          {bulkDetectedCount} {bulkDetectedCount === 1 ? 'Key' : 'Keys'} Detected
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveBulkKeys}
                        disabled={!bulkKeysInput.trim()}
                        className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-bold rounded-sm flex items-center gap-1.5 text-xs transition-all cursor-pointer active:scale-95 shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{bulkDetectedCount > 1 ? `Add ${bulkDetectedCount} Keys` : 'Add Keys'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {apiKeys.length === 0 ? (
                <div className="p-3 bg-[#0a101b] border border-dashed border-[#1c2a42] rounded-sm text-center text-slate-500 text-[11px]">
                  ពុំទាន់មាន Custom API Key នៅឡើយទេ។ (ប្រើប្រាស់ System Server Key)
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {apiKeys.map((item, idx) => {
                    const maskedKey =
                      item.key.length > 10
                        ? `${item.key.substring(0, 6)}...${item.key.substring(item.key.length - 4)}`
                        : item.key;
                    const result = testResults[item.id];

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-sm border flex flex-col gap-1.5 transition-all ${
                          item.isActive
                            ? 'bg-[#121c2d] border-cyan-500/50 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                            : 'bg-[#0a101b] border-[#18263c] opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={item.isActive}
                              onChange={() => onToggleApiKey(item.id)}
                              className="accent-cyan-400 rounded-sm cursor-pointer w-3.5 h-3.5"
                              title="បើក/បិទ ការប្រើប្រាស់ Key នេះ"
                            />
                            <span className="font-bold text-white text-[11px]">
                              {item.name || `API Key #${idx + 1}`}
                            </span>
                            <span className="text-[10px] text-slate-400 bg-[#080d16] px-1.5 py-0.5 rounded-sm border border-[#1b2a40] font-mono">
                              {maskedKey}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Test Key */}
                            <button
                              onClick={() => handleTestKey(item.id, item.key)}
                              disabled={testingKeyId === item.id}
                              className="px-2 py-0.5 rounded-sm bg-[#17253b] border border-[#243754] text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50 text-[10px] flex items-center gap-1 cursor-pointer"
                              title="ពិនិត្យមើលថាតើ Key នេះដំណើរការឬទេ"
                            >
                              {testingKeyId === item.id ? (
                                <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                              ) : (
                                <ShieldCheck className="w-3 h-3 text-cyan-400" />
                              )}
                              <span>TEST</span>
                            </button>

                            {/* Delete Key */}
                            <button
                              onClick={() => onRemoveApiKey(item.id)}
                              className="p-1 rounded-sm bg-[#1f1723] hover:bg-red-950/60 border border-red-900/40 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                              title="លុប Key នេះ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Test Status Feedback */}
                        {result && (
                          <div
                            className={`text-[10px] px-2 py-1 rounded-sm flex items-center gap-1.5 ${
                              result.valid
                                ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300'
                                : 'bg-red-950/40 border border-red-500/40 text-red-300'
                            }`}
                          >
                            {result.valid ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            ) : (
                              <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                            )}
                            <span className="truncate">{result.message}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Default Voice Gender */}
          <div className="bg-[#111928] border border-[#1c2a42] p-3.5 rounded-sm flex flex-col gap-2">
            <div className="text-cyan-300 font-bold uppercase text-[11px] flex items-center justify-between">
              <span>DEFAULT VOICE PROFILE (សំឡេងលំនាំដើម)</span>
              {defaultGender === 'auto' && (
                <span className="text-[10px] text-amber-400 font-normal px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-500/30 font-mono">
                  ⚡ Auto Detect Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-khmer">
              ជ្រើសរើសសំឡេងលំនាំដើមសម្រាប់ការបកប្រែ និងការបង្កើតអត្ថបទថ្មី (Auto Detect នឹងចាប់សំឡេងប្រុស/ស្រីដោយស្វ័យប្រវត្តិតាមតួអង្គ)៖
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onSetDefaultGender('auto')}
                className={`py-2 px-3 rounded-sm border flex items-center justify-between transition-all cursor-pointer ${
                  defaultGender === 'auto'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold shadow-[0_0_10px_rgba(16,185,129,0.3)] ring-1 ring-emerald-400/50'
                    : 'bg-[#0f241d]/60 border-emerald-900/50 text-emerald-400/70 hover:text-emerald-300 hover:border-emerald-500/60'
                }`}
                title="ចាប់សម្លេងស្រី ឬ ប្រុសដោយស្វ័យប្រវត្តិតាមតួអង្គ (Auto Detect)"
              >
                <span>Auto Detect (ស្វ័យប្រវត្តិ)</span>
                {defaultGender === 'auto' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </button>

              <button
                type="button"
                onClick={() => onSetDefaultGender('male')}
                className={`py-2 px-3 rounded-sm border flex items-center justify-between transition-all cursor-pointer ${
                  defaultGender === 'male'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-bold shadow-[0_0_10px_rgba(56,189,248,0.3)] ring-1 ring-sky-400/50'
                    : 'bg-[#0b1b2d]/60 border-sky-900/50 text-sky-400/70 hover:text-sky-300 hover:border-sky-500/60'
                }`}
                title="កំណត់សំឡេងទាំងអស់ជាសំឡេងប្រុស (Piseth)"
              >
                <span>Piseth (ប្រុស)</span>
                {defaultGender === 'male' && <Check className="w-3.5 h-3.5 text-sky-400" />}
              </button>

              <button
                type="button"
                onClick={() => onSetDefaultGender('female')}
                className={`py-2 px-3 rounded-sm border flex items-center justify-between transition-all cursor-pointer ${
                  defaultGender === 'female'
                    ? 'bg-pink-500/20 border-pink-400 text-pink-300 font-bold shadow-[0_0_10px_rgba(244,114,182,0.3)] ring-1 ring-pink-400/50'
                    : 'bg-[#250d20]/60 border-pink-900/50 text-pink-400/70 hover:text-pink-300 hover:border-pink-500/60'
                }`}
                title="កំណត់សំឡេងទាំងអស់ជាសំឡេងស្រី (Sreymom)"
              >
                <span>Sreymom (ស្រី)</span>
                {defaultGender === 'female' && <Check className="w-3.5 h-3.5 text-pink-400" />}
              </button>
            </div>
          </div>

          {/* Transcription Engine */}
          <div className="bg-[#111928] border border-[#1c2a42] p-3.5 rounded-sm flex flex-col gap-2">
            <div className="text-cyan-300 font-bold uppercase text-[11px]">
              TRANSCRIBE ENGINE (ម៉ាស៊ីនស្រង់អត្ថបទ)
            </div>
            <p className="text-[11px] text-slate-400 font-khmer">
              ជ្រើសរើសវិធីស្រង់អត្ថបទពីសំឡេង។ បើ Timestamp មិនត្រូវនឹងវីដេអូ សូមសាកល្បងប្ដូរទៅម៉ាស៊ីនមួយទៀត៖
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => onSetTranscribeEngine('fast-whisper')}
                className={`py-2 px-3 rounded-sm border flex items-center justify-between transition-all cursor-pointer ${
                  transcribeEngine === 'fast-whisper'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                    : 'bg-[#152133] border-[#223552] text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Fast-Whisper</span>
                {transcribeEngine === 'fast-whisper' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
              </button>

              <button
                onClick={() => onSetTranscribeEngine('srt')}
                className={`py-2 px-3 rounded-sm border flex items-center justify-between transition-all cursor-pointer ${
                  transcribeEngine === 'srt'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                    : 'bg-[#152133] border-[#223552] text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Gemini SRT</span>
                {transcribeEngine === 'srt' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
              </button>
            </div>
          </div>

          {/* Gemini Model */}
          <div className="bg-[#111928] border border-[#1c2a42] p-3.5 rounded-sm flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-cyan-300 font-bold uppercase text-[11px]">
                CHOOSE GEMINI MODEL (ជ្រើសរើសម៉ូដែល)
              </div>
              <button
                onClick={loadModels}
                disabled={isLoadingModels || activeKeysCount === 0}
                className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 disabled:opacity-40 cursor-pointer flex items-center gap-1"
                title="ទាញយកបញ្ជីម៉ូដែលឡើងវិញ"
              >
                {isLoadingModels ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Refresh
              </button>
            </div>

            <p className="text-[11px] text-slate-400 font-khmer">
              ម៉ូដែលដែលជ្រើសរើសនឹងត្រូវប្រើមុនគេសម្រាប់ការស្រង់អត្ថបទ និងបកប្រែ។
            </p>

            {activeKeysCount === 0 ? (
              <p className="text-[11px] font-khmer text-amber-300">
                សូមបញ្ចូល Gemini API Key ជាមុនសិន ដើម្បីមើលបញ្ជីម៉ូដែល។
              </p>
            ) : (
              <>
                <select
                  value={geminiModel}
                  onChange={(e) => onSetGeminiModel(e.target.value)}
                  className="w-full bg-[#152133] border border-[#223552] text-cyan-200 rounded-sm px-2.5 py-2 text-xs font-mono focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  {/* The stored choice stays selectable even when the list has
                      not loaded, so opening Settings never silently changes it. */}
                  {models.length === 0 && <option value={geminiModel}>{geminiModel}</option>}
                  {models.length > 0 && !models.some((m) => m.id === geminiModel) && (
                    <option value={geminiModel}>{geminiModel} (saved)</option>
                  )}
                  {GEMINI_GROUPS.map((grp) => {
                    const groupModels = models.filter((m) => getModelGroup(m) === grp.key);
                    if (groupModels.length === 0) return null;
                    return (
                      <optgroup
                        key={grp.key}
                        label={grp.label}
                        className="bg-[#0b1320] text-cyan-300 font-bold font-mono"
                      >
                        {groupModels.map((model) => (
                          <option
                            key={model.id}
                            value={model.id}
                            className="bg-[#152133] text-slate-100 font-normal py-1"
                          >
                            {model.displayName || model.id}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>

                {modelError && (
                  <p className="text-[11px] font-khmer text-amber-300">{modelError}</p>
                )}
              </>
            )}

            <div className="flex items-center justify-between border-t border-[#1c2a42] pt-2 mt-1 text-[11px]">
              <span className="text-slate-400">Edge TTS Neural Voices:</span>
              <span className="text-emerald-400 font-bold">km-KH (Khmer) Active</span>
            </div>
          </div>

          {/* AI ENGINE & HARDWARE ACCELERATION CARD */}
          <div className="bg-[#121c2c] border border-cyan-500/30 rounded-sm p-3.5 flex flex-col gap-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <Cpu className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                    AI ENGINE & HARDWARE ACCELERATION
                  </h4>
                  <p className="text-[10px] text-slate-400">Demucs Vocal Separation & Whisper Engine</p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30 font-bold">
                Local Engine
              </span>
            </div>

            <p className="text-[11px] font-khmer text-slate-300 leading-relaxed">
              គ្រប់គ្រងម៉ាស៊ីន AI (Demucs AI សម្រាប់បំបែកសំឡេងច្រៀង និង Fast-Whisper) រួមទាំងការពិនិត្យ PyTorch GPU Acceleration (CUDA)។
            </p>

            <button
              type="button"
              onClick={() => {
                onClose();
                if (onOpenAiEngine) onOpenAiEngine();
              }}
              className="w-full py-2 px-3 rounded-sm bg-gradient-to-r from-[#0e2a44] to-[#13395c] hover:from-[#13395c] hover:to-[#1a4a75] border border-cyan-500/50 text-cyan-200 hover:text-white font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-98"
            >
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>បើកផ្ទាំងគ្រប់គ្រង AI Engine (Open AI Engine Manager)</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#111a2a] border-t border-[#1c2a42] p-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-sm bg-cyan-500 hover:bg-cyan-400 text-black font-bold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
