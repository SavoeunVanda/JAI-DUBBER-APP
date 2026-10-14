import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { VideoPlayer } from './components/VideoPlayer';
import { SubtitleGrid } from './components/SubtitleGrid';
import { TimelineEditor } from './components/TimelineEditor';
import { StyleInspectorPanel } from './components/StyleInspectorPanel';
import { ExportModal } from './components/ExportModal';
import { SettingsModal } from './components/SettingsModal';
import { AutoDubbingModal } from './components/AutoDubbingModal';
import { AiEngineModal } from './components/AiEngineModal';
import { LicenseModal, LicenseStatus } from './components/LicenseModal';
import { UpdateModal } from './components/UpdateModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { SubtitleSegment, SubtitleStyle, DemoVideo, GeminiApiKeyConfig, TextOverlayItem, BlurBoxItem, ImageOverlayItem } from './types';
import { SAMPLE_VIDEOS } from './data/sampleProjects';
import { parseSRTContent, generateSRTContent, formatTimeCode, smartAlignTimelineSegments } from './utils/timeFormat';
import { extractAudioFromVideo } from './utils/audioExtractor';
import { computeAutoSpeed, availableVocalSeconds } from './utils/autoSpeed';
import { transcribeGeminiDirect, synthesizeKhmerTTSDirect } from './utils/clientAiFallback';
import { cleanKhmerDialogueText } from './utils/khmerCleaner';
import { detectSegmentGender, detectAllSegmentsGender } from './utils/genderDetector';

export default function App() {
  // Toast Notification State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message?: string,
    duration: number = 3000
  ) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, title, message, duration }]);
  };

  // Stable identity: ToastContainer receives this on every render, and an
  // unstable callback there would restart each toast's dismiss countdown.
  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  // Current active sample video or custom uploaded video
  const [currentVideo, setCurrentVideo] = useState<DemoVideo>({
    id: '',
    title: '',
    titleKhmer: '',
    videoUrl: '',
    duration: 0,
    aspectRatio: '16:9',
    defaultSubtitles: [],
  });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [originalVideoPath, setOriginalVideoPath] = useState<string>('');
  const [isPreparingVideo, setIsPreparingVideo] = useState<boolean>(false);
  const [preparingMessage, setPreparingMessage] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');

  // Helper: Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // Subtitle Data & Styling
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);

  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(() => {
    try {
      const saved = localStorage.getItem('jai_dubber_subtitle_style');
      if (saved) {
        const parsed = JSON.parse(saved);
        const rawFont = (parsed.fontFamily || 'Battambang').trim();
        const cleanFont =
          rawFont.toLowerCase() === 'battambong'
            ? 'Battambang'
            : rawFont;
        return {
          ...parsed,
          fontFamily: cleanFont || 'Battambang',
          // Ensure defaults for covering Chinese subtitles
          yPercent: parsed.yPercent !== undefined ? parsed.yPercent : 70,
          xPercent: parsed.xPercent !== undefined ? parsed.xPercent : 50,
          widthPercent: parsed.widthPercent || 88,
          bgColor: parsed.bgColor || '#000000',
          bgOpacity: parsed.bgOpacity !== undefined ? parsed.bgOpacity : 100,
        };
      }
    } catch {}
    return {
      fontFamily: 'Battambang',
      fontSize: 15,
      color: '#facc15', // Yellow accent
      styleType: 'box',
      position: 'bot',
      xPercent: 50,
      yPercent: 70, // Exactly over original Chinese subtitles in drama (70%)
      widthPercent: 88, // Wide enough to cover original Chinese subtitles cleanly
      bgColor: '#000000',
      bgOpacity: 100, // Solid mask so Chinese text never shows through
      maxLines: 2,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem('jai_dubber_subtitle_style', JSON.stringify(subtitleStyle));
    } catch {}
  }, [subtitleStyle]);

  // Audio & Vocal Remover Settings (Default to Muted sound)
  const [isMuteOriginalVocals, setIsMuteOriginalVocals] = useState<boolean>(true);
  const [vocalRemoverMode, setVocalRemoverMode] = useState<'mute_original' | 'mute_vocal'>(() => {
    try {
      const saved = localStorage.getItem('jai_dubber_vocal_remover_mode');
      if (saved === 'mute_original' || saved === 'mute_vocal') return saved;
    } catch {}
    return 'mute_original';
  });
  const [isolatedBgmPath, setIsolatedBgmPath] = useState<string | null>(null);
  const [isolatedBgmUrl, setIsolatedBgmUrl] = useState<string | null>(null);
  const [isSeparatingVocals, setIsSeparatingVocals] = useState<boolean>(false);
  const vocalSepAbortRef = useRef<AbortController | null>(null);
  const [bgmMixLevel, setBgmMixLevel] = useState<number>(20);
  const [activeGender, setActiveGender] = useState<'auto' | 'male' | 'female'>(() => {
    try {
      const saved = localStorage.getItem('jai_dubber_default_gender');
      if (saved === 'auto' || saved === 'male' || saved === 'female') return saved;
    } catch {}
    return 'auto';
  });

  // Stored Gemini API Keys
  const [apiKeys, setApiKeys] = useState<GeminiApiKeyConfig[]>(() => {
    try {
      const saved = localStorage.getItem('jai_dubber_gemini_api_keys');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('jai_dubber_gemini_api_keys', JSON.stringify(apiKeys));
    } catch (e) {
      console.error('Failed to save API keys to localStorage:', e);
    }
  }, [apiKeys]);

  const handleAddApiKey = (key: string, name?: string) => {
    handleAddApiKeys([key]);
  };

  const handleAddApiKeys = (keys: string[]) => {
    setApiKeys((prev) => {
      const existingSet = new Set(prev.map((k) => k.key.trim()));
      const uniqueNew = keys
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && !existingSet.has(k));

      if (uniqueNew.length === 0) return prev;

      let currentTotal = prev.length;
      const newConfigs: GeminiApiKeyConfig[] = uniqueNew.map((k) => {
        currentTotal += 1;
        return {
          id: `key-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: `Gemini Key ${currentTotal}`,
          key: k,
          isActive: true,
          addedAt: Date.now(),
        };
      });

      return [...newConfigs, ...prev];
    });
  };

  const handleRemoveApiKey = (id: string) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const handleToggleApiKey = (id: string) => {
    setApiKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, isActive: !k.isActive } : k))
    );
  };

  const handleToggleAllApiKeys = (active: boolean) => {
    setApiKeys((prev) => prev.map((k) => ({ ...k, isActive: active })));
  };

  const handleClearAllApiKeys = () => {
    setApiKeys([]);
  };

  // Timeline & UI State
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  // Which transcription strategy the server should run. 'srt' asks Gemini for
  // finished, self-timed subtitle blocks; 'measured' has ffmpeg locate the
  // speech and lets Gemini fill in only the words. They fail differently, so
  // the choice is kept where it can be changed per job.
  const [transcribeEngine, setTranscribeEngine] = useState<'fast-whisper' | 'srt'>(() => {
    try {
      const saved = localStorage.getItem('jai_dubber_transcribe_engine');
      if (saved === 'srt') return 'srt';
      return 'fast-whisper';
    } catch {
      return 'fast-whisper';
    }
  });

  // Which Gemini model to try first. Chosen in Settings; the built-in list
  // stays behind it as fallback so a retired model cannot lose a whole job.
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('jai_dubber_gemini_model');
      if (stored && stored.trim()) {
        return stored.trim();
      }
      return 'gemini-3.5-flash';
    } catch {
      return 'gemini-3.5-flash';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('jai_dubber_gemini_model', geminiModel);
    } catch (e) {
      console.error('Failed to save Gemini model preference:', e);
    }
  }, [geminiModel]);

  useEffect(() => {
    try {
      localStorage.setItem('jai_dubber_transcribe_engine', transcribeEngine);
    } catch (e) {
      console.error('Failed to save transcribe engine preference:', e);
    }
  }, [transcribeEngine]);
  // Live per-chunk progress reported by the /api/transcribe NDJSON stream.
  const [transcribeProgress, setTranscribeProgress] = useState<{
    stage: string;
    chunkIndex: number;
    totalChunks: number;
    /** Label of the API key currently in use, if the server has reported one. */
    keyLabel?: string;
    /** Model currently in use. Switches by itself when one runs out of quota. */
    model?: string;
  } | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isAutoDubbingOpen, setIsAutoDubbingOpen] = useState<boolean>(false);
  const [autoDubbingInitialTab, setAutoDubbingInitialTab] = useState<'config' | 'console'>('config');
  const [isAiEngineModalOpen, setIsAiEngineModalOpen] = useState<boolean>(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [serverStatus, setServerStatus] = useState<string>('Ready');
  const [geminiActive, setGeminiActive] = useState<boolean>(true);

  // License Management State
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [isLicenseChecking, setIsLicenseChecking] = useState<boolean>(true);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState<boolean>(false);

  // Check License on Application Load & Heartbeat Live Sync
  useEffect(() => {
    const checkLicense = () => {
      fetch('/api/license/status')
        .then((r) => r.json())
        .then((data: LicenseStatus) => {
          setLicenseStatus(data);
          if (!data.isActivated) {
            setIsLicenseModalOpen(true);
          }
        })
        .catch((err) => {
          console.warn('License status check error:', err);
        })
        .finally(() => {
          setIsLicenseChecking(false);
        });
    };

    checkLicense();

    // Re-verify when user switches back to the app window
    window.addEventListener('focus', checkLicense);

    // Heartbeat every 60 seconds
    const interval = setInterval(checkLicense, 60000);

    return () => {
      window.removeEventListener('focus', checkLicense);
      clearInterval(interval);
    };
  }, []);

  // Multi Text Overlays State & Active Tab
  const [textOverlays, setTextOverlays] = useState<TextOverlayItem[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Multi Blur Boxes State
  const [blurBoxes, setBlurBoxes] = useState<BlurBoxItem[]>([]);
  const [selectedBlurId, setSelectedBlurId] = useState<string | null>(null);

  const handleAddTextOverlay = () => {
    const newId = 'text_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const count = textOverlays.length;
    const newItem: TextOverlayItem = {
      id: newId,
      text: count === 0 ? 'អក្សរលើវីដេអូ (Text Overlay)' : `អក្សរលើវីដេអូ ${count + 1}`,
      fontFamily: subtitleStyle?.fontFamily || 'Battambang',
      x: 50,
      y: Math.min(80, 20 + (count * 8) % 40),
      xPercent: 50,
      yPercent: Math.min(80, 20 + (count * 8) % 40),
      fontSize: 22,
      color: '#ffffff',
      bgColor: 'rgba(0, 0, 0, 0.65)',
      hasBg: true,
      widthPercent: 60,
      borderRadius: 8,
      feather: 0,
      rotation: 0,
      opacity: 100,
    };
    setTextOverlays((prev) => [...prev, newItem]);
    setSelectedTextId(newId);
    setSelectedBlurId(null);
    setSelectedSubId(null);
  };

  const handleUpdateTextOverlay = (id: string, updates: Partial<TextOverlayItem>) => {
    setTextOverlays((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, ...updates };
        if (updates.x !== undefined && updates.xPercent === undefined) updated.xPercent = updates.x;
        if (updates.y !== undefined && updates.yPercent === undefined) updated.yPercent = updates.y;
        if (updates.xPercent !== undefined && updates.x === undefined) updated.x = updates.xPercent;
        if (updates.yPercent !== undefined && updates.y === undefined) updated.y = updates.yPercent;
        return updated;
      })
    );
  };

  const handleDeleteTextOverlay = (id: string) => {
    setTextOverlays((prev) => prev.filter((t) => t.id !== id));
    if (selectedTextId === id) setSelectedTextId(null);
  };

  const handleAddBlurBox = () => {
    const newId = 'blur_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const count = blurBoxes.length;
    const initialY = Math.min(80, 35 + (count * 6) % 30);
    const newBox: BlurBoxItem = {
      id: newId,
      x: 50,
      y: initialY,
      xPercent: 50,
      yPercent: initialY,
      width: 30,
      height: 18,
      widthPercent: 30,
      heightPercent: 18,
      blurAmount: 14,
      borderRadius: 16,
      feather: 0,
      rotation: 0,
      opacity: 100,
    };
    setBlurBoxes((prev) => [...prev, newBox]);
    setSelectedBlurId(newId);
    setSelectedTextId(null);
    setSelectedSubId(null);
  };

  const handleUpdateBlurBox = (id: string, updates: Partial<BlurBoxItem>) => {
    setBlurBoxes((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const updated = { ...b, ...updates };
        if (updates.x !== undefined && updates.xPercent === undefined) updated.xPercent = updates.x;
        if (updates.y !== undefined && updates.yPercent === undefined) updated.yPercent = updates.y;
        if (updates.xPercent !== undefined && updates.x === undefined) updated.x = updates.xPercent;
        if (updates.yPercent !== undefined && updates.y === undefined) updated.y = updates.yPercent;
        if (updates.width !== undefined && updates.widthPercent === undefined) updated.widthPercent = updates.width;
        if (updates.height !== undefined && updates.heightPercent === undefined) updated.heightPercent = updates.height;
        if (updates.widthPercent !== undefined && updates.width === undefined) updated.width = updates.widthPercent;
        if (updates.heightPercent !== undefined && updates.height === undefined) updated.height = updates.heightPercent;
        return updated;
      })
    );
  };

  const handleDeleteBlurBox = (id: string) => {
    setBlurBoxes((prev) => prev.filter((b) => b.id !== id));
    if (selectedBlurId === id) setSelectedBlurId(null);
  };

  // Multi Image Overlays State
  const [imageOverlays, setImageOverlays] = useState<ImageOverlayItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const handleAddImageOverlay = (fileOrItem: File | ImageOverlayItem) => {
    // If it's already an ImageOverlayItem passed from VideoPlayer
    if (fileOrItem && typeof fileOrItem === 'object' && 'imageUrl' in fileOrItem && fileOrItem.imageUrl) {
      const item = fileOrItem as ImageOverlayItem;
      setImageOverlays((prev) => {
        if (prev.some((i) => i.id === item.id)) return prev;
        return [...prev, item];
      });
      setSelectedImageId(item.id);
      setSelectedTextId(null);
      setSelectedBlurId(null);
      setSelectedSubId(null);
      showToast('success', 'បានបញ្ចូល Image Overlay លើវីដេអូរួចរាល់');
      return;
    }

    // If it's a File or Blob instance
    if (fileOrItem && (fileOrItem instanceof Blob || ('name' in fileOrItem && 'size' in fileOrItem))) {
      const file = fileOrItem as File;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) return;
        const newId = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const count = imageOverlays.length;
        const initialY = Math.min(80, 25 + (count * 10) % 40);
        const newImg: ImageOverlayItem = {
          id: newId,
          imageUrl: dataUrl,
          name: file.name || 'Image Overlay',
          x: 50,
          y: initialY,
          xPercent: 50,
          yPercent: initialY,
          width: 30,
          widthPercent: 30,
          borderRadius: 8,
          feather: 0,
          rotation: 0,
          opacity: 100,
        };
        setImageOverlays((prev) => [...prev, newImg]);
        setSelectedImageId(newId);
        setSelectedTextId(null);
        setSelectedBlurId(null);
        setSelectedSubId(null);
        showToast('success', 'បានបញ្ចូល Image Overlay លើវីដេអូរួចរាល់');
      };
      reader.readAsDataURL(fileOrItem as Blob);
    }
  };

  const handleUpdateImageOverlay = (id: string, updates: Partial<ImageOverlayItem>) => {
    setImageOverlays((prev) =>
      prev.map((img) => {
        if (img.id !== id) return img;
        const updated = { ...img, ...updates };
        if (updates.x !== undefined && updates.xPercent === undefined) updated.xPercent = updates.x;
        if (updates.y !== undefined && updates.yPercent === undefined) updated.yPercent = updates.y;
        if (updates.xPercent !== undefined && updates.x === undefined) updated.x = updates.xPercent;
        if (updates.yPercent !== undefined && updates.y === undefined) updated.y = updates.yPercent;
        if (updates.width !== undefined && updates.widthPercent === undefined) updated.widthPercent = updates.width;
        if (updates.height !== undefined && updates.heightPercent === undefined) updated.heightPercent = updates.height;
        if (updates.widthPercent !== undefined && updates.width === undefined) updated.width = updates.widthPercent;
        if (updates.heightPercent !== undefined && updates.height === undefined) updated.height = updates.heightPercent;
        return updated;
      })
    );
  };

  const handleDeleteImageOverlay = (id: string) => {
    setImageOverlays((prev) => prev.filter((img) => img.id !== id));
    if (selectedImageId === id) setSelectedImageId(null);
  };


  // Active audio elements cache for TTS playback
  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const activePlayingSubIdRef = useRef<string | null>(null);

  // Helper to stop all currently playing TTS audio tracks across the app
  const stopAllAudio = () => {
    audioCacheRef.current.forEach((audio) => {
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
    activePlayingSubIdRef.current = null;
  };

  // Synchronize TTS audio playback with Video Player timeline (currentTime & isPlaying)
  useEffect(() => {
    if (!isPlaying) {
      audioCacheRef.current.forEach((audio) => {
        if (!audio.paused) {
          audio.pause();
        }
      });
      activePlayingSubIdRef.current = null;
      return;
    }

    // Get sorted active checked subtitles
    const activeSubs = subtitles
      .filter((s) => s.isChecked !== false && s.text.trim().length > 0)
      .sort((a, b) => a.startTime - b.startTime);

    if (activeSubs.length === 0) {
      audioCacheRef.current.forEach((a) => {
        if (!a.paused) {
          a.pause();
          a.currentTime = 0;
        }
      });
      activePlayingSubIdRef.current = null;
      return;
    }

    // Calculate vocalEnd for each active subtitle segment
    const activeSubsWithVocalEnd = activeSubs.map((s, idx) => {
      // Look for the next segment by the same voice to prevent same-voice collision while allowing overlapping dialogue
      const nextSameVoice = activeSubs.slice(idx + 1).find(
        (other) => other.voiceProfile === s.voiceProfile && other.startTime > s.startTime
      );
      const maxAllowedVocalEnd = nextSameVoice ? nextSameVoice.startTime : (duration || 99999);
      const playRate = Math.min(Math.max(s.ttsSpeed || s.speed || 1.0, 0.5), 2.5);

      const audio = audioCacheRef.current.get(s.id);
      const audioDur = audio?.duration || s.audioDuration;
      let vocalEnd = s.endTime;

      if (audioDur && isFinite(audioDur) && audioDur > 0) {
        const vocalDurOnTimeline = audioDur / playRate;
        vocalEnd = Math.min(maxAllowedVocalEnd, Math.max(s.endTime, s.startTime + vocalDurOnTimeline));
      } else {
        vocalEnd = Math.min(maxAllowedVocalEnd, Math.max(s.endTime, s.startTime + (s.endTime - s.startTime)));
      }

      return { sub: s, vocalEnd, playRate };
    });

    // Find all active segments at currentTime (supports simultaneous overlapping speech / cross-talk!)
    const activeItems = activeSubsWithVocalEnd.filter(
      (item) => currentTime >= item.sub.startTime && currentTime < item.vocalEnd && item.sub.audioUrl
    );
    const activeItemIds = new Set(activeItems.map((it) => it.sub.id));

    // Pause all audio tracks that are NOT currently active
    audioCacheRef.current.forEach((a, id) => {
      if (!activeItemIds.has(id) && !a.paused) {
        a.pause();
        a.currentTime = 0;
      }
    });

    // Play/sync all active audio tracks simultaneously
    activeItems.forEach((activeItem) => {
      const currentSub = activeItem.sub;
      let audio = audioCacheRef.current.get(currentSub.id);
      if (!audio) {
        audio = new Audio(currentSub.audioUrl);
        audio.preload = 'auto';
        audio.onloadedmetadata = () => {
          if (audio?.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
            handleUpdateSegment(currentSub.id, { audioDuration: audio.duration });
          }
        };
        audioCacheRef.current.set(currentSub.id, audio);
      }

      const playRate = activeItem.playRate;
      audio.playbackRate = playRate;

      const offset = Math.max(0, currentTime - currentSub.startTime);
      const targetAudioTime = offset * playRate;
      const audioHasEnded =
        (audio.duration && targetAudioTime >= audio.duration) || currentTime >= activeItem.vocalEnd;

      if (audioHasEnded) {
        if (!audio.paused) {
          audio.pause();
        }
      } else if (audio.paused) {
        // If playhead entered segment naturally (offset < 0.45s), start from 0.0s for clean phonemes
        if (offset < 0.45) {
          audio.currentTime = 0;
        } else {
          audio.currentTime = targetAudioTime;
        }

        audio.play().catch((e) => {
          console.warn('Playback error for TTS audio:', e);
        });
      } else {
        // Only adjust if user manually scrubbed timeline with significant drift (> 0.6s)
        if (Math.abs(audio.currentTime - targetAudioTime) > 0.6) {
          audio.currentTime = targetAudioTime;
        }
      }
    });
  }, [currentTime, isPlaying, subtitles, duration]);

  // Preload generated audio in background for zero-latency start
  useEffect(() => {
    subtitles.forEach((s) => {
      if (s.audioUrl && !audioCacheRef.current.has(s.id)) {
        const audio = new Audio(s.audioUrl);
        audio.preload = 'auto';
        audio.onloadedmetadata = () => {
          if (audio?.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
            handleUpdateSegment(s.id, { audioDuration: audio.duration });
          }
        };
        audioCacheRef.current.set(s.id, audio);
      }
    });
  }, [subtitles]);

  // Check backend server status on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') {
          setServerStatus('Active');
          setGeminiActive(data.geminiActive);
        }
      })
      .catch(() => {
        setServerStatus('Fallback (Web)');
      });
  }, []);

  // Keyboard shortcut: Spacebar to Play / Pause video
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Run Demucs AI Vocal Separation immediately when Mute Vocal Only is selected
  const runImmediateVocalSeparation = async (customFile?: File | null, customPath?: string) => {
    const targetPath = customPath !== undefined
      ? customPath
      : (originalVideoPath || (uploadedFile as any)?.path || currentVideo?.originalPath || '');
    const targetFile = customFile !== undefined ? customFile : uploadedFile;

    if (!targetPath && !targetFile) {
      return;
    }

    if (vocalSepAbortRef.current) {
      try {
        vocalSepAbortRef.current.abort();
      } catch {}
    }

    const controller = new AbortController();
    vocalSepAbortRef.current = controller;
    setIsSeparatingVocals(true);

    showToast(
      'info',
      '🎤 Demucs AI កំពុងលុបសំឡេងនិយាយដើម...',
      'កំពុងបំបែកសំឡេងមនុស្សចេញ និងរក្សាទុកភ្លេង BGM & SFX ដោយស្វ័យប្រវត្តិ...',
      4000
    );

    try {
      let resp: Response;
      if (targetPath) {
        resp = await fetch('/api/separate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoPath: targetPath, device: 'auto' }),
          signal: controller.signal,
        });
      } else {
        const formData = new FormData();
        formData.append('video', targetFile as File);
        formData.append('device', 'auto');
        resp = await fetch('/api/separate-audio', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
      }

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || 'Demucs separation failed');
      }

      const data = await resp.json();
      if (data.ok && data.outputBgm) {
        const bgmUrl = data.bgmUrl || `/api/local-file?path=${encodeURIComponent(data.outputBgm)}`;
        setIsolatedBgmPath(data.outputBgm);
        setIsolatedBgmUrl(bgmUrl);
        showToast(
          'success',
          '🎤 លុបសំឡេងនិយាយដើមរួចរាល់!',
          'ឥឡូវនេះវីដេអូរក្សាទុកតែសំឡេងភ្លេង BGM & SFX ប៉ុណ្ណោះ។',
          4000
        );
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn('Immediate Demucs separation error:', err);
      showToast(
        'warning',
        'ការបំបែកសំឡេងជួបបញ្ហា',
        err?.message || 'សូមពិនិត្យមើល AI Engine (Demucs) ក្នុងផ្ទាំង AI Engine។',
        4500
      );
    } finally {
      if (vocalSepAbortRef.current === controller) {
        setIsSeparatingVocals(false);
        vocalSepAbortRef.current = null;
      }
    }
  };

  // Immediate handler for the 2-option AI Vocal Remover buttons (Mute Original vs Mute Vocal Only)
  const handleSelectVocalRemoverMode = (mode: 'mute_original' | 'mute_vocal') => {
    setVocalRemoverMode(mode);
    setIsMuteOriginalVocals(true);
    try {
      localStorage.setItem('jai_dubber_vocal_remover_mode', mode);
      localStorage.setItem('jai_dubber_export_use_demucs', mode === 'mute_vocal' ? 'true' : 'false');
    } catch {}

    if (mode === 'mute_original') {
      if (vocalSepAbortRef.current) {
        try {
          vocalSepAbortRef.current.abort();
        } catch {}
        vocalSepAbortRef.current = null;
      }
      setIsSeparatingVocals(false);
      showToast(
        'info',
        '🔇 Mute Original',
        'បានបិទសំឡេងវីដេអូដើមទាំងស្រុងភ្លាមៗ (ឮតែសំឡេងបញ្ចូលខ្មែរ)',
        2500
      );
    } else {
      // mode === 'mute_vocal'
      if (isolatedBgmPath && isolatedBgmUrl) {
        showToast(
          'success',
          '🎤 Mute Vocal Only',
          'បានបើកសំឡេងភ្លេង BGM & SFX ភ្លាមៗ (លុបសំឡេងនិយាយដើម)',
          2500
        );
      } else {
        const hasVideo = Boolean(originalVideoPath || (uploadedFile as any)?.path || currentVideo?.originalPath || uploadedFile);
        if (hasVideo) {
          runImmediateVocalSeparation();
        } else {
          showToast(
            'info',
            '🎤 Mute Vocal Only',
            'បានជ្រើសរើសមុខងារលុបតែសំឡេងនិយាយ (នឹងដំណើរការភ្លាមពេលដាក់វីដេអូ)',
            2500
          );
        }
      }
    }
  };

  // Handle video selection
  const handleSelectSampleVideo = (demo: DemoVideo) => {
    if (vocalSepAbortRef.current) {
      try {
        vocalSepAbortRef.current.abort();
      } catch {}
      vocalSepAbortRef.current = null;
    }
    setIsSeparatingVocals(false);
    setIsolatedBgmPath(null);
    setIsolatedBgmUrl(null);
    setUploadedFile(null);
    setOriginalVideoPath('');
    setCurrentVideo(demo);
    setVideoUrl(demo.videoUrl);
    setAspectRatio(demo.aspectRatio);
    setDuration(demo.duration);
    setCurrentTime(0);
    setIsPlaying(false);
    setSubtitles(
      demo.defaultSubtitles.map((sub, index) => ({
        ...sub,
        id: `sub-${index + 1}-${Date.now()}`,
        isChecked: true,
      }))
    );
  };

  // Upload custom video file: Instant 0-second load without conversion!
  // Video plays immediately; metadata is loaded instantly by browser.
  // Full conversion happens ONLY when exporting the final video.
  const handleUploadCustomVideo = (file: File) => {
    // 1. Pause any active playback & reset time/duration
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    if (vocalSepAbortRef.current) {
      try {
        vocalSepAbortRef.current.abort();
      } catch {}
      vocalSepAbortRef.current = null;
    }
    setIsSeparatingVocals(false);
    setIsolatedBgmPath(null);
    setIsolatedBgmUrl(null);

    // 2. Free old blob memory if replacing an existing video
    if (videoUrl && videoUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(videoUrl);
      } catch {}
    }

    setUploadedFile(file);
    const localPath = (file as any).path || '';
    setOriginalVideoPath(localPath || '');
    setSubtitles([]);
    setIsPreparingVideo(false);
    setPreparingMessage('');

    if (vocalRemoverMode === 'mute_vocal') {
      runImmediateVocalSeparation(file, localPath || '');
    }

    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const nonBrowserContainers = [
      '.mkv', '.avi', '.ts', '.m2ts', '.mts', '.flv', '.f4v',
      '.wmv', '.3gp', '.3g2', '.vob', '.ogv', '.rmvb', '.rm', '.asf', '.divx'
    ];
    const isNonBrowser = nonBrowserContainers.includes(fileExt);

    if (isNonBrowser) {
      // Non-standard container formats (MKV, AVI, WMV, TS, FLV, VOB, RMVB, 3GP):
      // Automatically prepare an H.264 preview proxy so it plays seamlessly in Chromium HTML5 player
      setCurrentVideo({
        id: `custom-${Date.now()}`,
        title: file.name,
        category: 'Uploaded Video',
        duration: 0,
        aspectRatio: '16:9',
        videoUrl: '',
        originalPath: localPath,
        defaultSubtitles: [],
      });
      handlePrepareProxy(file);
      return;
    }

    // Standard containers (MP4, MOV, WebM, M4V):
    // Instant 0-second load! If encoded in HEVC/unsupported codec, player will auto-generate proxy on-the-fly.
    const initialUrl = localPath
      ? `/api/local-file?path=${encodeURIComponent(localPath)}`
      : URL.createObjectURL(file);

    setVideoUrl(initialUrl);
    setCurrentVideo({
      id: `custom-${Date.now()}`,
      title: file.name,
      category: 'Uploaded Video',
      duration: 0,
      aspectRatio: '16:9',
      videoUrl: initialUrl,
      originalPath: localPath,
      defaultSubtitles: [],
    });

    showToast('info', 'បានផ្ទុកវីដេអូថ្មី', `បានប្ដូរមកវីដេអូ: ${file.name}`, 3000);
  };

  // Optional Proxy conversion: Called automatically for non-browser video formats or on codec decode error
  const handlePrepareProxy = async (file: File) => {
    const localPath = (file as any)?.path || '';
    setIsPreparingVideo(true);
    setPreparingMessage('កំពុងរៀបចំ Video Preview Proxy ស្វ័យប្រវត្តិ...');

    try {
      const form = new FormData();
      if (localPath) {
        form.append('videoPath', localPath);
      } else {
        form.append('video', file, file.name);
      }

      const res = await fetch('/api/prepare-preview', {
        method: 'POST',
        body: form,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.previewUrl) {
          setVideoUrl(data.previewUrl);
          if (data.duration > 0) setDuration(data.duration);
          if (data.aspectRatio) setAspectRatio(data.aspectRatio);
          if (data.originalPath) setOriginalVideoPath(data.originalPath);

          setCurrentVideo((prev) => ({
            ...prev,
            duration: data.duration || prev.duration,
            aspectRatio: data.aspectRatio || prev.aspectRatio,
            videoUrl: data.previewUrl,
            originalPath: data.originalPath || localPath,
          }));

          showToast(
            'info',
            'វីដេអូរួចរាល់សម្រាប់ការ Preview',
            'បានបម្លែង H.264 Proxy សម្រាប់ Preview រួចរាល់',
            3000
          );
        }
      }
    } catch (err) {
      console.warn('Proxy generation warning:', err);
    } finally {
      setIsPreparingVideo(false);
      setPreparingMessage('');
    }
  };

  // Add new blank subtitle row
  const handleAddSegment = () => {
    const newStart = subtitles.length > 0 ? subtitles[subtitles.length - 1].endTime + 0.2 : 0;
    const newEnd = newStart + 4.0;
    const defaultGenderForNew: 'male' | 'female' = activeGender === 'female' ? 'female' : 'male';
    const newSeg: SubtitleSegment = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      startTime: Number(newStart.toFixed(2)),
      endTime: Number(newEnd.toFixed(2)),
      text: 'បញ្ចូលអត្ថបទរត់ខ្មែរនៅទីនេះ...',
      voiceProfile: defaultGenderForNew === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural',
      gender: defaultGenderForNew,
      speed: 1.0,
      isChecked: true,
    };
    setSubtitles((prev) => [...prev, newSeg]);
  };

  // Deep Acoustic Pitch & Voice Gender Detection (Listens directly to audio waveforms F0)
  const runAcousticPitchDetection = async (
    targetSubs: Array<{
      id?: string | number;
      startTime?: number;
      endTime?: number;
      text?: string;
      meaning?: string;
      originalText?: string;
    }>
  ) => {
    const localVideo =
      originalVideoPath ||
      (uploadedFile as any)?.path ||
      (currentVideo as any)?.originalPath ||
      currentVideo?.videoUrl;

    if (!localVideo || targetSubs.length === 0) return;

    showToast(
      'info',
      '🎵 កំពុងស្ដាប់រលកសំឡេងដើម (Acoustic Pitch Detection)...',
      'ប្រព័ន្ធ AI កំពុងស្ដាប់ប្រេកង់រលកសំឡេង (F0) ផ្ទាល់ពីវីដេអូដើម ដើម្បីកំណត់សម្លេងប្រុស/ស្រី...',
      4000
    );

    try {
      const resp = await fetch('/api/detect-audio-genders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: localVideo,
          segments: targetSubs.map((s) => ({
            id: s.id,
            startTime: s.startTime,
            endTime: s.endTime,
            text: s.text,
            meaning: s.meaning,
            originalText: s.originalText,
          })),
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.ok && Array.isArray(data.detected) && data.detected.length > 0) {
          const resultMap = new Map<string, { gender: 'male' | 'female'; voiceProfile: string; pitchHz?: number }>();
          for (const item of data.detected) {
            resultMap.set(String(item.id), item);
          }

          let femaleCount = 0;
          let maleCount = 0;

          setSubtitles((prev) =>
            prev.map((s) => {
              const match = resultMap.get(String(s.id));
              if (match) {
                if (match.gender === 'female') femaleCount++;
                else maleCount++;
                return {
                  ...s,
                  gender: match.gender,
                  voiceProfile: match.voiceProfile,
                };
              }
              return s;
            })
          );

          showToast(
            'success',
            '✨ ស្ដាប់រលកសំឡេងជោគជ័យ!',
            `បានកំណត់តាមរលកសំឡេងជាក់ស្ដែង: សំឡេងស្រី (${femaleCount}) | សំឡេងប្រុស (${maleCount})`,
            5000
          );
        }
      }
    } catch (err: any) {
      console.warn('Acoustic pitch detection error (kept linguistic fallback):', err);
    }
  };

  // Switch voice profile gender (Auto Detect, Male, Female)
  const handleToggleGender = async (g: 'auto' | 'male' | 'female') => {
    setActiveGender(g);
    try {
      localStorage.setItem('jai_dubber_default_gender', g);
    } catch {}

    if (g === 'male') {
      setSubtitles((prev) =>
        prev.map((s) => ({
          ...s,
          voiceProfile: 'km-KH-PisethNeural',
          gender: 'male',
        }))
      );
    } else if (g === 'female') {
      setSubtitles((prev) =>
        prev.map((s) => ({
          ...s,
          voiceProfile: 'km-KH-SreymomNeural',
          gender: 'female',
        }))
      );
    } else if (g === 'auto') {
      const linguistic = detectAllSegmentsGender<SubtitleSegment>(subtitles, { forceRecompute: true });
      setSubtitles(linguistic);
      await runAcousticPitchDetection(linguistic);
    }
  };

  // Update subtitle segment details
  const handleUpdateSegment = (id: string, updates: Partial<SubtitleSegment>) => {
    setSubtitles((prev) => {
      const updated = prev
        .map((s) => (s.id === id ? { ...s, ...updates } : s))
        .sort((a, b) => a.startTime - b.startTime);

      // Moving a row changes how much room its vocal has before the next one,
      // or generating/measuring audio requires fitting the vocal to the timestamp.
      if (
        updates.startTime === undefined &&
        updates.endTime === undefined &&
        updates.audioDuration === undefined
      ) {
        return updated;
      }

      return updated.map((seg, idx) => {
        if (!seg.audioDuration || seg.audioDuration <= 0) return seg;

        const safeSpeed = computeAutoSpeed(
          seg.audioDuration,
          availableVocalSeconds(seg, updated[idx + 1], duration)
        );
        if (safeSpeed === seg.ttsSpeed && safeSpeed === seg.speed) return seg;
        return { ...seg, ttsSpeed: safeSpeed, speed: safeSpeed };
      });
    });
  };

  // Delete segment
  const handleDeleteSegment = (id: string) => {
    setSubtitles((prev) => prev.filter((s) => s.id !== id));
  };

  // Move segment up/down
  const handleMoveSegment = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === subtitles.length - 1)
    ) {
      return;
    }
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const newSubs = [...subtitles];
    const temp = newSubs[index];
    newSubs[index] = newSubs[targetIdx];
    newSubs[targetIdx] = temp;
    setSubtitles(newSubs);
  };

  // Check / Uncheck segments
  const handleToggleCheckSegment = (id: string) => {
    setSubtitles((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isChecked: !s.isChecked } : s))
    );
  };

  const handleToggleCheckAll = (check: boolean) => {
    setSubtitles((prev) => prev.map((s) => ({ ...s, isChecked: check })));
  };

  // Synthesize Edge TTS audio for a segment
  const handleGenerateTTS = async (segment: SubtitleSegment, playPreview = false) => {
    if (!segment.text || segment.text.trim().length === 0) return;

    if (playPreview) {
      if (isPlaying) {
        setIsPlaying(false);
      }
    }

    if (segment.audioUrl && playPreview) {
      const existingAudio = audioCacheRef.current.get(segment.id);
      
      // Toggle off if currently playing
      if (existingAudio && !existingAudio.paused && existingAudio.currentTime > 0) {
        stopAllAudio();
        return;
      }

      // Always stop all playing audio tracks before starting a new preview
      stopAllAudio();

      let audio = existingAudio;
      if (!audio) {
        audio = new Audio(segment.audioUrl);
        audioCacheRef.current.set(segment.id, audio);
      }
      
      audio.currentTime = 0;
      const segDuration = Math.max(0.05, segment.endTime - segment.startTime);
      if (audio.duration && isFinite(audio.duration) && segDuration > 0) {
        const targetRate = audio.duration / segDuration;
        audio.playbackRate = Math.min(Math.max(targetRate, 1.0), 2.5);
      } else if (segment.ttsSpeed || segment.speed) {
        audio.playbackRate = Math.min(Math.max(segment.ttsSpeed || segment.speed || 1.0, 0.5), 2.5);
      }
      
      audio.play().catch(() => {});
      return;
    }

    handleUpdateSegment(segment.id, { isGenerating: true });

    try {
      let audioUrl = '';
      let audioDuration = 0;

      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: segment.text,
            voice: segment.voiceProfile,
            speed: segment.speed,
          }),
        });

        if (!response.ok) {
          throw new Error('Server TTS failed');
        }

        const blob = await response.blob();
        audioUrl = URL.createObjectURL(blob);
        try {
          const ab = await blob.arrayBuffer();
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            try {
              const decoded = await ctx.decodeAudioData(ab);
              if (decoded && Number.isFinite(decoded.duration) && decoded.duration > 0) {
                audioDuration = decoded.duration;
              }
            } finally {
              ctx.close().catch(() => {});
            }
          }
        } catch {
          // fallback to HTMLAudio below
        }
      } catch (serverErr) {
        console.warn('Backend TTS server not reachable (e.g. standalone .exe), attempting direct client fallback:', serverErr);
        const directBlob = await synthesizeKhmerTTSDirect(segment.text);
        audioUrl = URL.createObjectURL(directBlob);
        try {
          const ab = await directBlob.arrayBuffer();
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            try {
              const decoded = await ctx.decodeAudioData(ab);
              if (decoded && Number.isFinite(decoded.duration) && decoded.duration > 0) {
                audioDuration = decoded.duration;
              }
            } finally {
              ctx.close().catch(() => {});
            }
          }
        } catch {}
      }

      const audio = new Audio(audioUrl);
      audioCacheRef.current.set(segment.id, audio);

      let hasPlayedPreview = false;
      const triggerPreviewPlay = () => {
        if (playPreview && !hasPlayedPreview) {
          hasPlayedPreview = true;
          stopAllAudio();
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }
      };

      // If AudioContext already measured exact duration, use it; otherwise fallback to HTMLAudio
      if (!(audioDuration > 0)) {
        audioDuration = await new Promise<number>((resolve) => {
          let settled = false;
          const finish = (value: number) => {
            if (settled) return;
            settled = true;
            resolve(Number.isFinite(value) && value > 0 ? value : 0);
          };

          if (audio.readyState >= 1) {
            finish(audio.duration);
            return;
          }
          audio.onloadedmetadata = () => finish(audio.duration);
          audio.onerror = () => finish(0);
          setTimeout(() => finish(audio.duration), 8000);
        });
      }

      // Speed is deliberately NOT set here. It is applied once, after every
      // vocal has been generated, so the grid never shows a value derived from
      // a partial set of measurements.
      handleUpdateSegment(segment.id, {
        audioUrl,
        ...(audioDuration > 0 ? { audioDuration } : {}),
        isGenerating: false,
      });

      if (playPreview) {
        triggerPreviewPlay();
      }
    } catch (error) {
      console.error('Error generating TTS:', error);
      handleUpdateSegment(segment.id, { isGenerating: false });
      showToast('error', 'មិនអាចបង្កើតសំឡេងបានទេ!', 'សូមពិនិត្យមើលការភ្ជាប់អ៊ីនធឺណិត');
    }
  };

  const [isGeneratingAllTTS, setIsGeneratingAllTTS] = useState<boolean>(false);
  const stopTtsGenRef = useRef<boolean>(false);

  const handleStopGenerateTTS = () => {
    stopTtsGenRef.current = true;
    setIsGeneratingAllTTS(false);
    showToast('info', 'បានបញ្ឈប់ការបង្កើតសំឡេង', 'ដំណើរការបង្កើតសំឡេងត្រូវបានបញ្ឈប់។');
  };

  // Batch generate Edge TTS for checked segments
  const handleGenerateAllTTS = async () => {
    if (isGeneratingAllTTS) {
      handleStopGenerateTTS();
      return;
    }

    const toGen = subtitles.filter((s) => s.isChecked && s.text.trim().length > 0);
    if (toGen.length === 0) {
      showToast('warning', 'សូមជ្រើសរើសបន្ទាត់អត្ថបទ!', 'សូមគូសធីកលើបន្ទាត់អត្ថបទដើម្បីបង្កើតសំឡេង។');
      return;
    }

    stopTtsGenRef.current = false;
    setIsGeneratingAllTTS(true);
    showToast('info', 'កំពុងដំណើរការបង្កើតសំឡេង...', `កំពុងបង្កើតសំឡេងចំនួន ${toGen.length} បន្ទាត់ (ម្ដង ៥ បន្ទាត់)...`);

    const BATCH_SIZE = 5;
    let completed = 0;
    try {
      for (let i = 0; i < toGen.length; i += BATCH_SIZE) {
        if (stopTtsGenRef.current) {
          break;
        }
        const chunk = toGen.slice(i, i + BATCH_SIZE);
        await Promise.all(chunk.map((seg) => handleGenerateTTS(seg, false)));
        completed += chunk.length;
      }
    } finally {
      setIsGeneratingAllTTS(false);
      handleAutoSpeedAdjust();
      if (!stopTtsGenRef.current) {
        showToast('success', 'បង្កើតសំឡេងរួចរាល់!', `បានបង្កើតសំឡេង និងកំណត់ Speed Auto ចំនួន ${completed} បន្ទាត់ជោគជ័យ។`);
      }
      stopTtsGenRef.current = false;
    }
  };

  const transcribeAbortControllerRef = useRef<AbortController | null>(null);

  const handleStopTranscribe = () => {
    if (transcribeAbortControllerRef.current) {
      transcribeAbortControllerRef.current.abort();
      transcribeAbortControllerRef.current = null;
    }
    setIsTranscribing(false);
  };

  /**
   * Resolves the video to transcribe into a real File. The server does its own
   * ffmpeg extraction, so the browser never decodes or base64-encodes anything.
   */
  const resolveVideoFile = async (signal: AbortSignal): Promise<File | null> => {
    if (uploadedFile) return uploadedFile;
    if (videoUrl) {
      const res = await fetch(videoUrl, { signal });
      if (!res.ok) throw new Error(`មិនអាចទាញយកវីដេអូបានទេ (${res.status})`);
      const blob = await res.blob();
      return new File([blob], 'video.mp4', { type: blob.type || 'video/mp4' });
    }
    return null;
  };

  /**
   * A short, safe name for the key at `index` in the active-key list.
   *
   * The key itself is never shown. It is a live credential, and this string
   * lands in screenshots and screen shares — the name the user gave it, or a
   * masked tail, identifies which key is in play without leaking it.
   */
  const describeApiKey = (index: number): string => {
    const active = apiKeys.filter((k) => k.isActive);
    const config = active[index];
    if (!config) return `#${index + 1}`;
    if (config.name && config.name.trim()) return config.name.trim();
    const key = config.key || '';
    return key.length > 8 ? `…${key.slice(-6)}` : `#${index + 1}`;
  };

  /**
   * One server row -> one grid segment. Shared by the live per-chunk updates and
   * the final result, so a row cannot change shape depending on how it arrived.
   */
  const toSubtitleSegment = (row: any, idx: number): SubtitleSegment => {
    const detectedGender = detectSegmentGender(row, { forceRecompute: true });
    const effectiveGender: 'male' | 'female' = activeGender === 'auto' ? detectedGender : activeGender;
    const voiceProfile: 'km-KH-PisethNeural' | 'km-KH-SreymomNeural' =
      effectiveGender === 'female' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural';

    return {
      id: `ai-sub-${idx + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startTime: row.startTime,
      endTime: row.endTime,
      text: cleanKhmerDialogueText(row.text || row.originalText || ''),
      originalText: row.originalText || '',
      meaning: row.meaning || (effectiveGender === 'female' ? 'តួស្រី' : 'តួប្រុស'),
      voiceProfile,
      gender: effectiveGender,
      speed: 1.0,
      isChecked: true,
    };
  };

  /**
   * Reads the NDJSON stream from /api/transcribe, forwarding progress frames and
   * returning the terminal ("done" or "error") frame.
   */
  const readTranscribeStream = async (
    response: Response,
    onProgress: (frame: any) => void
  ): Promise<any> => {
    if (!response.body) throw new Error('ម៉ាស៊ីនមេមិនបានឆ្លើយតបជាមួយទិន្នន័យទេ');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let terminal: any = null;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const frame = JSON.parse(trimmed);
        if (frame.type === 'progress') onProgress(frame);
        else terminal = frame;
      } catch {
        /* ignore a partial frame rather than failing the whole job */
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    handleLine(buffer + decoder.decode());
    return terminal;
  };

  /**
   * Transcribe the loaded video's dialogue into timed Khmer subtitles.
   *
   * Timings are produced server-side from the audio itself, so rows arrive
   * already aligned to speech and are applied verbatim.
   */
  const handleTranscribeAI = async () => {
    const controller = new AbortController();
    transcribeAbortControllerRef.current = controller;
    setIsTranscribing(true);
    setSubtitles([]);
    setTranscribeProgress({ stage: 'preparing', chunkIndex: 0, totalChunks: 0 });

    try {
      const activeKeys = apiKeys.filter((k) => k.isActive).map((k) => k.key);
      if (activeKeys.length === 0 && !geminiActive) {
        setIsSettingsModalOpen(true);
        throw new Error(
          'រកមិនឃើញ API Key ដែលកំពុងសកម្មទេ។ សូមបញ្ចូល Gemini API Key នៅក្នុង Settings ជាមុនសិន។'
        );
      }

      const videoFile = await resolveVideoFile(controller.signal);
      if (!videoFile) {
        throw new Error(
          'រកមិនឃើញឯកសារវីដេអូទេ។ សូម Upload វីដេអូជាមុនសិន ដើម្បីឱ្យ AI ស្ដាប់សំឡេងក្នុងវីដេអូ។'
        );
      }

      const form = new FormData();
      const localPath = (videoFile as any)?.path || originalVideoPath || '';
      if (localPath) {
        form.append('videoPath', localPath);
      }
      form.append('video', videoFile, videoFile.name || 'video.mp4');
      form.append('apiKeys', JSON.stringify(activeKeys));
      form.append('videoTitle', currentVideo.title || '');
      form.append('sourceLanguage', 'auto');
      // 'fast-whisper' uses Fast-Whisper + Gemini Story Analysis; 'srt' uses direct Gemini SRT.
      form.append('engine', transcribeEngine);
      form.append('model', geminiModel);

      let terminal: any = null;
      let serverReachable = true;

      try {
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: form,
          signal: controller.signal,
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('json')) {
          // An HTML error page or proxy interstitial: treat as unreachable.
          throw new Error(`ម៉ាស៊ីនមេមានបញ្ហា (${response.status})`);
        }

        // Rows from a finished chunk are shown straight away. On a long video
        // the alternative is an empty grid for several minutes while work that
        // is already done waits for the rest.
        let streamed: SubtitleSegment[] = [];
        terminal = await readTranscribeStream(response, (frame) => {
          // A key change is orthogonal to which stage the job is in, so it
          // updates only that field and leaves the rest of the progress alone.
          if (frame.stage === 'key') {
            const keyLabel = describeApiKey(frame.keyIndex ?? 0);
            const model = frame.model;
            setTranscribeProgress((prev) =>
              prev
                ? { ...prev, keyLabel, model }
                : { stage: 'preparing', chunkIndex: 0, totalChunks: 0, keyLabel, model }
            );
            return;
          }

          setTranscribeProgress((prev) => ({
            ...(prev || {}),
            stage: frame.stage,
            // With chunks in flight together, how many have FINISHED is the
            // meaningful number; which one this frame refers to is not.
            chunkIndex: frame.completed ?? frame.batch ?? 0,
            totalChunks: frame.batches ?? 0,
          }));

          if (frame.stage === 'chunkDone' && Array.isArray(frame.rows) && frame.rows.length > 0) {
            // Accumulate rows in memory; display on timeline only when Transcribe and Analyze are completely finished
            streamed = [...streamed, ...frame.rows.map(toSubtitleSegment)].sort(
              (a, b) => a.startTime - b.startTime
            );
          }
        });
      } catch (serverErr: any) {
        if (serverErr.name === 'AbortError') throw serverErr;
        console.warn('Transcribe server unreachable, trying direct client mode:', serverErr);
        serverReachable = false;
      }

      // Offline/standalone fallback: no server ffmpeg, so this path asks Gemini
      // for timings and is less precise. Used only when the server is absent.
      if (!serverReachable) {
        setTranscribeProgress({ stage: 'extracting', chunkIndex: 0, totalChunks: 1 });
        const extracted = await extractAudioFromVideo(videoFile);
        if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');

        setTranscribeProgress({ stage: 'transcribing', chunkIndex: 0, totalChunks: 1 });
        const directSubs = await transcribeGeminiDirect({
          prompt: 'Transcribe and translate dialogue into 100% standard Khmer script for dubbing.',
          mediaData: extracted.base64,
          mimeType: extracted.mimeType,
          apiKeys: activeKeys,
          videoDuration: duration || extracted.duration,
          currentTitle: currentVideo.title,
          signal: controller.signal,
        });

        if (!directSubs || directSubs.length === 0) {
          throw new Error('AI មិនបានរកឃើញការសន្ទនាណាមួយក្នុងវីដេអូនេះទេ។');
        }

        // No auto speed here: no vocals have been generated yet, so there is
        // nothing measured to base a speed on.
        setSubtitles(directSubs);
        showToast(
          'success',
          'បកប្រែជោគជ័យ (Direct Client Mode)!',
          `បានស្រង់អត្ថបទខ្មែរចំនួន ${directSubs.length} បន្ទាត់តាម Direct API។`
        );
        return;
      }

      // A failed job returns no subtitles, so the existing timeline is untouched.
      if (!terminal || terminal.type === 'error') {
        throw new Error(terminal?.error || 'មិនទទួលបានអត្ថបទ Subtitle ពី AI ទេ។');
      }

      const returned: any[] = Array.isArray(terminal.subtitles) ? terminal.subtitles : [];
      if (returned.length === 0) {
        throw new Error('មិនទទួលបានអត្ថបទ Subtitle ពី AI ទេ។');
      }

      // Rows arrive with measured timings and a resolved voice profile; they are
      // used as-is. No client-side re-alignment, which would only degrade them.
      const generated: SubtitleSegment[] = returned.map(toSubtitleSegment);

      // Speeds stay at 1.0x until the vocals exist and can be measured.
      setSubtitles(generated);

      const skipped = terminal.emptyUtterances || 0;
      showToast(
        'success',
        'បកប្រែ & Auto Detect សំឡេងជោគជ័យ!',
        // One row is one sentence by one speaker, assembled from the fragments
        // detection found — so the two counts differ, and both are worth seeing.
        `បានស្រង់អត្ថបទខ្មែរចំនួន ${generated.length} ប្រយោគ (មួយប្រយោគ = មួយជួរ) ` +
          `ពីសំឡេងដែលរកឃើញ ${terminal.utteranceCount} កំណាត់` +
          (skipped > 0 ? `, រំលង ${skipped} កំណាត់គ្មានសំដី` : '') +
          `។`
      );
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Transcription aborted by user');
        return;
      }
      console.error('AI Transcription error:', error);
      showToast(
        'error',
        'ការបកប្រែ AI មានបញ្ហា!',
        error.message || 'សូមពិនិត្យមើល API Key ក្នុង Setting'
      );
    } finally {
      transcribeAbortControllerRef.current = null;
      setIsTranscribing(false);
      setTranscribeProgress(null);
    }
  };

  const handleImportSRTFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        const parsed = parseSRTContent(content);
        if (parsed.length > 0) {
          let newSubs: SubtitleSegment[] = parsed.map((p, idx) => ({
            ...p,
            text: cleanKhmerDialogueText(p.text),
            id: `srt-${idx + 1}-${Date.now()}`,
            isChecked: true,
          }));
          if (activeGender === 'auto') {
            newSubs = detectAllSegmentsGender(newSubs, { forceRecompute: true });
            runAcousticPitchDetection(newSubs);
          } else if (activeGender === 'female') {
            newSubs = newSubs.map((s) => ({ ...s, gender: 'female', voiceProfile: 'km-KH-SreymomNeural' }));
          } else {
            newSubs = newSubs.map((s) => ({ ...s, gender: 'male', voiceProfile: 'km-KH-PisethNeural' }));
          }
          setSubtitles(newSubs);
          showToast('success', 'នាំចូល SRT ជោគជ័យ!', `បានអានអត្ថបទចំនួន ${parsed.length} បន្ទាត់។`);
        } else {
          showToast('error', 'មិនអាចអានឯកសារ SRT បានទេ!', 'សូមពិនិត្យទ្រង់ទ្រាយឯកសារ .srt របស់អ្នក');
        }
      }
    };
    reader.readAsText(file);
  };

  // Export SRT
  const handleExportSRT = () => {
    const srtData = generateSRTContent(subtitles);
    const blob = new Blob([srtData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JAI_DUBBER_${currentVideo.title.replace(/\s+/g, '_')}.srt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'ទាញយក SRT ជោគជ័យ!', 'ឯកសារ SRT ត្រូវបានរក្សាទុកក្នុងកុំព្យូទ័ររបស់អ្នក។');
  };

  // Clear all subtitle data
  const handleClearData = () => {
    if (confirm('តើអ្នកប្រាកដជាចង់លុបទិន្នន័យអត្ថបទទាំងអស់ឬ?')) {
      setSubtitles([]);
      showToast('info', 'បានសម្អាតទិន្នន័យ!', 'អត្ថបទ Subtitle ទាំងអស់ត្រូវបានលុប។');
    }
  };

  // Auto Speed Adjust: ទាល់តែ speed លើសពី 2x ទើបបន្ថែមប្រវែង vocal (cap speed ត្រឹម 2.0x) តែប្រវែង segment text ដាក់តាម time start, end ដ៏ដែល និងមិនឱ្យហួសចូលទៅ segment បន្ទាប់ឡើយ
  /**
   * Sets each row's playback speed so its generated vocal fits the time the row
   * occupies.
   *
   * This runs only on MEASURED audio. Rows with no vocal yet are left alone
   * rather than given a speed guessed from how many characters they contain —
   * that guess was calibrated for Latin text, and Khmer spreads one syllable
   * over several codepoints, so it read far too long and inflated the speeds.
   * A column of confident-looking numbers that no vocal had informed is worse
   * than a column of 1.0x.
   */
  const handleAutoSpeedAdjust = (options?: { notify?: boolean }) => {
    if (options?.notify) {
      const withAudio = subtitles.filter((s) => s.audioDuration && s.audioDuration > 0).length;
      if (withAudio === 0) {
        showToast(
          'warning',
          'មិនទាន់មានសំឡេងទេ!',
          'សូមបង្កើតសំឡេង (Generate Voice) ជាមុនសិន។ Auto Speed គណនាតាមប្រវែងសំឡេងពិតប្រាកដ។'
        );
        return;
      }
      const missing = subtitles.length - withAudio;
      if (missing > 0) {
        showToast(
          'info',
          'បានកំណត់ Speed ដោយផ្នែក',
          `បានគណនា ${withAudio} បន្ទាត់។ រំលង ${missing} បន្ទាត់ដែលមិនទាន់មានសំឡេង។`
        );
      }
    }

    setSubtitles((prev) => {
      const sorted = [...prev].sort((a, b) => a.startTime - b.startTime);
      return sorted.map((seg, idx) => {
        // No vocal, no measurement, no speed.
        const vocalDuration = seg.audioDuration && seg.audioDuration > 0 ? seg.audioDuration : 0;
        if (vocalDuration <= 0) return seg;

        // The room is the gap to the NEXT row, not this row's own end. A vocal
        // longer than its subtitle is fine and stays at natural speed.
        const safeSpeed = computeAutoSpeed(
          vocalDuration,
          availableVocalSeconds(seg, sorted[idx + 1], duration)
        );

        return {
          ...seg,
          speed: safeSpeed,
          ttsSpeed: safeSpeed,
        };
      });
    });
  };

  // Fit & Auto Align Timeline (Fixes overlaps, sorts chronologically, ensures natural segment durations)
  const handleFitTimeline = () => {
    setSubtitles((prev) => {
      if (prev.length === 0) return prev;
      const aligned = smartAlignTimelineSegments(prev, duration || 0);
      showToast('success', 'តម្រឹម Timeline ជោគជ័យ!', 'អត្ថបទ Subtitle ទាំងអស់ត្រូវបានតម្រៀបតាមលំដាប់ និងលុបការត្រួតស៊ីគ្នា (Overlap)។');
      return aligned;
    });
  };

  // Snap selected subtitle segment to current video playhead
  const handleSnapToPlayhead = () => {
    if (!selectedSubId) {
      showToast('info', 'សូមជ្រើសរើស Subtitle', 'សូមចុចលើបន្ទាត់ Subtitle ណាមួយនៅលើ Table ឬ Timeline ជាមុនសិន។');
      return;
    }
    setSubtitles((prev) =>
      prev.map((s) => {
        if (s.id !== selectedSubId) return s;
        const dur = Math.max(1.0, s.endTime - s.startTime);
        const newStart = Number(currentTime.toFixed(2));
        const newEnd = Number((newStart + dur).toFixed(2));
        return {
          ...s,
          startTime: newStart,
          endTime: duration > 0 ? Math.min(duration, newEnd) : newEnd,
        };
      })
    );
    showToast('success', 'បានកំណត់តាម Playhead!', `Subtitle ត្រូវបានផ្លាស់ទីទៅកាន់ ${formatTimeCode(currentTime)}`);
  };

  // Shift timestamps offset
  const handleShiftTime = (offset: number) => {
    setSubtitles((prev) =>
      prev.map((seg) => ({
        ...seg,
        startTime: Math.max(0, Number((seg.startTime + offset).toFixed(2))),
        endTime: Math.max(0.5, Number((seg.endTime + offset).toFixed(2))),
      }))
    );
  };

  // Split segment at current playhead position
  const handleSplitSegment = () => {
    const targetIdx = subtitles.findIndex(
      (s) => currentTime > s.startTime && currentTime < s.endTime
    );
    if (targetIdx !== -1) {
      const target = subtitles[targetIdx];
      const midTime = Number(currentTime.toFixed(2));

      const firstHalf: SubtitleSegment = {
        ...target,
        endTime: midTime,
      };
      const secondHalf: SubtitleSegment = {
        ...target,
        id: `sub-split-${Date.now()}`,
        startTime: midTime,
        text: target.text,
      };

      const updated = [...subtitles];
      updated.splice(targetIdx, 1, firstHalf, secondHalf);
      setSubtitles(updated);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = 'copy';
        } catch {}
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          const isVideo =
            file.type.startsWith('video/') ||
            /\.(mp4|mkv|mov|avi|webm|ts|m2ts|mts|flv|f4v|m4v|wmv|3gp|3g2|vob|ogv|rmvb|rm|asf|divx)$/i.test(file.name);
          if (isVideo) {
            handleUploadCustomVideo(file);
          }
        }
      }}
      className="flex flex-col h-screen w-screen bg-[#070b12] text-slate-100 overflow-hidden font-sans"
    >
      {/* Top Cyber Navigation Bar */}
      <Header
        serverStatus={serverStatus}
        geminiActive={geminiActive}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenAutoDubbing={() => {
          setAutoDubbingInitialTab('config');
          setIsAutoDubbingOpen(true);
        }}
        onOpenAiEngine={() => setIsAiEngineModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenLicense={() => setIsLicenseModalOpen(true)}
        onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
        licenseStatus={licenseStatus}
      />

      {/* Central Workspace: Left Sidebar + Subtitle Data Grid & Timeline */}
      <div className="flex-1 flex overflow-hidden p-2 gap-2">
        {/* Left Sidebar Video Player & Styling Tools */}
        <VideoPlayer
          videoUrl={videoUrl}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          aspectRatio={aspectRatio}
          subtitles={subtitles}
          subtitleStyle={subtitleStyle}
          isMuteOriginalVocals={isMuteOriginalVocals}
          bgmMixLevel={bgmMixLevel}
          selectedSubId={selectedSubId}
          onSelectSubId={setSelectedSubId}
          onPlayPause={() => setIsPlaying(!isPlaying)}
          onTimeUpdate={setCurrentTime}
          onDurationChange={setDuration}
          onAspectRatioChange={setAspectRatio}
          onSelectSampleVideo={handleSelectSampleVideo}
          onUploadCustomVideo={handleUploadCustomVideo}
          isPreparingVideo={isPreparingVideo}
          preparingMessage={preparingMessage}
          onRetryPreparePreview={() => uploadedFile && handlePrepareProxy(uploadedFile)}
          onUpdateSubtitleStyle={(st) => setSubtitleStyle((prev) => ({ ...prev, ...st }))}
          onToggleMuteVocals={() => setIsMuteOriginalVocals(!isMuteOriginalVocals)}
          vocalRemoverMode={vocalRemoverMode}
          onSelectVocalRemoverMode={handleSelectVocalRemoverMode}
          isolatedBgmUrl={isolatedBgmUrl}
          isSeparatingVocals={isSeparatingVocals}
          onChangeBgmMix={setBgmMixLevel}
          onExportSRT={handleExportSRT}
          onClearData={handleClearData}
          onUpdateSubtitleText={(id, text) => handleUpdateSegment(id, { text })}
          textOverlays={textOverlays}
          onUpdateTextOverlays={setTextOverlays}
          selectedTextId={selectedTextId}
          onSelectTextId={(id) => {
            setSelectedTextId(id);
            if (id) {
              setSelectedBlurId(null);
              setSelectedSubId(null);
            }
          }}
          onUpdateTextOverlay={handleUpdateTextOverlay}
          onAddTextOverlay={handleAddTextOverlay}
          onDeleteTextOverlay={handleDeleteTextOverlay}
          blurBoxes={blurBoxes}
          onUpdateBlurBoxes={setBlurBoxes}
          selectedBlurId={selectedBlurId}
          onSelectBlurId={(id) => {
            setSelectedBlurId(id);
            if (id) {
              setSelectedTextId(null);
              setSelectedSubId(null);
            }
          }}
          onUpdateBlurBox={handleUpdateBlurBox}
          onAddBlurBox={handleAddBlurBox}
          onDeleteBlurBox={handleDeleteBlurBox}
          imageOverlays={imageOverlays}
          onUpdateImageOverlays={setImageOverlays}
          selectedImageId={selectedImageId}
          onSelectImageId={(id) => {
            setSelectedImageId(id);
            if (id) {
              setSelectedTextId(null);
              setSelectedBlurId(null);
              setSelectedSubId(null);
            }
          }}
          onUpdateImageOverlay={handleUpdateImageOverlay}
          onAddImageOverlay={handleAddImageOverlay}
          onDeleteImageOverlay={handleDeleteImageOverlay}
        />

        {/* Center Main Panel: Subtitle Data Grid + Timeline Editor */}
        <main className="flex-1 flex flex-col gap-2 overflow-hidden min-w-0">
          {/* Top: Subtitle Data Grid */}
          <SubtitleGrid
            subtitles={subtitles}
            currentTime={currentTime}
            isTranscribing={isTranscribing}
            transcribeProgress={transcribeProgress}
            activeGender={activeGender}
            onToggleGender={handleToggleGender}
            onUpdateSegment={handleUpdateSegment}
            onDeleteSegment={handleDeleteSegment}
            onAddSegment={handleAddSegment}
            onImportSRTFile={handleImportSRTFile}
            onTranscribeAI={handleTranscribeAI}
            onStopTranscribe={handleStopTranscribe}
            onGenerateTTS={handleGenerateTTS}
            onGenerateAllTTS={handleGenerateAllTTS}
            isGeneratingTTS={isGeneratingAllTTS}
            onStopGenerateTTS={handleStopGenerateTTS}
            onSelectSegment={(id, time) => {
              setSelectedSubId(id);
              if (time !== undefined) setCurrentTime(time);
              if (id) {
                setSelectedTextId(null);
                setSelectedBlurId(null);
              }
            }}
            onToggleCheckSegment={handleToggleCheckSegment}
            onToggleCheckAll={handleToggleCheckAll}
            onAutoSpeedAdjust={() => handleAutoSpeedAdjust({ notify: true })}
            onFitTimeline={handleFitTimeline}
            onMoveSegment={handleMoveSegment}
          />

          {/* Bottom: Timeline Editor */}
          <TimelineEditor
            subtitles={subtitles}
            currentTime={currentTime}
            duration={duration}
            zoomLevel={zoomLevel}
            onSeek={setCurrentTime}
            onSelectSegment={(id) => {
              setSelectedSubId(id);
              if (id) {
                const seg = subtitles.find((s) => s.id === id);
                if (seg) setCurrentTime(seg.startTime);
                setSelectedTextId(null);
                setSelectedBlurId(null);
              }
            }}
            onShiftTime={handleShiftTime}
            onChangeZoom={setZoomLevel}
            onSplitSegment={handleSplitSegment}
            onUpdateSegmentTimes={(id, start, end) =>
              handleUpdateSegment(id, { startTime: start, endTime: end })
            }
            onAutoAlignTimeline={handleFitTimeline}
            onSnapToPlayhead={handleSnapToPlayhead}
          />
        </main>

        {/* Right Inspector Panel: Dedicated text overlay & blur editor (only open when selected) */}
        <StyleInspectorPanel
          textOverlays={textOverlays}
          selectedTextId={selectedTextId}
          onSelectTextId={setSelectedTextId}
          onUpdateTextOverlay={handleUpdateTextOverlay}
          onDeleteTextOverlay={handleDeleteTextOverlay}
          blurBoxes={blurBoxes}
          selectedBlurId={selectedBlurId}
          onSelectBlurId={setSelectedBlurId}
          onUpdateBlurBox={handleUpdateBlurBox}
          onDeleteBlurBox={handleDeleteBlurBox}
          imageOverlays={imageOverlays}
          selectedImageId={selectedImageId}
          onSelectImageId={setSelectedImageId}
          onUpdateImageOverlay={handleUpdateImageOverlay}
          onDeleteImageOverlay={handleDeleteImageOverlay}
        />
      </div>

      {/* Export Studio Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        videoUrl={videoUrl}
        videoFile={uploadedFile || undefined}
        originalVideoPath={originalVideoPath || (uploadedFile as any)?.path || currentVideo?.originalPath}
        subtitles={subtitles}
        subtitleStyle={subtitleStyle}
        duration={duration}
        aspectRatio={aspectRatio}
        originalFileName={uploadedFile?.name || currentVideo?.title}
        textOverlays={textOverlays}
        blurBoxes={blurBoxes}
        imageOverlays={imageOverlays}
        isMuteOriginalVocals={isMuteOriginalVocals}
        vocalRemoverMode={vocalRemoverMode}
        onChangeVocalRemoverMode={handleSelectVocalRemoverMode}
        preSeparatedBgmPath={isolatedBgmPath}
        bgmMixLevel={bgmMixLevel}
        onShowToast={showToast}
      />

      {/* Auto Dubbing Modal */}
      <AutoDubbingModal
        isOpen={isAutoDubbingOpen}
        initialTab={autoDubbingInitialTab}
        onClose={() => setIsAutoDubbingOpen(false)}
        apiKeys={apiKeys.filter((k) => k.isActive).map((k) => k.key)}
        subtitleStyle={subtitleStyle}
        engine={transcribeEngine}
        geminiModel={geminiModel}
        geminiActive={geminiActive}
        onShowToast={showToast}
        onSetTranscribeEngine={setTranscribeEngine}
        onSetGeminiModel={setGeminiModel}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        defaultGender={activeGender}
        transcribeEngine={transcribeEngine}
        onSetTranscribeEngine={setTranscribeEngine}
        geminiModel={geminiModel}
        onSetGeminiModel={setGeminiModel}
        onSetDefaultGender={(g) => {
          handleToggleGender(g);
          setIsSettingsModalOpen(false);
        }}
        geminiActive={geminiActive || apiKeys.filter((k) => k.isActive).length > 0}
        apiKeys={apiKeys}
        onAddApiKey={handleAddApiKey}
        onAddApiKeys={handleAddApiKeys}
        onRemoveApiKey={handleRemoveApiKey}
        onToggleApiKey={handleToggleApiKey}
        onToggleAllApiKeys={handleToggleAllApiKeys}
        onClearAllApiKeys={handleClearAllApiKeys}
        onOpenAiEngine={() => setIsAiEngineModalOpen(true)}
      />

      {/* AI Engine & Hardware Acceleration Modal */}
      <AiEngineModal
        isOpen={isAiEngineModalOpen}
        onClose={() => setIsAiEngineModalOpen(false)}
      />

      {/* License Activation Modal */}
      <LicenseModal
        isOpen={isLicenseModalOpen || (!isLicenseChecking && !licenseStatus?.isActivated)}
        onClose={() => setIsLicenseModalOpen(false)}
        status={licenseStatus}
        canClose={Boolean(licenseStatus?.isActivated)}
        onActivated={(newStatus) => {
          setLicenseStatus(newStatus);
          setIsLicenseModalOpen(false);
          showToast('success', 'License Activated!', 'កម្មវិធីរបស់អ្នកត្រូវបានបើកដំណើរការដោយជោគជ័យ។');
        }}
        onDeactivated={() => {
          setLicenseStatus(null);
          setIsLicenseModalOpen(true);
          showToast('info', 'License Deactivated', 'បានដក License ចេញរួចរាល់។');
        }}
      />

      {/* App Updater & Changelog Modal */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        currentVersion="1.0.5"
      />

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
    </div>
  );
}
