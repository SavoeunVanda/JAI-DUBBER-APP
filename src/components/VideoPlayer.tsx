import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, Square, Volume2, VolumeX, Upload, Film, Trash2, FileText, CheckCircle2, Edit3, Check, Type, ArrowUp, ArrowDown, Move, Palette, Sparkles, EyeOff, Sliders, X, Droplet, ImageIcon, Loader2, RefreshCw } from 'lucide-react';
import { SubtitleSegment, SubtitleStyle, DemoVideo, TextOverlayItem, BlurBoxItem, ImageOverlayItem } from '../types';
import { SAMPLE_VIDEOS } from '../data/sampleProjects';
import { formatTimeCode } from '../utils/timeFormat';
import { getActiveSubtitlePagedText, subtitleCharsPerLine } from '../utils/subtitlePaging';
import { CustomColorPicker } from './CustomColorPicker';
import { detectAllSystemFonts, DetectedFontsResult } from '../utils/fontDetector';

interface VideoPlayerProps {
  videoUrl: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  aspectRatio: '16:9' | '9:16';
  subtitles: SubtitleSegment[];
  subtitleStyle: SubtitleStyle;
  isMuteOriginalVocals: boolean;
  bgmMixLevel: number;
  isPreparingVideo?: boolean;
  preparingMessage?: string;
  onRetryPreparePreview?: () => void;
  selectedSubId?: string | null;
  onSelectSubId?: (id: string | null) => void;
  // Shared Overlays
  textOverlays?: TextOverlayItem[];
  onUpdateTextOverlays?: React.Dispatch<React.SetStateAction<TextOverlayItem[]>>;
  selectedTextId?: string | null;
  onSelectTextId?: (id: string | null) => void;
  onAddTextOverlay?: () => void;
  onUpdateTextOverlay?: (id: string, updates: Partial<TextOverlayItem>) => void;
  onDeleteTextOverlay?: (id: string) => void;
  blurBoxes?: BlurBoxItem[];
  onUpdateBlurBoxes?: React.Dispatch<React.SetStateAction<BlurBoxItem[]>>;
  selectedBlurId?: string | null;
  onSelectBlurId?: (id: string | null) => void;
  onAddBlurBox?: () => void;
  onUpdateBlurBox?: (id: string, updates: Partial<BlurBoxItem>) => void;
  onDeleteBlurBox?: (id: string) => void;
  imageOverlays?: ImageOverlayItem[];
  onUpdateImageOverlays?: React.Dispatch<React.SetStateAction<ImageOverlayItem[]>>;
  selectedImageId?: string | null;
  onSelectImageId?: (id: string | null) => void;
  onAddImageOverlay?: (item: ImageOverlayItem) => void;
  onUpdateImageOverlay?: (id: string, updates: Partial<ImageOverlayItem>) => void;
  onDeleteImageOverlay?: (id: string) => void;
  // Actions
  onPlayPause: () => void;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (dur: number) => void;
  onAspectRatioChange: (ratio: '16:9' | '9:16') => void;
  onSelectSampleVideo: (demo: DemoVideo) => void;
  onUploadCustomVideo: (file: File) => void;
  onUpdateSubtitleStyle: (style: Partial<SubtitleStyle>) => void;
  onToggleMuteVocals: () => void;
  vocalRemoverMode?: 'mute_original' | 'mute_vocal';
  onSelectVocalRemoverMode?: (mode: 'mute_original' | 'mute_vocal') => void;
  isolatedBgmUrl?: string | null;
  isSeparatingVocals?: boolean;
  onChangeBgmMix: (level: number) => void;
  onExportSRT: () => void;
  onClearData: () => void;
  onUpdateSubtitleText?: (id: string, text: string) => void;
}

function hexToRgba(hex?: string, opacity: number = 100): string {
  if (!hex) return `rgba(0, 0, 0, ${opacity / 100})`;
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((x) => x + x).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return `rgba(0, 0, 0, ${opacity / 100})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, opacity)) / 100})`;
}

import { PRESET_STYLES, type PresetStyleDef } from '../constants/presetStyles';
export { PRESET_STYLES };
export type { PresetStyleDef };

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  currentTime,
  duration,
  isPlaying,
  aspectRatio,
  subtitles,
  subtitleStyle,
  isMuteOriginalVocals,
  bgmMixLevel,
  isPreparingVideo = false,
  preparingMessage = '',
  onRetryPreparePreview,
  selectedSubId,
  onSelectSubId,
  textOverlays: externalTextOverlays,
  onUpdateTextOverlays: externalSetTextOverlays,
  selectedTextId: externalSelectedTextId,
  onSelectTextId: externalSetSelectedTextId,
  onAddTextOverlay: externalOnAddTextOverlay,
  onUpdateTextOverlay: externalOnUpdateTextOverlay,
  onDeleteTextOverlay: externalOnDeleteTextOverlay,
  blurBoxes: externalBlurBoxes,
  onUpdateBlurBoxes: externalSetBlurBoxes,
  selectedBlurId: externalSelectedBlurId,
  onSelectBlurId: externalSetSelectedBlurId,
  onAddBlurBox: externalOnAddBlurBox,
  onUpdateBlurBox: externalOnUpdateBlurBox,
  onDeleteBlurBox: externalOnDeleteBlurBox,
  imageOverlays: externalImageOverlays,
  onUpdateImageOverlays: externalSetImageOverlays,
  selectedImageId: externalSelectedImageId,
  onSelectImageId: externalSetSelectedImageId,
  onAddImageOverlay: externalOnAddImageOverlay,
  onUpdateImageOverlay: externalOnUpdateImageOverlay,
  onDeleteImageOverlay: externalOnDeleteImageOverlay,
  onPlayPause,
  onTimeUpdate,
  onDurationChange,
  onAspectRatioChange,
  onSelectSampleVideo,
  onUploadCustomVideo,
  onUpdateSubtitleStyle,
  onToggleMuteVocals,
  vocalRemoverMode = 'mute_original',
  onSelectVocalRemoverMode,
  isolatedBgmUrl = null,
  isSeparatingVocals = false,
  onChangeBgmMix,
  onExportSRT,
  onClearData,
  onUpdateSubtitleText,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);

  // Drag-and-drop state for dropping video files directly onto player
  const [isDragOver, setIsDragOver] = useState(false);
  // Track decode/unsupported codec errors
  const [hasVideoError, setHasVideoError] = useState(false);
  const hasAutoRetriedProxyRef = useRef(false);

  // Reset error & player state when videoUrl changes
  useEffect(() => {
    hasAutoRetriedProxyRef.current = false;
    setHasVideoError(false);
    setNativeRatio(null);
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        videoRef.current.load();
      } catch {}
    }
  }, [videoUrl]);

  // Video display fit mode: 'cover' (full frame, no black bars), 'contain', 'fill'
  const [videoFit, setVideoFit] = useState<'cover' | 'contain' | 'fill'>('cover');
  // Auto calculated native aspect ratio (width / height) from uploaded video metadata
  const [nativeRatio, setNativeRatio] = useState<number | null>(null);

  // Preset style toggle state
  const [usePresetStyle, setUsePresetStyle] = useState<boolean>(
    !!subtitleStyle.styleType && subtitleStyle.styleType !== 'none'
  );

  // Active Subtitle Style Tab: 'text' | 'preset' | 'bg'
  const [activeStyleTab, setActiveStyleTab] = useState<'text' | 'preset' | 'bg'>('text');

  // Direct On-Canvas Subtitle Editing State
  const [isEditingSub, setIsEditingSub] = useState(false);
  const [inlineSubText, setInlineSubText] = useState('');

  // Multi Blur Overlay Censor Boxes State (fallback to internal if props not passed)
  const [internalBlurBoxes, setInternalBlurBoxes] = useState<BlurBoxItem[]>([]);
  const [internalSelectedBlurId, setInternalSelectedBlurId] = useState<string | null>(null);
  const [isDraggingBlur, setIsDraggingBlur] = useState(false);

  const blurBoxes = externalBlurBoxes !== undefined ? externalBlurBoxes : internalBlurBoxes;
  const setBlurBoxes = externalSetBlurBoxes || setInternalBlurBoxes;
  const selectedBlurId = externalSelectedBlurId !== undefined ? externalSelectedBlurId : internalSelectedBlurId;
  const setSelectedBlurId = (id: string | null) => {
    if (externalSetSelectedBlurId) externalSetSelectedBlurId(id);
    else setInternalSelectedBlurId(id);
  };

  // Multi Text Overlay State
  const [internalTextOverlays, setInternalTextOverlays] = useState<TextOverlayItem[]>([]);
  const [internalSelectedTextId, setInternalSelectedTextId] = useState<string | null>(null);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const hasDraggedRef = useRef<boolean>(false);

  const textOverlays = externalTextOverlays !== undefined ? externalTextOverlays : internalTextOverlays;
  const setTextOverlays = externalSetTextOverlays || setInternalTextOverlays;
  const selectedTextId = externalSelectedTextId !== undefined ? externalSelectedTextId : internalSelectedTextId;
  const setSelectedTextId = (id: string | null) => {
    if (externalSetSelectedTextId) externalSetSelectedTextId(id);
    else setInternalSelectedTextId(id);
  };

  // Live Animation Clock for Moving Loop Text Overlays
  const [animClock, setAnimClock] = useState(0);
  useEffect(() => {
    const hasMoving = textOverlays.some((t) => t.animation && t.animation !== 'none');
    if (!hasMoving) return;
    let rafId: number;
    let lastT = performance.now();
    const tick = (now: number) => {
      const delta = (now - lastT) / 1000;
      lastT = now;
      setAnimClock((prev) => prev + delta);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [textOverlays]);

  // Multi Image Overlay State
  const [internalImageOverlays, setInternalImageOverlays] = useState<ImageOverlayItem[]>([]);
  const [internalSelectedImageId, setInternalSelectedImageId] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  const imageOverlays = externalImageOverlays !== undefined ? externalImageOverlays : internalImageOverlays;
  const setImageOverlays = externalSetImageOverlays || setInternalImageOverlays;
  const selectedImageId = externalSelectedImageId !== undefined ? externalSelectedImageId : internalSelectedImageId;
  const setSelectedImageId = (id: string | null) => {
    if (externalSetSelectedImageId) externalSetSelectedImageId(id);
    else setInternalSelectedImageId(id);
  };

  const asideRef = useRef<HTMLElement | null>(null);

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

  // Add new Blur Box
  const handleAddBlurBox = () => {
    if (externalOnAddBlurBox) {
      externalOnAddBlurBox();
      return;
    }
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
      opacity: 100,
    };
    setBlurBoxes((prev: any) => [...prev, newBox]);
    setSelectedBlurId(newId);
    setSelectedTextId(null);
    if (onSelectSubId) onSelectSubId(null);
  };

  // Add new Text Overlay
  const handleAddTextOverlay = () => {
    if (externalOnAddTextOverlay) {
      externalOnAddTextOverlay();
      return;
    }
    const newId = 'text_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const count = textOverlays.length;
    const initialY = Math.min(80, 20 + (count * 8) % 40);
    const newItem: TextOverlayItem = {
      id: newId,
      text: count === 0 ? 'អក្សរលើវីដេអូ (Text Overlay)' : `អក្សរលើវីដេអូ ${count + 1}`,
      fontFamily: subtitleStyle?.fontFamily || 'Battambang',
      x: 50,
      y: initialY,
      xPercent: 50,
      yPercent: initialY,
      fontSize: 22,
      color: '#ffffff',
      bgColor: 'rgba(0, 0, 0, 0.65)',
      hasBg: true,
      widthPercent: 60,
      opacity: 100,
    };
    setTextOverlays((prev: any) => [...prev, newItem]);
    setSelectedTextId(newId);
    setSelectedBlurId(null);
    setSelectedImageId(null);
    if (onSelectSubId) onSelectSubId(null);
  };

  // Deselect blur/text/image if subtitle is selected
  useEffect(() => {
    if (selectedSubId) {
      setSelectedBlurId(null);
      setSelectedTextId(null);
      setSelectedImageId(null);
    }
  }, [selectedSubId]);

  const activeBlurBox = selectedBlurId ? blurBoxes.find((b) => b.id === selectedBlurId) || null : null;
  const activeTextOverlay = selectedTextId ? textOverlays.find((t) => t.id === selectedTextId) || null : null;
  const activeImageOverlay = selectedImageId ? imageOverlays.find((img) => img.id === selectedImageId) || null : null;

  // Resize Handler for Text Overlay Box (2D and 1D)
  const handleTextResizeStart = (e: React.MouseEvent | React.TouchEvent, id: string, xDir: number, yDir: number = 0) => {
    e.stopPropagation();
    setIsDraggingText(true);
    const item = textOverlays.find((t) => t.id === id);
    if (!item) {
      setIsDraggingText(false);
      return;
    }

    document.body.style.userSelect = 'none';
    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialW = item.widthPercent || item.width || 60;
    const initialH = item.heightPercent || item.height || 16;

    let rafId: number | null = null;
    const handleMove = (clientX: number, clientY: number) => {
      if (!videoContainerRef.current) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!videoContainerRef.current) return;
        const rect = videoContainerRef.current.getBoundingClientRect();
        const deltaW = xDir !== 0 ? ((clientX - startClientX) / rect.width) * 100 * xDir * 2 : 0;
        const deltaH = yDir !== 0 ? ((clientY - startClientY) / rect.height) * 100 * yDir * 2 : 0;

        const newW = xDir !== 0 ? Math.max(10, Math.min(95, Number((initialW + deltaW).toFixed(1)))) : initialW;
        const newH = yDir !== 0 ? Math.max(4, Math.min(95, Number((initialH + deltaH).toFixed(1)))) : initialH;

        setTextOverlays((prev: any) =>
          prev.map((t: any) =>
            t.id === id
              ? {
                  ...t,
                  width: newW,
                  widthPercent: newW,
                  ...(yDir !== 0 ? { height: newH, heightPercent: newH } : {}),
                }
              : t
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientX, me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientX, te.touches[0].clientY);
    };
    const handleResizeEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingText(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleResizeEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleResizeEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleResizeEnd);
  };

  // Round Corners Drag / Click Handler for Text Overlay
  const handleTextRadiusStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingText(true);
    hasDraggedRef.current = false;
    const item = textOverlays.find((t) => t.id === id);
    if (!item) {
      setIsDraggingText(false);
      return;
    }

    document.body.style.userSelect = 'none';
    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const initialRadius = item.borderRadius !== undefined ? item.borderRadius : 8;

    let rafId: number | null = null;
    const handleMove = (clientX: number) => {
      const deltaX = clientX - startClientX;
      const delta = deltaX * 0.4;
      if (Math.abs(delta) > 2) {
        hasDraggedRef.current = true;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const newRadius = Math.max(0, Math.min(60, Math.round(initialRadius + delta)));
        setTextOverlays((prev: any) =>
          prev.map((t: any) =>
            t.id === id ? { ...t, borderRadius: newRadius } : t
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientX);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientX);
    };
    const handleRadiusEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingText(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleRadiusEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleRadiusEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleRadiusEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleRadiusEnd);
  };

  // Feather Drag / Click Handler for Text Overlay
  const handleTextFeatherStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingText(true);
    hasDraggedRef.current = false;
    const item = textOverlays.find((t) => t.id === id);
    if (!item) {
      setIsDraggingText(false);
      return;
    }

    document.body.style.userSelect = 'none';
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialFeather = item.feather !== undefined ? item.feather : 0;

    let rafId: number | null = null;
    const handleMove = (clientY: number) => {
      const deltaY = startClientY - clientY;
      const delta = deltaY * 0.4;
      if (Math.abs(delta) > 2) {
        hasDraggedRef.current = true;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const newFeather = Math.max(0, Math.min(50, Math.round(initialFeather + delta)));
        setTextOverlays((prev: any) =>
          prev.map((t: any) =>
            t.id === id ? { ...t, feather: newFeather } : t
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientY);
    };
    const handleFeatherEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingText(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleFeatherEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleFeatherEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleFeatherEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleFeatherEnd);
  };

  // Rotation Drag / Click Handler for Text Overlay
  const handleTextRotateStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingText(true);
    hasDraggedRef.current = false;
    const item = textOverlays.find((t) => t.id === id);
    if (!item || !videoContainerRef.current) {
      setIsDraggingText(false);
      return;
    }

    document.body.style.userSelect = 'none';
    const containerRect = videoContainerRef.current.getBoundingClientRect();
    const tX = item.xPercent ?? item.x ?? 50;
    const tY = item.yPercent ?? item.y ?? 50;
    const centerX = containerRect.left + (tX / 100) * containerRect.width;
    const centerY = containerRect.top + (tY / 100) * containerRect.height;

    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startAngle = Math.atan2(startClientY - centerY, startClientX - centerX) * (180 / Math.PI);
    const initialRotation = item.rotation !== undefined ? item.rotation : 0;

    let rafId: number | null = null;
    const handleMove = (clientX: number, clientY: number) => {
      const currentAngle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
      const angleDiff = currentAngle - startAngle;
      if (Math.abs(angleDiff) > 2) {
        hasDraggedRef.current = true;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        let newRot = Math.round((initialRotation + angleDiff) % 360);
        if (newRot < 0) newRot += 360;
        if (Math.abs(newRot - 0) < 3 || Math.abs(newRot - 360) < 3) newRot = 0;
        else if (Math.abs(newRot - 90) < 3) newRot = 90;
        else if (Math.abs(newRot - 180) < 3) newRot = 180;
        else if (Math.abs(newRot - 270) < 3) newRot = 270;

        setTextOverlays((prev: any) =>
          prev.map((t: any) =>
            t.id === id ? { ...t, rotation: newRot } : t
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientX, me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientX, te.touches[0].clientY);
    };
    const handleRotateEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingText(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleRotateEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleRotateEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleRotateEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleRotateEnd);
  };

  // Drag Handler for Text Overlay
  const handleTextDragStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingText(true);
    hasDraggedRef.current = false;
    const item = textOverlays.find((t) => t.id === id);
    if (!item) return;

    document.body.style.userSelect = 'none';
    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialX = item.xPercent ?? item.x ?? 50;
    const initialY = item.yPercent ?? item.y ?? 50;

    let rafId: number | null = null;
    const updatePos = (clientX: number, clientY: number) => {
      if (!videoContainerRef.current) return;
      if (Math.abs(clientX - startClientX) > 2 || Math.abs(clientY - startClientY) > 2) {
        hasDraggedRef.current = true;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!videoContainerRef.current) return;
        const rect = videoContainerRef.current.getBoundingClientRect();
        const deltaX = ((clientX - startClientX) / rect.width) * 100;
        const deltaY = ((clientY - startClientY) / rect.height) * 100;

        const newX = Math.max(5, Math.min(95, Number((initialX + deltaX).toFixed(1))));
        const newY = Math.max(5, Math.min(95, Number((initialY + deltaY).toFixed(1))));

        setTextOverlays((prev: any) =>
          prev.map((t: any) =>
            t.id === id
              ? {
                  ...t,
                  x: newX,
                  y: newY,
                  xPercent: newX,
                  yPercent: newY,
                }
              : t
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => updatePos(me.clientX, me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) updatePos(te.touches[0].clientX, te.touches[0].clientY);
    };
    const handleDragEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingText(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleDragEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleDragEnd);
  };

  // Drag Handler for Blur Mask Overlay
  const handleBlurDragStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingBlur(true);
    hasDraggedRef.current = false;
    const box = blurBoxes.find((b) => b.id === id);
    if (!box) return;

    document.body.style.userSelect = 'none';
    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialX = box.xPercent ?? box.x ?? 50;
    const initialY = box.yPercent ?? box.y ?? 50;

    let rafId: number | null = null;
    const updatePos = (clientX: number, clientY: number) => {
      if (!videoContainerRef.current) return;
      if (Math.abs(clientX - startClientX) > 2 || Math.abs(clientY - startClientY) > 2) {
        hasDraggedRef.current = true;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!videoContainerRef.current) return;
        const rect = videoContainerRef.current.getBoundingClientRect();
        const deltaX = ((clientX - startClientX) / rect.width) * 100;
        const deltaY = ((clientY - startClientY) / rect.height) * 100;

        const newX = Math.max(5, Math.min(95, Number((initialX + deltaX).toFixed(1))));
        const newY = Math.max(5, Math.min(95, Number((initialY + deltaY).toFixed(1))));

        setBlurBoxes((prev: any) =>
          prev.map((b: any) =>
            b.id === id
              ? {
                  ...b,
                  x: newX,
                  y: newY,
                  xPercent: newX,
                  yPercent: newY,
                }
              : b
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => updatePos(me.clientX, me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) updatePos(te.touches[0].clientX, te.touches[0].clientY);
    };
    const handleDragEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingBlur(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleDragEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleDragEnd);
  };

  // Corner / edge Resize Handler for Blur Mask Overlay
  const handleBlurResizeStart = (e: React.MouseEvent | React.TouchEvent, id: string, xDir: number, yDir: number) => {
    e.stopPropagation();
    setIsDraggingBlur(true);
    const box = blurBoxes.find((b) => b.id === id);
    if (!box) {
      setIsDraggingBlur(false);
      return;
    }

    document.body.style.userSelect = 'none';
    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialW = box.widthPercent ?? box.width ?? 30;
    const initialH = box.heightPercent ?? box.height ?? 18;

    let rafId: number | null = null;
    const handleMove = (clientX: number, clientY: number) => {
      if (!videoContainerRef.current) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!videoContainerRef.current) return;
        const rect = videoContainerRef.current.getBoundingClientRect();
        const deltaW = ((clientX - startClientX) / rect.width) * 100 * xDir * 2;
        const deltaH = ((clientY - startClientY) / rect.height) * 100 * yDir * 2;

        const newW = Math.max(6, Math.min(95, Number((initialW + deltaW).toFixed(1))));
        const newH = Math.max(4, Math.min(95, Number((initialH + deltaH).toFixed(1))));

        setBlurBoxes((prev: any) =>
          prev.map((b: any) =>
            b.id === id
              ? {
                  ...b,
                  width: newW,
                  height: newH,
                  widthPercent: newW,
                  heightPercent: newH,
                }
              : b
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientX, me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientX, te.touches[0].clientY);
    };
    const handleResizeEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingBlur(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleResizeEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleResizeEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleResizeEnd);
  };

  // Corner Radius Drag / Click Handler for Blur Mask (Round Corners)
  const handleBlurRadiusStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingBlur(true);
    hasDraggedRef.current = false;
    const box = blurBoxes.find((b) => b.id === id);
    if (!box) {
      setIsDraggingBlur(false);
      return;
    }

    document.body.style.userSelect = 'none';
    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialRadius = box.borderRadius !== undefined ? box.borderRadius : 16;

    let rafId: number | null = null;
    const handleMove = (clientX: number, clientY: number) => {
      const deltaX = clientX - startClientX;
      const deltaY = clientY - startClientY;
      const delta = (deltaX + deltaY) * 0.4;
      if (Math.abs(delta) > 2) {
        hasDraggedRef.current = true;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const newRadius = Math.max(0, Math.min(50, Math.round(initialRadius + delta)));
        setBlurBoxes((prev: any) =>
          prev.map((b: any) =>
            b.id === id ? { ...b, borderRadius: newRadius } : b
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientX, me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientX, te.touches[0].clientY);
    };
    const handleRadiusEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingBlur(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleRadiusEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleRadiusEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleRadiusEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleRadiusEnd);
  };

  // Feather Drag / Click Handler for Blur Mask (Soft Edges)
  const handleBlurFeatherStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingBlur(true);
    hasDraggedRef.current = false;
    const box = blurBoxes.find((b) => b.id === id);
    if (!box) {
      setIsDraggingBlur(false);
      return;
    }

    document.body.style.userSelect = 'none';
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialFeather = box.feather !== undefined ? box.feather : 0;

    let rafId: number | null = null;
    const handleMove = (clientY: number) => {
      const deltaY = startClientY - clientY;
      const delta = deltaY * 0.4;
      if (Math.abs(delta) > 2) {
        hasDraggedRef.current = true;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const newFeather = Math.max(0, Math.min(50, Math.round(initialFeather + delta)));
        setBlurBoxes((prev: any) =>
          prev.map((b: any) =>
            b.id === id ? { ...b, feather: newFeather } : b
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientY);
    };
    const handleFeatherEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingBlur(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleFeatherEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleFeatherEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleFeatherEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleFeatherEnd);
  };

  // Rotation Drag / Click Handler for Blur Mask
  const handleBlurRotateStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingBlur(true);
    hasDraggedRef.current = false;
    const box = blurBoxes.find((b) => b.id === id);
    if (!box || !videoContainerRef.current) {
      setIsDraggingBlur(false);
      return;
    }

    document.body.style.userSelect = 'none';
    const containerRect = videoContainerRef.current.getBoundingClientRect();
    const bX = box.xPercent ?? box.x ?? 50;
    const bY = box.yPercent ?? box.y ?? 50;
    const centerX = containerRect.left + (bX / 100) * containerRect.width;
    const centerY = containerRect.top + (bY / 100) * containerRect.height;

    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startAngle = Math.atan2(startClientY - centerY, startClientX - centerX) * (180 / Math.PI);
    const initialRotation = box.rotation !== undefined ? box.rotation : 0;

    let rafId: number | null = null;
    const handleMove = (clientX: number, clientY: number) => {
      const currentAngle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
      const angleDiff = currentAngle - startAngle;
      if (Math.abs(angleDiff) > 2) {
        hasDraggedRef.current = true;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        let newRot = Math.round((initialRotation + angleDiff) % 360);
        if (newRot < 0) newRot += 360;
        if (Math.abs(newRot - 0) < 3 || Math.abs(newRot - 360) < 3) newRot = 0;
        else if (Math.abs(newRot - 90) < 3) newRot = 90;
        else if (Math.abs(newRot - 180) < 3) newRot = 180;
        else if (Math.abs(newRot - 270) < 3) newRot = 270;

        setBlurBoxes((prev: any) =>
          prev.map((b: any) =>
            b.id === id ? { ...b, rotation: newRot } : b
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientX, me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientX, te.touches[0].clientY);
    };
    const handleRotateEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingBlur(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleRotateEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleRotateEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleRotateEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleRotateEnd);
  };

  // Image Upload Handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) return;
      const count = imageOverlays.length;
      const newId = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      const initialY = Math.min(80, 25 + (count * 10) % 40);
      const newItem: ImageOverlayItem = {
        id: newId,
        imageUrl: result,
        name: file.name,
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

      if (externalOnAddImageOverlay) {
        externalOnAddImageOverlay(newItem);
      }
      setImageOverlays((prev: any) => {
        if (prev && prev.some((item: any) => item.id === newItem.id)) return prev;
        return [...(prev || []), newItem];
      });
      setSelectedImageId(newId);
      setSelectedBlurId(null);
      setSelectedTextId(null);
      if (onSelectSubId) onSelectSubId(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Drag Handler for Image Overlay
  const handleImageDragStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingImage(true);
    hasDraggedRef.current = false;
    const img = imageOverlays.find((i) => i.id === id);
    if (!img) return;

    document.body.style.userSelect = 'none';
    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialX = img.xPercent ?? img.x ?? 50;
    const initialY = img.yPercent ?? img.y ?? 50;

    let rafId: number | null = null;
    const updatePos = (clientX: number, clientY: number) => {
      if (!videoContainerRef.current) return;
      if (Math.abs(clientX - startClientX) > 2 || Math.abs(clientY - startClientY) > 2) {
        hasDraggedRef.current = true;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!videoContainerRef.current) return;
        const rect = videoContainerRef.current.getBoundingClientRect();
        const deltaX = ((clientX - startClientX) / rect.width) * 100;
        const deltaY = ((clientY - startClientY) / rect.height) * 100;

        const newX = Math.max(5, Math.min(95, Number((initialX + deltaX).toFixed(1))));
        const newY = Math.max(5, Math.min(95, Number((initialY + deltaY).toFixed(1))));

        setImageOverlays((prev: any) =>
          prev.map((i: any) =>
            i.id === id
              ? {
                  ...i,
                  x: newX,
                  y: newY,
                  xPercent: newX,
                  yPercent: newY,
                }
              : i
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => updatePos(me.clientX, me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) updatePos(te.touches[0].clientX, te.touches[0].clientY);
    };
    const handleDragEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingImage(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleDragEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleDragEnd);
  };

  // Resize Handler for Image Overlay
  const handleImageResizeStart = (e: React.MouseEvent | React.TouchEvent, id: string, xDir: number, yDir: number = 0) => {
    e.stopPropagation();
    setIsDraggingImage(true);
    const img = imageOverlays.find((i) => i.id === id);
    if (!img) {
      setIsDraggingImage(false);
      return;
    }

    document.body.style.userSelect = 'none';
    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialW = img.widthPercent ?? img.width ?? 30;
    const initialH = img.heightPercent ?? img.height ?? 20;

    let rafId: number | null = null;
    const handleMove = (clientX: number, clientY: number) => {
      if (!videoContainerRef.current) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!videoContainerRef.current) return;
        const rect = videoContainerRef.current.getBoundingClientRect();
        const deltaW = xDir !== 0 ? ((clientX - startClientX) / rect.width) * 100 * xDir * 2 : 0;
        const deltaH = yDir !== 0 ? ((clientY - startClientY) / rect.height) * 100 * yDir * 2 : 0;

        const newW = xDir !== 0 ? Math.max(6, Math.min(95, Number((initialW + deltaW).toFixed(1)))) : initialW;
        const newH = yDir !== 0 ? Math.max(4, Math.min(95, Number((initialH + deltaH).toFixed(1)))) : initialH;

        setImageOverlays((prev: any) =>
          prev.map((i: any) =>
            i.id === id
              ? {
                  ...i,
                  width: newW,
                  widthPercent: newW,
                  ...(yDir !== 0 ? { height: newH, heightPercent: newH } : {}),
                }
              : i
          )
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientX, me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientX, te.touches[0].clientY);
    };
    const handleResizeEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingImage(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleResizeEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleResizeEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleResizeEnd);
  };

  // Rotation Handler for Image Overlay
  const handleImageRotateStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingImage(true);
    hasDraggedRef.current = false;
    const img = imageOverlays.find((i) => i.id === id);
    if (!img || !videoContainerRef.current) return;

    document.body.style.userSelect = 'none';
    const containerRect = videoContainerRef.current.getBoundingClientRect();
    const iX = img.xPercent ?? img.x ?? 50;
    const iY = img.yPercent ?? img.y ?? 50;
    const centerX = containerRect.left + (iX / 100) * containerRect.width;
    const centerY = containerRect.top + (iY / 100) * containerRect.height;

    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startAngle = Math.atan2(startClientY - centerY, startClientX - centerX) * (180 / Math.PI);
    const initialRotation = img.rotation !== undefined ? img.rotation : 0;

    let rafId: number | null = null;
    const handleMove = (clientX: number, clientY: number) => {
      const currentAngle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
      const angleDiff = currentAngle - startAngle;
      if (Math.abs(angleDiff) > 2) {
        hasDraggedRef.current = true;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        let newRot = Math.round((initialRotation + angleDiff) % 360);
        if (newRot < 0) newRot += 360;
        if (Math.abs(newRot - 0) < 3 || Math.abs(newRot - 360) < 3) newRot = 0;
        else if (Math.abs(newRot - 90) < 3) newRot = 90;
        else if (Math.abs(newRot - 180) < 3) newRot = 180;
        else if (Math.abs(newRot - 270) < 3) newRot = 270;

        setImageOverlays((prev: any) =>
          prev.map((i: any) => (i.id === id ? { ...i, rotation: newRot } : i))
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientX, me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientX, te.touches[0].clientY);
    };
    const handleRotateEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingImage(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleRotateEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleRotateEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleRotateEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleRotateEnd);
  };

  // Corner Radius Handler for Image Overlay
  const handleImageRadiusStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingImage(true);
    hasDraggedRef.current = false;
    const img = imageOverlays.find((i) => i.id === id);
    if (!img) return;

    document.body.style.userSelect = 'none';
    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const initialRadius = img.borderRadius !== undefined ? img.borderRadius : 8;

    let rafId: number | null = null;
    const handleMove = (clientX: number) => {
      const delta = (clientX - startClientX) * 0.4;
      if (Math.abs(delta) > 2) hasDraggedRef.current = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const newRadius = Math.max(0, Math.min(60, Math.round(initialRadius + delta)));
        setImageOverlays((prev: any) =>
          prev.map((i: any) => (i.id === id ? { ...i, borderRadius: newRadius } : i))
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientX);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientX);
    };
    const handleRadiusEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingImage(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleRadiusEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleRadiusEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleRadiusEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleRadiusEnd);
  };

  // Feather Handler for Image Overlay
  const handleImageFeatherStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setIsDraggingImage(true);
    hasDraggedRef.current = false;
    const img = imageOverlays.find((i) => i.id === id);
    if (!img) return;

    document.body.style.userSelect = 'none';
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialFeather = img.feather !== undefined ? img.feather : 0;

    let rafId: number | null = null;
    const handleMove = (clientY: number) => {
      const delta = (startClientY - clientY) * 0.4;
      if (Math.abs(delta) > 2) hasDraggedRef.current = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const newFeather = Math.max(0, Math.min(50, Math.round(initialFeather + delta)));
        setImageOverlays((prev: any) =>
          prev.map((i: any) => (i.id === id ? { ...i, feather: newFeather } : i))
        );
      });
    };

    const handleMouseMove = (me: MouseEvent) => handleMove(me.clientY);
    const handleTouchMove = (te: TouchEvent) => {
      if (te.touches.length > 0) handleMove(te.touches[0].clientY);
    };
    const handleFeatherEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingImage(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleFeatherEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleFeatherEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleFeatherEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleFeatherEnd);
  };

  // Reset native ratio when videoUrl changes so new video computes fresh aspect
  useEffect(() => {
    setNativeRatio(null);
  }, [videoUrl]);

  // Handle video metadata loaded to calculate dynamic intrinsic video dimensions
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    onDurationChange(video.duration);

    if (video.videoWidth && video.videoHeight) {
      const computedRatio = video.videoWidth / video.videoHeight;
      setNativeRatio(computedRatio);

      // Auto set ratio indicator
      if (computedRatio < 0.85) {
        onAspectRatioChange('9:16');
      } else if (computedRatio > 1.2) {
        onAspectRatioChange('16:9');
      }
    }
  };

  // Sync HTML5 video & isolated BGM play/pause
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else if (!isPlaying && !videoRef.current.paused) {
      videoRef.current.pause();
    }

    if (bgmAudioRef.current) {
      if (isPlaying && vocalRemoverMode === 'mute_vocal' && isolatedBgmUrl) {
        if (Math.abs(bgmAudioRef.current.currentTime - (videoRef.current.currentTime || 0)) > 0.35) {
          bgmAudioRef.current.currentTime = videoRef.current.currentTime || 0;
        }
        bgmAudioRef.current.play().catch(() => {});
      } else if (!bgmAudioRef.current.paused) {
        bgmAudioRef.current.pause();
      }
    }
  }, [isPlaying, vocalRemoverMode, isolatedBgmUrl]);

  // Sync seek position
  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.3) {
      videoRef.current.currentTime = currentTime;
    }
    if (bgmAudioRef.current && vocalRemoverMode === 'mute_vocal' && isolatedBgmUrl) {
      if (Math.abs(bgmAudioRef.current.currentTime - currentTime) > 0.35) {
        bgmAudioRef.current.currentTime = currentTime;
      }
    }
  }, [currentTime, vocalRemoverMode, isolatedBgmUrl]);

  // Sync volume mixing (Mute Original vs Mute Vocal Only with Demucs isolated BGM)
  useEffect(() => {
    const level = typeof bgmMixLevel === 'number' ? Math.max(0, Math.min(1, bgmMixLevel / 100)) : 0.2;
    if (videoRef.current) {
      if (vocalRemoverMode === 'mute_vocal') {
        // In Mute Vocal Only mode, original video speech must stay muted while isolated BGM plays
        videoRef.current.volume = 0;
        videoRef.current.muted = true;
      } else if (isMuteOriginalVocals) {
        videoRef.current.volume = 0;
        videoRef.current.muted = true;
      } else {
        videoRef.current.volume = level > 0 ? level : 1.0;
        videoRef.current.muted = false;
      }
    }

    if (bgmAudioRef.current) {
      if (vocalRemoverMode === 'mute_vocal' && isolatedBgmUrl) {
        bgmAudioRef.current.volume = level;
        bgmAudioRef.current.muted = level <= 0;
        if (isPlaying && bgmAudioRef.current.paused) {
          if (videoRef.current) {
            bgmAudioRef.current.currentTime = videoRef.current.currentTime || 0;
          }
          bgmAudioRef.current.play().catch(() => {});
        }
      } else {
        bgmAudioRef.current.volume = 0;
        bgmAudioRef.current.muted = true;
        if (!bgmAudioRef.current.paused) {
          bgmAudioRef.current.pause();
        }
      }
    }
  }, [isMuteOriginalVocals, bgmMixLevel, vocalRemoverMode, isolatedBgmUrl, isPlaying]);

  // Find all active subtitle segments at currentTime (supports simultaneous overlapping speech / cross-talk)
  const activeSubs = subtitles.filter(
    (s) => currentTime >= s.startTime && currentTime <= s.endTime && s.text.trim().length > 0
  );
  const activeSub = activeSubs[0] || null;

  // Compute active paged or complete subtitle text for the current playback time
  const displaySubtitleText = activeSubs.length > 0
    ? activeSubs
        .map((sub) => {
          const paged = getActiveSubtitlePagedText(
            sub.text,
            sub.startTime,
            sub.endTime,
            currentTime,
            // Same definition the exporter uses, so the preview and the burned-in
            // subtitle wrap at exactly the same points.
            subtitleCharsPerLine(subtitleStyle.widthPercent, subtitleStyle.fontSize),
            subtitleStyle.maxLines || 0
          );
          if (activeSubs.length > 1) {
            const prefix = sub.meaning && sub.meaning !== 'តួប្រុស' && sub.meaning !== 'តួស្រី' ? `[${sub.meaning}] ` : '- ';
            return `${prefix}${paged}`;
          }
          return paged;
        })
        .join('\n')
    : '';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadCustomVideo(e.target.files[0]);
    }
    // Reset file input value so choosing the same or any file again triggers onChange reliably
    e.target.value = '';
  };

  // Drag and Drop counter to prevent child element dragleave flickering
  const dragCounterRef = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.dataTransfer.dropEffect = 'copy';
    } catch {}
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const isVideo =
        file.type.startsWith('video/') ||
        /\.(mp4|mkv|mov|avi|webm|ts|m2ts|mts|flv|f4v|m4v|wmv|3gp|3g2|vob|ogv|rmvb|rm|asf|divx)$/i.test(file.name);
      const isImage =
        file.type.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(file.name);

      if (isVideo) {
        onUploadCustomVideo(file);
      } else if (isImage) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (!result) return;
          const count = imageOverlays.length;
          const newId = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
          const initialY = Math.min(80, 25 + (count * 10) % 40);
          const newItem: ImageOverlayItem = {
            id: newId,
            imageUrl: result,
            name: file.name,
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
          if (externalOnAddImageOverlay) {
            externalOnAddImageOverlay(newItem);
          }
          setImageOverlays((prev: any) => {
            if (prev && prev.some((item: any) => item.id === newItem.id)) return prev;
            return [...(prev || []), newItem];
          });
          setSelectedImageId(newId);
          setSelectedBlurId(null);
          setSelectedTextId(null);
          if (onSelectSubId) onSelectSubId(null);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Container ref for relative drag calculations
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingSub, setIsDraggingSub] = useState(false);

  // Helper for subtitle position style (percentage offset or preset top/mid/bot)
  const getSubPositionStyle = (): React.CSSProperties => {
    if (subtitleStyle.yPercent !== undefined && subtitleStyle.xPercent !== undefined) {
      return {
        left: `${subtitleStyle.xPercent}%`,
        top: `${subtitleStyle.yPercent}%`,
        transform: 'translate(-50%, -50%)',
      };
    }
    // Default fallback to presets
    switch (subtitleStyle.position) {
      case 'top':
        return { left: '50%', top: '10%', transform: 'translate(-50%, 0)' };
      case 'mid':
        return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
      case 'bot':
      default:
        return { left: '50%', top: '70%', transform: 'translate(-50%, -50%)' };
    }
  };

  // Drag handler for CapCut-style placement anywhere on video frame
  const handleSubDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsDraggingSub(true);

    document.body.style.userSelect = 'none';
    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialX = subtitleStyle.xPercent !== undefined ? subtitleStyle.xPercent : 50;
    const initialY = subtitleStyle.yPercent !== undefined ? subtitleStyle.yPercent : (subtitleStyle.position === 'top' ? 10 : subtitleStyle.position === 'mid' ? 50 : 70);

    let rafId: number | null = null;
    const updatePosition = (clientX: number, clientY: number) => {
      if (!videoContainerRef.current) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!videoContainerRef.current) return;
        const rect = videoContainerRef.current.getBoundingClientRect();
        const deltaX = ((clientX - startClientX) / rect.width) * 100;
        const deltaY = ((clientY - startClientY) / rect.height) * 100;

        const newX = Math.max(5, Math.min(95, Number((initialX + deltaX).toFixed(1))));
        const newY = Math.max(5, Math.min(95, Number((initialY + deltaY).toFixed(1))));

        onUpdateSubtitleStyle({
          xPercent: newX,
          yPercent: newY,
        });
      });
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updatePosition(moveEvent.clientX, moveEvent.clientY);
    };

    const handleTouchMove = (touchEvent: TouchEvent) => {
      if (touchEvent.touches.length > 0) {
        updatePosition(touchEvent.touches[0].clientX, touchEvent.touches[0].clientY);
      }
    };

    const handleDragEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDraggingSub(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleDragEnd);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleDragEnd);
  };

  // Determine subtitle box/shadow style
  const getSubStyleCSS = () => {
    const rawFont = (subtitleStyle.fontFamily || 'Battambang').trim();
    const cleanFont = rawFont.toLowerCase() === 'battambong' ? 'Battambang' : rawFont;
    const base: React.CSSProperties = {
      fontFamily: `"${cleanFont}", "Battambang", "Battambong", "Khmer OS Battambang", sans-serif`,
      fontSize: `${subtitleStyle.fontSize}px`,
    };

    const preset = PRESET_STYLES.find((p) => p.id === subtitleStyle.styleType);

    if (preset) {
      Object.assign(base, preset.style);
    } else if (subtitleStyle.styleType === 'box') {
      base.backgroundColor = 'rgba(0, 0, 0, 0.82)';
      base.padding = '4px 12px';
      base.borderRadius = '4px';
      base.border = '1px solid rgba(255,255,255,0.15)';
      base.color = subtitleStyle.color || '#ffffff';
    } else if (subtitleStyle.styleType === 'outline') {
      base.textShadow =
        '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000';
      base.color = subtitleStyle.color || '#ffffff';
    } else if (subtitleStyle.styleType === 'shadow') {
      base.textShadow = '0px 3px 8px rgba(0,0,0,0.9)';
      base.color = subtitleStyle.color || '#ffffff';
    } else if (subtitleStyle.styleType === 'yellow') {
      base.color = '#facc15';
      base.textShadow =
        '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 4px 10px rgba(0,0,0,0.9)';
    } else if (subtitleStyle.styleType === 'gradient') {
      base.color = '#38bdf8';
      base.textShadow =
        '0 0 10px rgba(56,189,248,0.9), 0 0 20px rgba(236,72,153,0.7), -1.5px -1.5px 0 #000, 1.5px 1.5px 0 #000';
    } else {
      base.color = subtitleStyle.color || '#ffffff';
    }

    if (subtitleStyle.color && subtitleStyle.color !== '#ffffff' && !preset?.style.backgroundColor) {
      base.color = subtitleStyle.color;
    }

    // Line formatting & word breaking
    base.wordBreak = 'break-word';
    base.overflowWrap = 'anywhere';
    base.whiteSpace = 'pre-line';

    // Custom or Preset background color & opacity
    const effectiveBgColor =
      subtitleStyle.bgColor ||
      (preset?.style.backgroundColor as string) ||
      (subtitleStyle.styleType === 'box' ? '#000000' : undefined);

    if (effectiveBgColor) {
      const opacity = subtitleStyle.bgOpacity !== undefined ? subtitleStyle.bgOpacity : 100;
      base.backgroundColor = hexToRgba(effectiveBgColor, opacity);
      if (!base.padding) base.padding = '2px 10px';
      if (!base.borderRadius) base.borderRadius = '6px';
    }

    return base;
  };

  return (
    <aside
      ref={asideRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-[320px] lg:w-[360px] bg-[#0c121c] border-r ${
        isDragOver ? 'border-cyan-400 ring-2 ring-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.25)]' : 'border-[#1b263b]'
      } flex flex-col h-full overflow-y-auto custom-scrollbar p-3 gap-3 select-none relative transition-all`}
    >
      {/* Video Control Bar: Load / Replace Video & Aspect Ratio */}
      <div className="bg-[#121b2b] border border-[#202d45] rounded-lg p-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`flex-1 flex items-center justify-center gap-2 ${
              videoUrl
                ? 'bg-[#16273e] hover:bg-[#1d3352] text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                : 'bg-[#1b283d] hover:bg-[#253652] text-cyan-300 border-cyan-500/30'
            } border font-semibold text-xs py-1.5 px-3 rounded transition-all cursor-pointer`}
            title={videoUrl ? 'ចុចដើម្បីប្ដូរវីដេអូថ្មី (Replace Current Video)' : 'ចុចដើម្បីបើកវីដេអូ (Load Video)'}
          >
            {videoUrl ? <RefreshCw className="w-3.5 h-3.5 text-cyan-400" /> : <Upload className="w-3.5 h-3.5 text-cyan-400" />}
            <span>{videoUrl ? 'REPLACE VIDEO' : 'LOAD VIDEO'}</span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.ts,.m2ts,.mts,.flv,.f4v,.m4v,.wmv,.3gp,.3g2,.vob,.ogv,.rmvb,.rm,.asf,.divx"
            className="hidden"
          />

          {/* Aspect Ratio Switcher */}
          <div className="flex items-center bg-[#0a0e17] border border-[#1b263b] p-0.5 rounded text-[11px] font-mono">
            <button
              onClick={() => {
                setNativeRatio(null);
                onAspectRatioChange('16:9');
              }}
              className={`px-2.5 py-1 rounded cursor-pointer transition-all ${
                aspectRatio === '16:9'
                  ? 'bg-cyan-500 text-black font-bold shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              16:9
            </button>
            <button
              onClick={() => {
                setNativeRatio(null);
                onAspectRatioChange('9:16');
              }}
              className={`px-2.5 py-1 rounded cursor-pointer transition-all ${
                aspectRatio === '9:16'
                  ? 'bg-cyan-500 text-black font-bold shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              9:16
            </button>
          </div>
        </div>

        {/* Tools Icon List Toolbar */}
        <div className="bg-[#121b2b] border border-[#202d45] rounded-sm p-1.5 flex items-center justify-center gap-2">
          {/* Water Droplet Icon Button for Blur */}
          <button
            type="button"
            onClick={handleAddBlurBox}
            className={`p-0 rounded-sm transition-all cursor-pointer flex items-center justify-center relative ${
              blurBoxes.length > 0
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                : 'text-slate-400 hover:text-white hover:bg-[#1b283d] border border-transparent'
            }`}
            title="បន្ថែម Blur Mask (ចុចដើម្បីបន្ថែម Blur Box)"
          >
            <Droplet className={`w-4 h-4 ${blurBoxes.length > 0 ? 'fill-cyan-400/30 text-cyan-300' : ''}`} />
            {blurBoxes.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-cyan-400 text-slate-950 font-bold text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {blurBoxes.length}
              </span>
            )}
          </button>

          {/* Text Overlay Icon Button */}
          <button
            type="button"
            onClick={handleAddTextOverlay}
            className={`p-0 rounded-sm transition-all cursor-pointer flex items-center justify-center relative ${
              textOverlays.length > 0
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                : 'text-slate-400 hover:text-white hover:bg-[#1b283d] border border-transparent'
            }`}
            title="បន្ថែម Text Overlay (ចុចដើម្បីបន្ថែមអក្សរលើវីដេអូ)"
          >
            <Type className={`w-4 h-4 ${textOverlays.length > 0 ? 'text-cyan-300 font-bold' : ''}`} />
            {textOverlays.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-cyan-400 text-slate-950 font-bold text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {textOverlays.length}
              </span>
            )}
          </button>

          {/* Image Overlay Upload Button */}
          <label
            className={`p-0 rounded-sm transition-all cursor-pointer flex items-center justify-center relative ${
              imageOverlays.length > 0
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                : 'text-slate-400 hover:text-white hover:bg-[#1b283d] border border-transparent'
            }`}
            title="បន្ថែម Image Overlay (ចុចដើម្បីបញ្ចូលរូបភាព ឬ Logo)"
          >
            <ImageIcon className={`w-4 h-4 ${imageOverlays.length > 0 ? 'text-cyan-300' : ''}`} />
            <input
              type="file"
              ref={imageFileInputRef}
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            {imageOverlays.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-cyan-400 text-slate-950 font-bold text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {imageOverlays.length}
              </span>
            )}
          </label>
        </div>
      </div>

      {/* Main Video Box Canvas with Dynamic Aspect Ratio & Full Frame Fit */}
      <div
        ref={videoContainerRef}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (onSelectSubId) onSelectSubId(null);
          setSelectedBlurId(null);
          setSelectedTextId(null);
          setSelectedImageId(null);
        }}
        className={`relative bg-black border ${
          isDragOver ? 'border-cyan-400 ring-2 ring-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'border-[#1e2c45]'
        } rounded-lg overflow-hidden group shadow-lg flex items-center justify-center transition-all duration-300 shrink-0 w-full select-none ${
          aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'
        }`}
      >
        <video
          key={videoUrl || 'no-video'}
          ref={videoRef}
          src={videoUrl}
          muted={isMuteOriginalVocals}
          className={`w-full h-full transition-all duration-200 ${
            videoFit === 'cover'
              ? 'object-cover'
              : videoFit === 'fill'
              ? 'object-fill'
              : 'object-contain'
          }`}
          onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={() => setHasVideoError(false)}
          onError={(e) => {
            console.warn('Video decoding error in HTML5 video player:', e);
            setHasVideoError(true);
            // Automatic self-healing: if video is HEVC, non-native audio/container, auto-generate H.264 preview proxy
            if (onRetryPreparePreview && !hasAutoRetriedProxyRef.current) {
              hasAutoRetriedProxyRef.current = true;
              console.log('Automatically launching H.264 preview proxy conversion for video...');
              onRetryPreparePreview();
            }
          }}
          onEnded={() => onPlayPause()}
          playsInline
        />

        {/* Drag-and-drop file hover overlay (Initial load & Replace video) */}
        {isDragOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-3.5 pointer-events-none border-2 border-dashed border-cyan-400 m-2 rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.5)]">
            <div className="w-14 h-14 rounded-xl border border-cyan-500/60 bg-[#101826] flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.35)]">
              <RefreshCw className="w-7 h-7 animate-spin text-cyan-400" />
            </div>
            <div className="flex flex-col items-center gap-1 text-center px-4">
              <p className="font-mono text-xs font-bold text-cyan-300 tracking-wider uppercase">
                {videoUrl ? 'DROP TO REPLACE VIDEO' : 'DROP VIDEO TO LOAD'}
              </p>
              <span className="text-[11px] text-cyan-200/90 font-khmer">
                {videoUrl ? 'ទម្លាក់ទីនេះដើម្បីប្ដូរវីដេអូថ្មី (Replace Video)' : 'ទម្លាក់ទីនេះដើម្បីបើកវីដេអូ'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-tight mt-1">
                MP4 • MKV • MOV • AVI • WEBM • TS • FLV • WMV • 3GP • VOB
              </span>
            </div>
          </div>
        )}

        {/* Preparing Video Preview / HEVC Transcoding Overlay */}
        {isPreparingVideo && (
          <div className="absolute inset-0 bg-[#0a0f1d]/90 backdrop-blur-md z-40 flex flex-col items-center justify-center p-4 text-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
              <Loader2 className="w-5 h-5 text-cyan-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div className="flex flex-col gap-1 max-w-[280px]">
              <span className="font-mono text-xs text-cyan-300 tracking-wider uppercase">
                {preparingMessage || 'PREPARING VIDEO PREVIEW...'}
              </span>
            </div>
          </div>
        )}

        {/* Error overlay for unsupported codec */}
        {hasVideoError && Boolean(videoUrl) && !isPreparingVideo && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 bg-[#080d16]/95 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center gap-3.5 cursor-pointer group hover:bg-[#0c1320] transition-all border border-dashed border-[#1e2d45] hover:border-cyan-500/50 m-3 rounded-xl select-none"
            title="Drag & Drop Video"
          >
            <div className="w-12 h-12 rounded-lg border border-[#1e2d45] bg-[#101826] flex items-center justify-center text-slate-400 group-hover:border-cyan-500/50 group-hover:text-cyan-300 transition-all shadow-sm">
              <Upload className="w-6 h-6 text-slate-500 group-hover:text-cyan-400 transition-colors" />
            </div>
            <p className="font-mono text-xs text-slate-400 group-hover:text-slate-300 tracking-wider text-center uppercase">
              DRAG & DROP VIDEO
            </p>
            {onRetryPreparePreview && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetryPreparePreview();
                }}
                className="mt-1 px-3 py-1.5 bg-[#101826] hover:bg-[#162338] border border-[#223654] hover:border-cyan-500/60 text-cyan-400 text-xs font-mono tracking-wider uppercase rounded-lg flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                CREATE H.264 PROXY
              </button>
            )}
          </div>
        )}

        {/* Drag & Drop Dropzone (Displayed ONLY when no video is loaded) */}
        {!videoUrl && !isPreparingVideo && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 bg-[#080d16]/95 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center gap-3 cursor-pointer group hover:bg-[#0c1320] transition-all border border-dashed border-[#1e2d45] hover:border-cyan-500/50 m-3 rounded-xl select-none"
            title="Drag & Drop Video (Support all formats)"
          >
            <div className="w-12 h-12 rounded-lg border border-[#1e2d45] bg-[#101826] flex items-center justify-center text-slate-400 group-hover:border-cyan-500/50 group-hover:text-cyan-300 transition-all shadow-sm">
              <Upload className="w-6 h-6 text-slate-500 group-hover:text-cyan-400 transition-colors" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <p className="font-mono text-xs text-slate-400 group-hover:text-slate-300 tracking-wider text-center uppercase">
                DRAG & DROP VIDEO
              </p>
              <span className="text-[10px] text-slate-500 font-mono tracking-tight text-center">
                MP4 • MKV • MOV • AVI • WEBM • TS • FLV • WMV • 3GP • VOB
              </span>
            </div>
          </div>
        )}

        {/* Interactive Draggable & Resizable Blur Mask Overlays */}
        {blurBoxes.map((blurBox) => {
          const isSelected = blurBox.id === selectedBlurId;
          const bX = blurBox.xPercent !== undefined ? blurBox.xPercent : (blurBox.x !== undefined ? blurBox.x : 50);
          const bY = blurBox.yPercent !== undefined ? blurBox.yPercent : (blurBox.y !== undefined ? blurBox.y : 50);
          const bW = Math.max(6, blurBox.widthPercent !== undefined ? blurBox.widthPercent : (blurBox.width !== undefined ? blurBox.width : 30));
          const bH = Math.max(4, blurBox.heightPercent !== undefined ? blurBox.heightPercent : (blurBox.height !== undefined ? blurBox.height : 18));
          const blurAmount = blurBox.blurAmount !== undefined ? blurBox.blurAmount : 14;
          const blurOpacity = (blurBox.opacity !== undefined ? blurBox.opacity : 100) / 100;
          const blurRadius = blurBox.borderRadius !== undefined ? blurBox.borderRadius : 16;
          const blurFeather = blurBox.feather !== undefined ? blurBox.feather : 0;
          const blurRotation = blurBox.rotation !== undefined ? blurBox.rotation : 0;

          // Compute mask feathering dynamically to match rectangular shape or rounded corners
          let maskStyles: React.CSSProperties = {};
          if (blurFeather > 0) {
            const fPctX = Math.min(45, Math.max(3, blurFeather * 0.75));
            const fPctY = Math.min(45, Math.max(3, blurFeather * 1.1));
            const maskX = `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,1) ${fPctX}%, rgba(0,0,0,1) ${100 - fPctX}%, rgba(0,0,0,0) 100%)`;
            const maskY = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) ${fPctY}%, rgba(0,0,0,1) ${100 - fPctY}%, rgba(0,0,0,0) 100%)`;

            if (blurRadius <= 2) {
              // Pure rectangular edge feather (sharp 4-edge gradient decay)
              maskStyles = {
                WebkitMaskImage: `${maskX}, ${maskY}`,
                maskImage: `${maskX}, ${maskY}`,
                WebkitMaskComposite: 'source-in',
                maskComposite: 'intersect',
              };
            } else {
              // Feather that follows the Round Corners seamlessly
              const innerRadiusPct = Math.max(10, 100 - (blurFeather * 1.6 + blurRadius * 0.4));
              const maskRadial = `radial-gradient(ellipse at center, rgba(0,0,0,1) ${innerRadiusPct}%, rgba(0,0,0,0) 100%)`;
              maskStyles = {
                WebkitMaskImage: `${maskX}, ${maskY}, ${maskRadial}`,
                maskImage: `${maskX}, ${maskY}, ${maskRadial}`,
                WebkitMaskComposite: 'source-in',
                maskComposite: 'intersect',
              };
            }
          }

          return (
            <div
              key={blurBox.id}
              style={{
                left: `${bX}%`,
                top: `${bY}%`,
                width: `${bW}%`,
                height: `${bH}%`,
                transform: `translate(-50%, -50%) rotate(${blurRotation}deg)`,
                opacity: blurOpacity,
                borderRadius: `${blurRadius}px`,
                touchAction: 'none',
              }}
              onMouseDown={(e) => {
                handleBlurDragStart(e, blurBox.id);
              }}
              onTouchStart={(e) => {
                handleBlurDragStart(e, blurBox.id);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (hasDraggedRef.current) {
                  hasDraggedRef.current = false;
                  return;
                }
                setSelectedBlurId(blurBox.id);
                setSelectedTextId(null);
                if (onSelectSubId) onSelectSubId(null);
              }}
              className={`absolute z-20 cursor-grab active:cursor-grabbing select-none ${
                isDraggingBlur ? 'transition-none' : 'transition-transform duration-75'
              } ${isDraggingBlur && isSelected ? 'scale-[1.01] z-30' : ''}`}
            >
              {/* Glassmorphism Backdrop Blur Canvas */}
              <div
                className="w-full h-full overflow-hidden relative"
                style={{
                  borderRadius: `${blurRadius}px`,
                  backdropFilter: `blur(${blurAmount}px)`,
                  WebkitBackdropFilter: `blur(${blurAmount}px)`,
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  border: isSelected ? '1.5px dashed rgba(255, 255, 255, 0.85)' : 'none',
                  boxShadow: isSelected ? '0 0 14px rgba(34, 211, 238, 0.35)' : 'none',
                  ...maskStyles,
                }}
              />

              {/* Selection Outline, Center Alignment Guides, Handles & Control Buttons — Only show when selected */}
              {isSelected && (
                <>
                  {/* Center Alignment Dashed Cross Lines */}
                  <div className="absolute top-1/2 left-0 right-0 h-0 border-t border-dashed border-white/60 pointer-events-none z-10" />
                  <div className="absolute left-1/2 top-0 bottom-0 w-0 border-l border-dashed border-white/60 pointer-events-none z-10" />

                  {/* Delete Button (Top-Right) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBlurBoxes((prev: any) => prev.filter((b: any) => b.id !== blurBox.id));
                      if (selectedBlurId === blurBox.id) setSelectedBlurId(null);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="absolute -top-3.5 -right-3.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md border border-white cursor-pointer transition-transform hover:scale-125 z-50"
                    title="បិទ Blur Mask នេះ"
                  >
                    <X className="w-3 h-3 stroke-[2.5]" />
                  </button>

                  {/* 1. Round Corners Control Button / Handle (Top-Left, Outside) */}
                  <div
                    onMouseDown={(e) => handleBlurRadiusStart(e, blurBox.id)}
                    onTouchStart={(e) => handleBlurRadiusStart(e, blurBox.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasDraggedRef.current) return;
                      const nextR = blurRadius === 0 ? 12 : blurRadius <= 12 ? 24 : blurRadius <= 24 ? 40 : 0;
                      setBlurBoxes((prev: any) =>
                        prev.map((b: any) => (b.id === blurBox.id ? { ...b, borderRadius: nextR } : b))
                      );
                    }}
                    className="absolute -top-7 -left-7 w-6 h-6 bg-white hover:bg-slate-100 text-slate-900 rounded-full flex items-center justify-center shadow-lg border border-slate-300 cursor-pointer hover:scale-115 active:scale-95 transition-transform z-50 group"
                    title={`សារេជ្រុងមូល (Round Corners: ${blurRadius}px) - ចុច ឬ អូស`}
                  >
                    <svg
                      className="w-3.5 h-3.5 text-slate-800"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 18V10C6 7.79 7.79 6 10 6H18V18H6Z" />
                    </svg>
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/85 text-cyan-300 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow">
                      Radius: {blurRadius}px
                    </span>
                  </div>

                  {/* 2. Feather Control Button / Handle (Top-Center, Outside) */}
                  <div
                    onMouseDown={(e) => handleBlurFeatherStart(e, blurBox.id)}
                    onTouchStart={(e) => handleBlurFeatherStart(e, blurBox.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasDraggedRef.current) return;
                      const nextF = blurFeather === 0 ? 12 : blurFeather <= 12 ? 25 : blurFeather <= 25 ? 40 : 0;
                      setBlurBoxes((prev: any) =>
                        prev.map((b: any) => (b.id === blurBox.id ? { ...b, feather: nextF } : b))
                      );
                    }}
                    className="absolute -top-8 left-1/2 -translate-x-1/2 w-6 h-6 bg-white hover:bg-slate-100 text-slate-900 rounded-full flex items-center justify-center shadow-lg border border-slate-300 cursor-pointer hover:scale-115 active:scale-95 transition-transform z-50 group"
                    title={`សារេ Feather គែមទន់ (Feather: ${blurFeather}px) - ចុច ឬ អូសឡើង/ចុះ`}
                  >
                    {/* Double Chevron Up Icon */}
                    <svg
                      className="w-3.5 h-3.5 text-slate-800"
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
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/85 text-cyan-300 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow">
                      Feather: {blurFeather}px
                    </span>
                  </div>

                  {/* 3. Rotation Control Button / Handle (Bottom-Center, Outside) */}
                  <div
                    onMouseDown={(e) => handleBlurRotateStart(e, blurBox.id)}
                    onTouchStart={(e) => handleBlurRotateStart(e, blurBox.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasDraggedRef.current) return;
                      const nextRot = (blurRotation + 45) % 360;
                      setBlurBoxes((prev: any) =>
                        prev.map((b: any) => (b.id === blurBox.id ? { ...b, rotation: nextRot } : b))
                      );
                    }}
                    className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-6 h-6 bg-white hover:bg-slate-100 text-slate-900 rounded-full flex items-center justify-center shadow-lg border border-slate-300 cursor-pointer hover:scale-115 active:scale-95 transition-transform z-50 group"
                    title={`បង្វិល Mask (Rotation: ${blurRotation}°) - ចុច ឬ បង្វិល`}
                  >
                    {/* Circular arrows Rotate Icon */}
                    <svg
                      className="w-3.5 h-3.5 text-slate-800"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 21h5v-5" />
                    </svg>
                    <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/85 text-cyan-300 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow">
                      {blurRotation}°
                    </span>
                  </div>

                  {/* 4. Side Pill Handles for 1D Resizing (Top, Bottom, Left, Right) */}
                  {/* Top Edge Pill */}
                  <div
                    onMouseDown={(e) => handleBlurResizeStart(e, blurBox.id, 0, -1)}
                    onTouchStart={(e) => handleBlurResizeStart(e, blurBox.id, 0, -1)}
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-7 h-2.5 bg-white border border-slate-300 rounded-full shadow cursor-ns-resize hover:scale-115 active:scale-95 transition-transform z-30"
                    title="ទាញដើម្បីសារែកម្ពស់ខាងលើ"
                  />
                  {/* Bottom Edge Pill */}
                  <div
                    onMouseDown={(e) => handleBlurResizeStart(e, blurBox.id, 0, 1)}
                    onTouchStart={(e) => handleBlurResizeStart(e, blurBox.id, 0, 1)}
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-7 h-2.5 bg-white border border-slate-300 rounded-full shadow cursor-ns-resize hover:scale-115 active:scale-95 transition-transform z-30"
                    title="ទាញដើម្បីសារែកម្ពស់ខាងក្រោម"
                  />
                  {/* Left Edge Pill */}
                  <div
                    onMouseDown={(e) => handleBlurResizeStart(e, blurBox.id, -1, 0)}
                    onTouchStart={(e) => handleBlurResizeStart(e, blurBox.id, -1, 0)}
                    className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-7 bg-white border border-slate-300 rounded-full shadow cursor-ew-resize hover:scale-115 active:scale-95 transition-transform z-30"
                    title="ទាញដើម្បីសារេប្រវែងទទឹងខាងឆ្វេង"
                  />
                  {/* Right Edge Pill */}
                  <div
                    onMouseDown={(e) => handleBlurResizeStart(e, blurBox.id, 1, 0)}
                    onTouchStart={(e) => handleBlurResizeStart(e, blurBox.id, 1, 0)}
                    className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-7 bg-white border border-slate-300 rounded-full shadow cursor-ew-resize hover:scale-115 active:scale-95 transition-transform z-30"
                    title="ទាញដើម្បីសារេប្រវែងទទឹងខាងស្តាំ"
                  />

                  {/* 5. Four Corner Circle Handles */}
                  <div
                    onMouseDown={(e) => handleBlurResizeStart(e, blurBox.id, -1, -1)}
                    onTouchStart={(e) => handleBlurResizeStart(e, blurBox.id, -1, -1)}
                    className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nwse-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />
                  <div
                    onMouseDown={(e) => handleBlurResizeStart(e, blurBox.id, 1, -1)}
                    onTouchStart={(e) => handleBlurResizeStart(e, blurBox.id, 1, -1)}
                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nesw-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />
                  <div
                    onMouseDown={(e) => handleBlurResizeStart(e, blurBox.id, -1, 1)}
                    onTouchStart={(e) => handleBlurResizeStart(e, blurBox.id, -1, 1)}
                    className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nesw-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />
                  <div
                    onMouseDown={(e) => handleBlurResizeStart(e, blurBox.id, 1, 1)}
                    onTouchStart={(e) => handleBlurResizeStart(e, blurBox.id, 1, 1)}
                    className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nwse-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />
                </>
              )}
            </div>
          );
        })}

        {/* Interactive Draggable Text Overlays */}
        {textOverlays.map((textOverlay) => {
          const isSelected = textOverlay.id === selectedTextId;
          const tX = textOverlay.xPercent !== undefined ? textOverlay.xPercent : (textOverlay.x !== undefined ? textOverlay.x : 50);
          const tY = textOverlay.yPercent !== undefined ? textOverlay.yPercent : (textOverlay.y !== undefined ? textOverlay.y : 50);
          const tW = textOverlay.widthPercent !== undefined ? textOverlay.widthPercent : (textOverlay.width !== undefined ? textOverlay.width : 60);
          const textRadius = textOverlay.borderRadius !== undefined ? textOverlay.borderRadius : 8;
          const textFeather = textOverlay.feather !== undefined ? textOverlay.feather : 0;
          const textRotation = textOverlay.rotation !== undefined ? textOverlay.rotation : 0;
          const overlayOpacity = (textOverlay.opacity !== undefined ? textOverlay.opacity : 100) / 100;

          // Compute mask feathering dynamically to match rectangular shape or rounded corners
          let textMaskStyles: React.CSSProperties = {};
          if (textFeather > 0) {
            const fPctX = Math.min(45, Math.max(3, textFeather * 0.75));
            const fPctY = Math.min(45, Math.max(3, textFeather * 1.1));
            const maskX = `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,1) ${fPctX}%, rgba(0,0,0,1) ${100 - fPctX}%, rgba(0,0,0,0) 100%)`;
            const maskY = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) ${fPctY}%, rgba(0,0,0,1) ${100 - fPctY}%, rgba(0,0,0,0) 100%)`;

            if (textRadius <= 2) {
              textMaskStyles = {
                WebkitMaskImage: `${maskX}, ${maskY}`,
                maskImage: `${maskX}, ${maskY}`,
                WebkitMaskComposite: 'source-in',
                maskComposite: 'intersect',
              };
            } else {
              const innerRadiusPct = Math.max(10, 100 - (textFeather * 1.6 + textRadius * 0.4));
              const maskRadial = `radial-gradient(ellipse at center, rgba(0,0,0,1) ${innerRadiusPct}%, rgba(0,0,0,0) 100%)`;
              textMaskStyles = {
                WebkitMaskImage: `${maskX}, ${maskY}, ${maskRadial}`,
                maskImage: `${maskX}, ${maskY}, ${maskRadial}`,
                WebkitMaskComposite: 'source-in',
                maskComposite: 'intersect',
              };
            }
          }

          // Calculate animated position if moving loop is active
          const isAnimated = textOverlay.animation && textOverlay.animation !== 'none';
          const isBeingEdited = isDraggingText && isSelected;

          let displayX = tX;
          let displayY = tY;

          if (isAnimated && !isBeingEdited) {
            const timeSec = isPlaying ? currentTime : animClock;
            const speed = Math.max(1, Math.min(10, textOverlay.animationSpeed || 5));
            const T = Math.max(3, 22 - speed * 1.8);
            const cycleFrac = (((timeSec % T) + T) % T) / T; // 0..1

            switch (textOverlay.animation) {
              case 'up':
                displayY = 110 - cycleFrac * 125;
                break;
              case 'down':
                displayY = -15 + cycleFrac * 125;
                break;
              case 'left_to_right':
                displayX = -25 + cycleFrac * 150;
                break;
              case 'right_to_left':
                displayX = 125 - cycleFrac * 150;
                break;
              case 'bounce_vertical': {
                const wave = (1 - Math.cos(2 * Math.PI * cycleFrac)) * 0.5;
                displayY = 8 + wave * 84;
                break;
              }
              case 'bounce_horizontal': {
                const wave = (1 - Math.cos(2 * Math.PI * cycleFrac)) * 0.5;
                displayX = 10 + wave * 80;
                break;
              }
              case 'bounce_all': {
                const waveX = (1 - Math.cos(2 * Math.PI * cycleFrac)) * 0.5;
                const fracY = (((timeSec % (T * 1.37)) + (T * 1.37)) % (T * 1.37)) / (T * 1.37);
                const waveY = (1 - Math.cos(2 * Math.PI * fracY)) * 0.5;
                displayX = 10 + waveX * 80;
                displayY = 8 + waveY * 84;
                break;
              }
            }
          }

          return (
            <div
              key={textOverlay.id}
              style={{
                left: `${displayX}%`,
                top: `${displayY}%`,
                width: tW ? `${tW}%` : 'auto',
                maxWidth: '92%',
                transform: `translate(-50%, -50%) rotate(${textRotation}deg)`,
                opacity: overlayOpacity,
                touchAction: 'none',
              }}
              onMouseDown={(e) => {
                handleTextDragStart(e, textOverlay.id);
              }}
              onTouchStart={(e) => {
                handleTextDragStart(e, textOverlay.id);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (hasDraggedRef.current) {
                  hasDraggedRef.current = false;
                  return;
                }
                setSelectedTextId(textOverlay.id);
                setSelectedBlurId(null);
                if (onSelectSubId) onSelectSubId(null);
              }}
              className={`absolute z-25 cursor-grab active:cursor-grabbing p-1 select-none ${
                isDraggingText ? 'transition-none' : 'transition-transform duration-75'
              } ${isDraggingText && isSelected ? 'scale-[1.02] z-35' : ''}`}
            >
              {/* Text Body */}
              <div
                className="font-bold text-center drop-shadow-md px-3 py-1.5 whitespace-pre-wrap break-words w-full"
                style={{
                  fontFamily: textOverlay.fontFamily ? `"${textOverlay.fontFamily}", sans-serif` : '"Battambang", sans-serif',
                  fontSize: `${textOverlay.fontSize || 22}px`,
                  color: textOverlay.color || '#ffffff',
                  backgroundColor:
                    textOverlay.hasBg !== false &&
                    textOverlay.bgColor !== 'transparent' &&
                    textOverlay.backgroundColor !== ''
                      ? textOverlay.bgColor || textOverlay.backgroundColor || 'rgba(0, 0, 0, 0.65)'
                      : 'transparent',
                  borderRadius: `${textRadius}px`,
                  ...textMaskStyles,
                }}
              >
                {textOverlay.text || 'Text Overlay'}
              </div>

              {/* Selection Box, Dashed Center Lines, and Control Handles */}
              {isSelected && (
                <>
                  {/* Outer Bounding Box */}
                  <div
                    className="absolute inset-0 border border-white/80 pointer-events-none shadow-[0_0_12px_rgba(34,211,238,0.4)]"
                    style={{ borderRadius: `${textRadius}px` }}
                  />

                  {/* Horizontal Center Dashed Line */}
                  <div className="absolute top-1/2 left-0 right-0 h-[1px] border-b border-dashed border-white/60 pointer-events-none -translate-y-1/2" />

                  {/* Vertical Center Dashed Line */}
                  <div className="absolute top-0 bottom-0 left-1/2 w-[1px] border-r border-dashed border-white/60 pointer-events-none -translate-x-1/2" />

                  {/* 1. Round Corners (Radius) Control Button / Handle (Top-Left, Outside) */}
                  <div
                    onMouseDown={(e) => handleTextRadiusStart(e, textOverlay.id)}
                    onTouchStart={(e) => handleTextRadiusStart(e, textOverlay.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasDraggedRef.current) return;
                      const nextR = textRadius === 0 ? 8 : textRadius <= 8 ? 16 : textRadius <= 16 ? 30 : 0;
                      setTextOverlays((prev: any) =>
                        prev.map((t: any) => (t.id === textOverlay.id ? { ...t, borderRadius: nextR } : t))
                      );
                    }}
                    className="absolute -top-7 -left-7 w-6 h-6 bg-white hover:bg-slate-100 text-slate-900 rounded-full flex items-center justify-center shadow-lg border border-slate-300 cursor-pointer hover:scale-115 active:scale-95 transition-transform z-50 group"
                    title={`សារេ Round Corners (Radius: ${textRadius}px) - ចុច ឬ អូសឆ្វេង/ស្តាំ`}
                  >
                    <svg
                      className="w-3.5 h-3.5 text-slate-800"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 18V10C6 7.79 7.79 6 10 6H18V18H6Z" />
                    </svg>
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/85 text-cyan-300 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow">
                      Radius: {textRadius}px
                    </span>
                  </div>

                  {/* 2. Feather Control Button / Handle (Top-Center, Outside) */}
                  <div
                    onMouseDown={(e) => handleTextFeatherStart(e, textOverlay.id)}
                    onTouchStart={(e) => handleTextFeatherStart(e, textOverlay.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasDraggedRef.current) return;
                      const nextF = textFeather === 0 ? 12 : textFeather <= 12 ? 25 : textFeather <= 25 ? 40 : 0;
                      setTextOverlays((prev: any) =>
                        prev.map((t: any) => (t.id === textOverlay.id ? { ...t, feather: nextF } : t))
                      );
                    }}
                    className="absolute -top-8 left-1/2 -translate-x-1/2 w-6 h-6 bg-white hover:bg-slate-100 text-slate-900 rounded-full flex items-center justify-center shadow-lg border border-slate-300 cursor-pointer hover:scale-115 active:scale-95 transition-transform z-50 group"
                    title={`សារេ Feather គែមទន់ (Feather: ${textFeather}px) - ចុច ឬ អូសឡើង/ចុះ`}
                  >
                    <svg
                      className="w-3.5 h-3.5 text-slate-800"
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
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/85 text-cyan-300 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow">
                      Feather: {textFeather}px
                    </span>
                  </div>

                  {/* 3. Rotation Control Button / Handle (Bottom-Center, Outside) */}
                  <div
                    onMouseDown={(e) => handleTextRotateStart(e, textOverlay.id)}
                    onTouchStart={(e) => handleTextRotateStart(e, textOverlay.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasDraggedRef.current) return;
                      const nextRot = (textRotation + 45) % 360;
                      setTextOverlays((prev: any) =>
                        prev.map((t: any) => (t.id === textOverlay.id ? { ...t, rotation: nextRot } : t))
                      );
                    }}
                    className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-6 h-6 bg-white hover:bg-slate-100 text-slate-900 rounded-full flex items-center justify-center shadow-lg border border-slate-300 cursor-pointer hover:scale-115 active:scale-95 transition-transform z-50 group"
                    title={`បង្វិល Text Overlay (Rotation: ${textRotation}°) - ចុច ឬ បង្វិល`}
                  >
                    <svg
                      className="w-3.5 h-3.5 text-slate-800"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 21h5v-5" />
                    </svg>
                    <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/85 text-cyan-300 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow">
                      {textRotation}°
                    </span>
                  </div>

                  {/* 4. Side Pill Handles for 1D Resizing (Left & Right) */}
                  <div
                    onMouseDown={(e) => handleTextResizeStart(e, textOverlay.id, -1, 0)}
                    onTouchStart={(e) => handleTextResizeStart(e, textOverlay.id, -1, 0)}
                    className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-7 bg-white border border-slate-300 rounded-full shadow cursor-ew-resize hover:scale-115 active:scale-95 transition-transform z-30"
                    title="ទាញដើម្បីសារេប្រវែងទទឹងខាងឆ្វេង"
                  />
                  <div
                    onMouseDown={(e) => handleTextResizeStart(e, textOverlay.id, 1, 0)}
                    onTouchStart={(e) => handleTextResizeStart(e, textOverlay.id, 1, 0)}
                    className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-7 bg-white border border-slate-300 rounded-full shadow cursor-ew-resize hover:scale-115 active:scale-95 transition-transform z-30"
                    title="ទាញដើម្បីសារេប្រវែងទទឹងខាងស្តាំ"
                  />

                  {/* 5. Four Corner Circle Handles */}
                  <div
                    onMouseDown={(e) => handleTextResizeStart(e, textOverlay.id, -1, 0)}
                    onTouchStart={(e) => handleTextResizeStart(e, textOverlay.id, -1, 0)}
                    className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nwse-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />
                  <div
                    onMouseDown={(e) => handleTextResizeStart(e, textOverlay.id, 1, 0)}
                    onTouchStart={(e) => handleTextResizeStart(e, textOverlay.id, 1, 0)}
                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nesw-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />
                  <div
                    onMouseDown={(e) => handleTextResizeStart(e, textOverlay.id, -1, 0)}
                    onTouchStart={(e) => handleTextResizeStart(e, textOverlay.id, -1, 0)}
                    className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nesw-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />
                  <div
                    onMouseDown={(e) => handleTextResizeStart(e, textOverlay.id, 1, 0)}
                    onTouchStart={(e) => handleTextResizeStart(e, textOverlay.id, 1, 0)}
                    className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nwse-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />

                  {/* Delete Button (Top-Right Outside) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTextOverlays((prev: any) => prev.filter((t: any) => t.id !== textOverlay.id));
                      if (selectedTextId === textOverlay.id) setSelectedTextId(null);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="absolute -top-7 -right-7 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg border border-white cursor-pointer transition-transform hover:scale-125 z-50"
                    title="លុប Text Overlay"
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* Multi Image Overlays */}
        {imageOverlays.map((img) => {
          const isSelected = selectedImageId === img.id;
          const imgX = img.xPercent ?? img.x ?? 50;
          const imgY = img.yPercent ?? img.y ?? 50;
          const imgW = img.widthPercent ?? img.width ?? 30;
          const imgH = img.heightPercent ?? img.height;
          const imgRadius = img.borderRadius !== undefined ? img.borderRadius : 8;
          const imgFeather = img.feather !== undefined ? img.feather : 0;
          const imgRotation = img.rotation !== undefined ? img.rotation : 0;
          const imgOpacity = (img.opacity !== undefined ? img.opacity : 100) / 100;

          // Compute feather mask style
          let maskStyle: React.CSSProperties = {};
          if (imgFeather > 0) {
            const fPercent = Math.min(45, (imgFeather / 50) * 35);
            const maskGrad = `radial-gradient(ellipse at center, rgba(0,0,0,1) ${Math.max(0, 100 - fPercent * 2.5)}%, rgba(0,0,0,0) 100%)`;
            maskStyle = {
              WebkitMaskImage: maskGrad,
              maskImage: maskGrad,
            };
          }

          return (
            <div
              key={img.id}
              onClick={(e) => {
                e.stopPropagation();
                if (selectedImageId !== img.id) {
                  setSelectedImageId(img.id);
                  setSelectedBlurId(null);
                  setSelectedTextId(null);
                  if (onSelectSubId) onSelectSubId(null);
                }
              }}
              onMouseDown={(e) => handleImageDragStart(e, img.id)}
              onTouchStart={(e) => handleImageDragStart(e, img.id)}
              style={{
                position: 'absolute',
                left: `${imgX}%`,
                top: `${imgY}%`,
                width: `${imgW}%`,
                height: imgH ? `${imgH}%` : 'auto',
                transform: `translate(-50%, -50%) rotate(${imgRotation}deg)`,
                opacity: imgOpacity,
                cursor: isDraggingImage ? 'grabbing' : 'grab',
                zIndex: isSelected ? 40 : 25,
              }}
              className="group select-none"
            >
              {/* Image Content */}
              <div
                style={{
                  borderRadius: `${imgRadius}px`,
                  ...maskStyle,
                }}
                className="w-full h-full overflow-hidden flex items-center justify-center pointer-events-none"
              >
                <img
                  src={img.imageUrl}
                  alt={img.name || 'Overlay Image'}
                  className={`w-full ${imgH ? 'h-full' : 'h-auto'} object-contain block pointer-events-none select-none`}
                  draggable={false}
                />
              </div>

              {/* Selection Border and Control Handles */}
              {isSelected && (
                <>
                  {/* Bounding Box Frame */}
                  <div className="absolute inset-0 border-2 border-dashed border-cyan-400 rounded-sm pointer-events-none shadow-[0_0_12px_rgba(34,211,238,0.5)]">
                    <div className="absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-cyan-300/40 pointer-events-none" />
                    <div className="absolute left-1/2 top-0 bottom-0 w-px border-l border-dashed border-cyan-300/40 pointer-events-none" />
                  </div>

                  {/* 1. Corner Radius Handle (Top-Left) */}
                  <div
                    onMouseDown={(e) => handleImageRadiusStart(e, img.id)}
                    onTouchStart={(e) => handleImageRadiusStart(e, img.id)}
                    className="absolute -top-3.5 -left-3.5 w-6 h-6 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-full flex items-center justify-center shadow-lg border-2 border-white cursor-ew-resize hover:scale-125 active:scale-95 transition-transform z-40"
                    title={`សារេគែមកោង (Corner Radius: ${imgRadius}px)`}
                  >
                    <span className="text-[9px] font-bold font-mono">R</span>
                  </div>

                  {/* 2. Feather Edge Handle (Top-Center) */}
                  <div
                    onMouseDown={(e) => handleImageFeatherStart(e, img.id)}
                    onTouchStart={(e) => handleImageFeatherStart(e, img.id)}
                    className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-6 h-6 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-full flex items-center justify-center shadow-lg border-2 border-white cursor-ns-resize hover:scale-125 active:scale-95 transition-transform z-40"
                    title={`សារេភាពព្រាលគែម (Feather: ${imgFeather}px)`}
                  >
                    <span className="text-[9px] font-bold font-mono">F</span>
                  </div>

                  {/* 3. Rotate Control Handle (Bottom-Center) */}
                  <div
                    onMouseDown={(e) => handleImageRotateStart(e, img.id)}
                    onTouchStart={(e) => handleImageRotateStart(e, img.id)}
                    className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center cursor-grab active:cursor-grabbing hover:scale-115 transition-transform z-40"
                    title={`បង្វិលរូបភាព (Rotation: ${imgRotation}°)`}
                  >
                    <div className="w-0.5 h-3.5 bg-cyan-400" />
                    <div className="w-6 h-6 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                      <Move className="w-3 h-3 rotate-45 stroke-[2.5]" />
                    </div>
                    <span className="text-[9px] font-mono text-cyan-200 bg-slate-950/90 px-1 rounded mt-0.5 whitespace-nowrap border border-cyan-500/30">
                      {imgRotation}°
                    </span>
                  </div>

                  {/* 4. Side Pill Handles for 1D Resizing (Left & Right) */}
                  <div
                    onMouseDown={(e) => handleImageResizeStart(e, img.id, -1, 0)}
                    onTouchStart={(e) => handleImageResizeStart(e, img.id, -1, 0)}
                    className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-7 bg-white border border-slate-300 rounded-full shadow cursor-ew-resize hover:scale-115 active:scale-95 transition-transform z-30"
                    title="ទាញដើម្បីសារេប្រវែងទទឹងខាងឆ្វេង"
                  />
                  <div
                    onMouseDown={(e) => handleImageResizeStart(e, img.id, 1, 0)}
                    onTouchStart={(e) => handleImageResizeStart(e, img.id, 1, 0)}
                    className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-7 bg-white border border-slate-300 rounded-full shadow cursor-ew-resize hover:scale-115 active:scale-95 transition-transform z-30"
                    title="ទាញដើម្បីសារេប្រវែងទទឹងខាងស្តាំ"
                  />

                  {/* 5. Four Corner Circle Handles */}
                  <div
                    onMouseDown={(e) => handleImageResizeStart(e, img.id, -1, -1)}
                    onTouchStart={(e) => handleImageResizeStart(e, img.id, -1, -1)}
                    className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nwse-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />
                  <div
                    onMouseDown={(e) => handleImageResizeStart(e, img.id, 1, -1)}
                    onTouchStart={(e) => handleImageResizeStart(e, img.id, 1, -1)}
                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nesw-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />
                  <div
                    onMouseDown={(e) => handleImageResizeStart(e, img.id, -1, 1)}
                    onTouchStart={(e) => handleImageResizeStart(e, img.id, -1, 1)}
                    className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nesw-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />
                  <div
                    onMouseDown={(e) => handleImageResizeStart(e, img.id, 1, 1)}
                    onTouchStart={(e) => handleImageResizeStart(e, img.id, 1, 1)}
                    className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-slate-300 rounded-full shadow cursor-nwse-resize hover:scale-125 transition-transform z-30"
                    title="ទាញដើម្បីសារេទំហំ (Resize)"
                  />

                  {/* Delete Button (Top-Right Outside) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageOverlays((prev: any) => prev.filter((i: any) => i.id !== img.id));
                      if (selectedImageId === img.id) setSelectedImageId(null);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="absolute -top-7 -right-7 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg border border-white cursor-pointer transition-transform hover:scale-125 z-50"
                    title="លុប Image Overlay"
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* CapCut Style Interactive Subtitle Bounding Box & Drag Control Overlay */}
        {activeSub && (
          selectedSubId === activeSub.id ? (
            <div
              style={{
                ...getSubPositionStyle(),
                maxWidth: subtitleStyle.widthPercent ? `${subtitleStyle.widthPercent}%` : '92%',
                width: subtitleStyle.widthPercent ? `${subtitleStyle.widthPercent}%` : 'auto',
              }}
              onMouseDown={handleSubDragStart}
              onTouchStart={handleSubDragStart}
              onClick={(e) => e.stopPropagation()}
              className={`absolute z-20 cursor-grab active:cursor-grabbing transition-transform duration-75 ${
                isDraggingSub ? 'scale-[1.01] z-30' : ''
              }`}
            >
              {/* Subtitle Bounding Box Frame (CapCut style selection rectangle) */}
              <div className="relative group/capcut border-2 border-cyan-400/80 hover:border-cyan-300 rounded p-1.5 bg-black/40 backdrop-blur-[2px] shadow-[0_0_15px_rgba(6,182,212,0.35)] flex items-center justify-center">
                {/* Corner handles (CapCut design handles for scaling font size) */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingSub(true);
                    const startX = e.clientX;
                    const startSize = subtitleStyle.fontSize;
                    const handleResize = (moveEvent: MouseEvent) => {
                      const diff = startX - moveEvent.clientX;
                      const newSize = Math.max(12, Math.min(60, startSize + Math.round(diff / 4)));
                      onUpdateSubtitleStyle({ fontSize: newSize });
                    };
                    const stopResize = () => {
                      setIsDraggingSub(false);
                      window.removeEventListener('mousemove', handleResize);
                      window.removeEventListener('mouseup', stopResize);
                    };
                    window.addEventListener('mousemove', handleResize);
                    window.addEventListener('mouseup', stopResize);
                  }}
                  className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-cyan-500 rounded-full shadow cursor-nwse-resize hover:scale-125 transition-transform"
                  title="ទាញដើម្បីសារេទំហំ (Resize size)"
                />
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingSub(true);
                    const startX = e.clientX;
                    const startSize = subtitleStyle.fontSize;
                    const handleResize = (moveEvent: MouseEvent) => {
                      const diff = moveEvent.clientX - startX;
                      const newSize = Math.max(12, Math.min(60, startSize + Math.round(diff / 4)));
                      onUpdateSubtitleStyle({ fontSize: newSize });
                    };
                    const stopResize = () => {
                      setIsDraggingSub(false);
                      window.removeEventListener('mousemove', handleResize);
                      window.removeEventListener('mouseup', stopResize);
                    };
                    window.addEventListener('mousemove', handleResize);
                    window.addEventListener('mouseup', stopResize);
                  }}
                  className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-cyan-500 rounded-full shadow cursor-nesw-resize hover:scale-125 transition-transform"
                  title="ទាញដើម្បីសារេទំហំ (Resize size)"
                />
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingSub(true);
                    const startX = e.clientX;
                    const startSize = subtitleStyle.fontSize;
                    const handleResize = (moveEvent: MouseEvent) => {
                      const diff = startX - moveEvent.clientX;
                      const newSize = Math.max(12, Math.min(60, startSize + Math.round(diff / 4)));
                      onUpdateSubtitleStyle({ fontSize: newSize });
                    };
                    const stopResize = () => {
                      setIsDraggingSub(false);
                      window.removeEventListener('mousemove', handleResize);
                      window.removeEventListener('mouseup', stopResize);
                    };
                    window.addEventListener('mousemove', handleResize);
                    window.addEventListener('mouseup', stopResize);
                  }}
                  className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-cyan-500 rounded-full shadow cursor-nesw-resize hover:scale-125 transition-transform"
                  title="ទាញដើម្បីសារេទំហំ (Resize size)"
                />

                {/* Bottom Right Corner Handle (CapCut Font Size Resize) */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingSub(true);
                    const startX = e.clientX;
                    const startSize = subtitleStyle.fontSize;
                    const handleResize = (moveEvent: MouseEvent) => {
                      const diff = moveEvent.clientX - startX;
                      const newSize = Math.max(12, Math.min(60, startSize + Math.round(diff / 4)));
                      onUpdateSubtitleStyle({ fontSize: newSize });
                    };
                    const stopResize = () => {
                      setIsDraggingSub(false);
                      window.removeEventListener('mousemove', handleResize);
                      window.removeEventListener('mouseup', stopResize);
                    };
                    window.addEventListener('mousemove', handleResize);
                    window.addEventListener('mouseup', stopResize);
                  }}
                  className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-cyan-400 border-2 border-white rounded-full shadow cursor-nwse-resize flex items-center justify-center hover:scale-125 transition-transform z-10"
                  title="ទាញដើម្បីសារេទំហំអក្សរ (Resize font size)"
                >
                  <div className="w-1.5 h-1.5 bg-black rounded-full" />
                </div>

                {/* Left Side Handle (CapCut Length/Width Resize) */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingSub(true);
                    const startX = e.clientX;
                    const startWidth = subtitleStyle.widthPercent || 80;
                    const handleResize = (moveEvent: MouseEvent) => {
                      const diff = (startX - moveEvent.clientX) * 0.4;
                      const newWidth = Math.max(25, Math.min(100, Math.round(startWidth + diff)));
                      onUpdateSubtitleStyle({ widthPercent: newWidth });
                    };
                    const stopResize = () => {
                      setIsDraggingSub(false);
                      window.removeEventListener('mousemove', handleResize);
                      window.removeEventListener('mouseup', stopResize);
                    };
                    window.addEventListener('mousemove', handleResize);
                    window.addEventListener('mouseup', stopResize);
                  }}
                  className="absolute top-1/2 -left-2 -translate-y-1/2 w-2 h-5 bg-cyan-400 border border-white rounded-full cursor-ew-resize hover:scale-125 transition-transform shadow"
                  title="ទាញដើម្បីសារេប្រវែងទទឹង (Resize width)"
                />

                {/* Right Side Handle (CapCut Length/Width Resize) */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingSub(true);
                    const startX = e.clientX;
                    const startWidth = subtitleStyle.widthPercent || 80;
                    const handleResize = (moveEvent: MouseEvent) => {
                      const diff = (moveEvent.clientX - startX) * 0.4;
                      const newWidth = Math.max(25, Math.min(100, Math.round(startWidth + diff)));
                      onUpdateSubtitleStyle({ widthPercent: newWidth });
                    };
                    const stopResize = () => {
                      setIsDraggingSub(false);
                      window.removeEventListener('mousemove', handleResize);
                      window.removeEventListener('mouseup', stopResize);
                    };
                    window.addEventListener('mousemove', handleResize);
                    window.addEventListener('mouseup', stopResize);
                  }}
                  className="absolute top-1/2 -right-2 -translate-y-1/2 w-2 h-5 bg-cyan-400 border border-white rounded-full cursor-ew-resize hover:scale-125 transition-transform shadow"
                  title="ទាញដើម្បីសារេប្រវែងទទឹង (Resize width)"
                />

                {/* Top Handle (CapCut Height / Font Size Adjustment) */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingSub(true);
                    const startY = e.clientY;
                    const startSize = subtitleStyle.fontSize;
                    const handleResize = (moveEvent: MouseEvent) => {
                      const diff = startY - moveEvent.clientY;
                      const newSize = Math.max(12, Math.min(60, startSize + Math.round(diff / 3)));
                      onUpdateSubtitleStyle({ fontSize: newSize });
                    };
                    const stopResize = () => {
                      setIsDraggingSub(false);
                      window.removeEventListener('mousemove', handleResize);
                      window.removeEventListener('mouseup', stopResize);
                    };
                    window.addEventListener('mousemove', handleResize);
                    window.addEventListener('mouseup', stopResize);
                  }}
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-5 h-2 bg-cyan-400 border border-white rounded-full cursor-ns-resize hover:scale-125 transition-transform shadow"
                  title="ទាញដើម្បីសារែកម្ពស់/ទំហំ (Resize height/size)"
                />

                {/* Bottom Handle (CapCut Height / Font Size Adjustment) */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingSub(true);
                    const startY = e.clientY;
                    const startSize = subtitleStyle.fontSize;
                    const handleResize = (moveEvent: MouseEvent) => {
                      const diff = moveEvent.clientY - startY;
                      const newSize = Math.max(12, Math.min(60, startSize + Math.round(diff / 3)));
                      onUpdateSubtitleStyle({ fontSize: newSize });
                    };
                    const stopResize = () => {
                      setIsDraggingSub(false);
                      window.removeEventListener('mousemove', handleResize);
                      window.removeEventListener('mouseup', stopResize);
                    };
                    window.addEventListener('mousemove', handleResize);
                    window.addEventListener('mouseup', stopResize);
                  }}
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-2 bg-cyan-400 border border-white rounded-full cursor-ns-resize hover:scale-125 transition-transform shadow"
                  title="ទាញដើម្បីសារែកម្ពស់/ទំហំ (Resize height/size)"
                />

                {/* Subtitle Text */}
                <span
                  style={getSubStyleCSS()}
                  className="inline-block leading-relaxed font-semibold drop-shadow-md font-khmer px-2 py-0.5 text-center whitespace-pre-line pointer-events-none select-none w-full"
                >
                  {displaySubtitleText || activeSub.text}
                </span>
              </div>
            </div>
          ) : (
            /* Clean Subtitle View (When not selected) */
            <div
              style={{
                ...getSubPositionStyle(),
                maxWidth: subtitleStyle.widthPercent ? `${subtitleStyle.widthPercent}%` : '92%',
                width: subtitleStyle.widthPercent ? `${subtitleStyle.widthPercent}%` : 'auto',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectSubId) onSelectSubId(activeSub.id);
                setSelectedBlurId(null);
                setSelectedTextId(null);
              }}
              className="absolute z-20 cursor-pointer hover:border hover:border-cyan-400/40 rounded transition-all"
              title="ចុចលើអត្ថបទនេះដើម្បីបង្ហាញប្រអប់សារេ"
            >
              <span
                style={getSubStyleCSS()}
                className="inline-block leading-relaxed font-semibold drop-shadow-md font-khmer px-2 py-0.5 text-center whitespace-pre-line select-none w-full"
              >
                {displaySubtitleText || activeSub.text}
              </span>
            </div>
          )
        )}

        {/* Video Controls Overlay - Appears only when holding/hovering mouse on video */}
        {Boolean(videoUrl) && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 z-30 p-3 pt-8 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col gap-2 rounded-b-lg opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-300"
          >
            {/* Top row: Current Time (Left) & Total Duration (Right) */}
            <div className="flex items-center justify-between font-mono text-xs px-0.5">
              <span className="text-cyan-400 font-bold tracking-wide">
                {formatTimeCode(currentTime)}
              </span>
              <span className="text-slate-200 font-bold tracking-wide">
                {formatTimeCode(duration)}
              </span>
            </div>

            {/* Middle row: Timeline progress bar */}
            <div className="w-full flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.01}
                value={currentTime}
                onChange={(e) => onTimeUpdate(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-700/80 rounded-full appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Bottom row: Play/Stop (Left) & Volume (Right) */}
            <div className="flex items-center justify-between pt-1">
              {/* Play and Stop Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onPlayPause}
                  className="w-8 h-8 rounded-lg bg-[#0d1626]/90 border border-[#21324d] text-white flex items-center justify-center hover:border-cyan-400 hover:bg-[#14223b] active:scale-95 transition-all cursor-pointer"
                  title={isPlaying ? 'Pause (ផ្អាក)' : 'Play (ចុចលេង)'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current text-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-current text-white ml-0.5" />
                  )}
                </button>

                <button
                  onClick={() => {
                    if (isPlaying) onPlayPause();
                    onTimeUpdate(0);
                  }}
                  className="w-8 h-8 rounded-lg bg-[#0d1626]/90 border border-[#21324d] text-white flex items-center justify-center hover:border-cyan-400 hover:bg-[#14223b] active:scale-95 transition-all cursor-pointer"
                  title="Stop (បញ្ឈប់ និងត្រឡប់ទៅដើម)"
                >
                  <Square className="w-3.5 h-3.5 fill-current text-white" />
                </button>
              </div>

              {/* Volume & Mute Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onToggleMuteVocals}
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
                    isMuteOriginalVocals
                      ? 'bg-red-500/20 border-red-500/60 text-red-400'
                      : 'bg-[#0d1626]/90 border-[#21324d] text-cyan-400 hover:border-cyan-400'
                  }`}
                  title={
                    isMuteOriginalVocals
                      ? 'បើកសម្លេងដើមវិញ (Unmute)'
                      : 'បិទសម្លេងដើម (Mute Original Sound)'
                  }
                >
                  {isMuteOriginalVocals ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-cyan-400" />
                  )}
                </button>

                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuteOriginalVocals ? 0 : bgmMixLevel}
                  onChange={(e) => {
                    if (isMuteOriginalVocals) onToggleMuteVocals();
                    onChangeBgmMix(Number(e.target.value));
                  }}
                  className="w-20 sm:w-24 h-1.5 bg-slate-700/80 rounded-full appearance-none cursor-pointer accent-cyan-400"
                  title="កម្រិតសម្លេង (Volume level)"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subtitle Styling Settings Card (Tabbed Interface) */}
      <div className="bg-[#101826] border border-[#1b283e] rounded-lg p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-[#1b283e] pb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-cyan-400 text-sm font-bold font-mono">T</span>
            <span className="text-xs font-semibold text-white tracking-wide">Subtitle Style Editor</span>
          </div>
          <span className="text-[10px] text-slate-400 font-khmer">សារេស្ទីលអក្សរ</span>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-[#0b1019] p-1 rounded-lg border border-[#1b283e]">
          <button
            type="button"
            onClick={() => setActiveStyleTab('text')}
            className={`flex-1 py-1.5 px-1 rounded-md font-mono text-[11px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer text-center leading-tight ${
              activeStyleTab === 'text'
                ? 'bg-[#1a273d] text-cyan-300 font-bold border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.25)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#131c2c]'
            }`}
          >
            <Type className="w-4 h-4 text-cyan-400" />
            <span>Font & Text</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveStyleTab('preset')}
            className={`flex-1 py-1.5 px-1 rounded-md font-mono text-[11px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer text-center leading-tight ${
              activeStyleTab === 'preset'
                ? 'bg-[#1a273d] text-cyan-300 font-bold border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.25)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#131c2c]'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Presets</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveStyleTab('bg')}
            className={`flex-1 py-1.5 px-1 rounded-md font-mono text-[11px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer text-center leading-tight ${
              activeStyleTab === 'bg'
                ? 'bg-[#1a273d] text-cyan-300 font-bold border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.25)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#131c2c]'
            }`}
          >
            <Palette className="w-4 h-4 text-purple-400" />
            <span>Background</span>
          </button>
        </div>

        {/* Tab 1: Font & Text */}
        {activeStyleTab === 'text' && (
          <div className="flex flex-col gap-2.5 pt-1">
            <div className="grid grid-cols-2 gap-2 text-xs items-start">
              <div>
                <div className="flex items-center justify-between h-5 mb-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 font-mono">Font:</span>
                    {detectedFonts.allFonts.length > 0 && (
                      <span className="text-[9px] text-cyan-400 font-mono font-semibold">
                        ({detectedFonts.allFonts.length})
                      </span>
                    )}
                  </div>
                  {detectedFonts.hasLocalFontAccess && (
                    <button
                      type="button"
                      onClick={handleScanAllLocalFonts}
                      disabled={isScanningFonts}
                      className="p-0.5 rounded text-cyan-400 hover:text-cyan-200 hover:bg-[#1f304d] transition-colors cursor-pointer flex items-center justify-center"
                      title="ស្កេន Font ទាំងអស់នៅលើកុំព្យូទ័រ (Scan All PC Fonts)"
                      aria-label="ស្កេន Font"
                    >
                      <RefreshCw className={`w-3 h-3 ${isScanningFonts ? 'animate-spin text-amber-400' : ''}`} />
                    </button>
                  )}
                </div>

                <select
                  value={subtitleStyle.fontFamily}
                  onChange={(e) => {
                    if (e.target.value === '__scan_local_fonts__') {
                      handleScanAllLocalFonts();
                      return;
                    }
                    onUpdateSubtitleStyle({ fontFamily: e.target.value });
                  }}
                  className="w-full h-8 bg-[#162133] border border-[#23334d] text-cyan-200 rounded px-2 text-xs focus:outline-none focus:border-cyan-500 font-khmer cursor-pointer"
                >
                  {detectedFonts.hasLocalFontAccess && (
                    <option value="__scan_local_fonts__" className="text-amber-300 font-bold bg-[#1a263d]">
                      🔄 ស្កេន Font ក្នុងកុំព្យូទ័រទាំងអស់ (Scan All PC Fonts)...
                    </option>
                  )}

                  {/* Fallback to ensure current font is visible if not in lists */}
                  {subtitleStyle.fontFamily &&
                    !detectedFonts.allFonts.includes(subtitleStyle.fontFamily) && (
                      <option value={subtitleStyle.fontFamily}>
                        {subtitleStyle.fontFamily} (បច្ចុប្បន្ន)
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
              </div>

              <div className="grid grid-cols-2 gap-1.5 items-start">
                <div>
                  <div className="flex items-center h-5 mb-1">
                    <label className="text-[10px] text-slate-400 font-mono">Size:</label>
                  </div>
                  <div className="flex items-center gap-1 h-8">
                    <input
                      type="number"
                      min={12}
                      max={60}
                      value={subtitleStyle.fontSize}
                      onChange={(e) => onUpdateSubtitleStyle({ fontSize: Number(e.target.value) })}
                      className="w-full h-8 bg-[#162133] border border-[#23334d] text-white rounded px-1.5 text-xs font-mono text-center focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-[10px] text-slate-400 font-mono select-none">px</span>
                  </div>
                </div>

                <div className="w-full">
                  <CustomColorPicker
                    label="Color"
                    color={subtitleStyle.color}
                    onChange={(hex) => onUpdateSubtitleStyle({ color: hex })}
                  />
                </div>
              </div>
            </div>

            {/* Display Lines Mode & Width Grid */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#1b283e]">
              <div>
                <div className="flex items-center justify-between h-5 mb-1">
                  <span className="text-[10px] text-slate-400 font-mono">Lines (ជួរ):</span>
                </div>
                <select
                  value={subtitleStyle.maxLines !== undefined ? subtitleStyle.maxLines : 0}
                  onChange={(e) => onUpdateSubtitleStyle({ maxLines: Number(e.target.value) as 0 | 1 | 2 })}
                  className="w-full h-8 bg-[#162133] border border-[#23334d] text-cyan-200 rounded px-2 text-xs focus:outline-none focus:border-cyan-500 font-khmer cursor-pointer"
                >
                  <option value={0}>Auto (ទាំងអស់)</option>
                  <option value={1}>1 Line (1 ជួរ)</option>
                  <option value={2}>2 Lines (2 ជួរ)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between h-5 mb-1">
                  <span className="text-[10px] text-slate-400 font-mono">Box Width:</span>
                  <span className="text-cyan-400 font-bold font-mono text-xs">{subtitleStyle.widthPercent || 80}%</span>
                </div>
                <div className="flex items-center h-8 px-2.5 bg-[#162133] border border-[#23334d] rounded">
                  <input
                    type="range"
                    min={25}
                    max={100}
                    value={subtitleStyle.widthPercent || 80}
                    onChange={(e) => onUpdateSubtitleStyle({ widthPercent: Number(e.target.value) })}
                    className="w-full accent-cyan-400 h-1.5 bg-[#0b1019] rounded cursor-pointer"
                    title={`Box Width: ${subtitleStyle.widthPercent || 80}%`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Presets */}
        {activeStyleTab === 'preset' && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-slate-300 font-sans tracking-wide font-medium">
                Preset style
              </label>
              <label className="flex items-center gap-1.5 text-xs text-cyan-300 font-mono cursor-pointer select-none">
                <span className="text-[11px] text-slate-300 font-khmer">ប្រើ Preset</span>
                <input
                  type="checkbox"
                  checked={usePresetStyle}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setUsePresetStyle(checked);
                    if (!checked) {
                      onUpdateSubtitleStyle({ styleType: 'none', bgColor: '', bgOpacity: 100 });
                    }
                  }}
                  className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
                />
              </label>
            </div>

            {usePresetStyle ? (
              <div className="grid grid-cols-6 gap-2 p-2.5 bg-[#0b1019] border border-[#1b283e] rounded-xl max-h-56 overflow-y-auto custom-scrollbar">
                {PRESET_STYLES.map((preset) => {
                  const isSelected =
                    subtitleStyle.styleType === preset.id ||
                    (preset.id === 'none' && (!subtitleStyle.styleType || subtitleStyle.styleType === 'none'));

                  const presetBg = preset.style.backgroundColor as string | undefined;
                  const activeBg = isSelected && subtitleStyle.bgColor ? subtitleStyle.bgColor : presetBg;
                  const activeOpacity = isSelected && subtitleStyle.bgOpacity !== undefined ? subtitleStyle.bgOpacity : 100;
                  const previewBgColor = activeBg ? hexToRgba(activeBg, activeOpacity) : '#1c2636';

                  if (preset.id === 'none') {
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onUpdateSubtitleStyle({ styleType: 'none', color: '#ffffff', bgColor: '', bgOpacity: 100 })}
                        className={`h-9 w-full rounded-lg flex items-center justify-center transition-all cursor-pointer bg-[#1c2636] hover:bg-[#253247] ${
                          isSelected
                            ? 'ring-2 ring-cyan-400 bg-cyan-950/40 border border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                            : 'border border-[#26354d] hover:border-slate-500'
                        }`}
                        title="None (គ្មានស្ទីល)"
                      >
                        <svg
                          className="w-5 h-5 text-slate-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="m4.9 4.9 14.2 14.2" />
                        </svg>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        onUpdateSubtitleStyle({
                          styleType: preset.id,
                          color: preset.defaultColor,
                          bgColor: presetBg || '',
                        })
                      }
                      className={`h-9 w-full rounded-lg flex items-center justify-center transition-all cursor-pointer overflow-hidden relative ${
                        isSelected
                          ? 'ring-2 ring-cyan-400 border border-cyan-400 bg-cyan-950/30 scale-105 z-10 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                          : 'border border-[#26354d] hover:border-slate-400 bg-[#1c2636]'
                      }`}
                      style={{
                        backgroundColor: previewBgColor,
                      }}
                      title={preset.name}
                    >
                      <span
                        style={{
                          fontFamily: 'sans-serif',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          lineHeight: '1',
                          color: preset.style.color,
                          textShadow: preset.style.textShadow,
                          padding: preset.style.backgroundColor ? '2px 4px' : '0',
                          borderRadius: preset.style.backgroundColor ? '3px' : '0',
                        }}
                        className="select-none pointer-events-none"
                      >
                        Aa
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-[#0b1019] border border-[#1b283e] rounded-xl text-center text-xs text-slate-400 font-khmer">
                សូមគ្រេចជម្រើស "ប្រើ Preset" ខាងលើ ដើម្បីជ្រើសរើសស្ទីលអក្សរដែលត្រៀមស្រាប់។
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Background */}
        {activeStyleTab === 'bg' && (
          <div className="bg-[#121c2d] border border-[#1e2d45] rounded-lg p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-200 font-khmer font-medium">ពណ៌ផ្ទៃក្រោយ (BG Color & Opacity)</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="w-full">
                <CustomColorPicker
                  label="BG Color"
                  color={
                    subtitleStyle.bgColor ||
                    (PRESET_STYLES.find((p) => p.id === subtitleStyle.styleType)?.style.backgroundColor as string) ||
                    '#000000'
                  }
                  onChange={(hex) => onUpdateSubtitleStyle({ bgColor: hex })}
                />
              </div>

              <div className="w-full">
                <div className="flex items-center justify-between h-5 mb-1">
                  <label className="text-[10px] text-slate-400 font-mono">BG Opacity:</label>
                  <span className="text-cyan-400 font-bold font-mono text-xs">
                    {subtitleStyle.bgOpacity !== undefined ? subtitleStyle.bgOpacity : 100}%
                  </span>
                </div>
                <div className="flex items-center h-8 px-2.5 bg-[#162133] border border-[#23334d] hover:border-cyan-400/60 rounded shadow-sm transition-colors">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={subtitleStyle.bgOpacity !== undefined ? subtitleStyle.bgOpacity : 100}
                    onChange={(e) => onUpdateSubtitleStyle({ bgOpacity: Number(e.target.value) })}
                    className="w-full accent-cyan-400 h-1.5 bg-[#0b1019] rounded cursor-pointer"
                    title={`BG Opacity: ${subtitleStyle.bgOpacity !== undefined ? subtitleStyle.bgOpacity : 100}%`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Vocal Remover Card */}
      <div className="bg-[#101826] border border-[#1b283e] rounded-lg p-3 flex flex-col gap-2">
        {isolatedBgmUrl && (
          <audio
            ref={bgmAudioRef}
            src={isolatedBgmUrl}
            preload="auto"
            className="hidden"
          />
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-xs font-bold text-cyan-300 font-mono">AI VOCAL REMOVER (DEMUCS)</span>
          </div>
          {isSeparatingVocals && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-fuchsia-300 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-fuchsia-400" />
              <span>កំពុងបំបែកសំឡេង...</span>
            </span>
          )}
          {!isSeparatingVocals && vocalRemoverMode === 'mute_vocal' && isolatedBgmUrl && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>BGM Ready</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (onSelectVocalRemoverMode) {
                onSelectVocalRemoverMode('mute_original');
              } else {
                onToggleMuteVocals();
              }
            }}
            className={`py-2 px-2 rounded-sm border text-[11px] font-mono font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
              vocalRemoverMode === 'mute_original'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                : 'bg-[#09101b] border-[#1c2a40] text-slate-400 hover:text-slate-300'
            }`}
            title="Mute Original (បិទសំឡេងវីដេអូដើមទាំងស្រុង)"
          >
            <span>🔇 Mute Original</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onSelectVocalRemoverMode) {
                onSelectVocalRemoverMode('mute_vocal');
              } else {
                onToggleMuteVocals();
              }
            }}
            className={`py-2 px-2 rounded-sm border text-[11px] font-mono font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
              vocalRemoverMode === 'mute_vocal'
                ? 'bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-200'
                : 'bg-[#09101b] border-[#1c2a40] text-slate-400 hover:text-slate-300'
            }`}
            title="Mute Vocal Only (AI Vocal Isolation - លុបតែសំឡេងនិយាយ រក្សាភ្លេង BGM & SFX)"
          >
            {isSeparatingVocals ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-300" />
                <span>Separating...</span>
              </>
            ) : (
              <span>🎤 Mute Vocal Only</span>
            )}
          </button>
        </div>
      </div>

      {/* Workspace Tools & Background Audio Level */}
      <div className="bg-[#101826] border border-[#1b283e] rounded-lg p-3 flex flex-col gap-2 text-xs">
        <div className="text-[11px] font-mono text-slate-400 tracking-wider">
          WORKSPACE TOOLS (ឧបករណ៍គ្រប់គ្រងឯកសារ)
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 mb-1">
            <span>BGM MIX LEVEL</span>
            <span className="text-cyan-400 font-bold">{bgmMixLevel}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={bgmMixLevel}
            onChange={(e) => onChangeBgmMix(Number(e.target.value))}
            className="w-full accent-cyan-400 h-1.5 bg-[#1b283d] rounded cursor-pointer"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onExportSRT}
            className="flex items-center justify-center gap-1.5 bg-[#162133] hover:bg-[#1d2b42] border border-[#23334d] text-slate-200 py-1.5 rounded font-mono text-xs transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>EXPORT SRT</span>
          </button>

          <button
            onClick={onClearData}
            className="flex items-center justify-center gap-1.5 bg-[#162133] hover:bg-rose-950/40 border border-[#23334d] hover:border-rose-800 text-slate-300 hover:text-rose-300 py-1.5 rounded font-mono text-xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>CLEAR DATA</span>
          </button>
        </div>
      </div>

      {/* Footer System Terminal Info */}
      <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-[#1b263b] flex flex-col gap-0.5">
        <div>CLIENT_DOCK_PORT_ACTIVE :: LOCAL_BUFFER</div>
        <div className="flex items-center gap-1 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>AUDIO_MIXER_LATENCY: 0.012ms (FAST)</span>
        </div>
      </div>
    </aside>
  );
};
