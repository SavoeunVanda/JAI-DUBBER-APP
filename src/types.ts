export interface BlurBoxItem {
  id: string;
  x: number; // percentage (0..100)
  y: number; // percentage (0..100)
  xPercent?: number; // percentage alias (0..100)
  yPercent?: number; // percentage alias (0..100)
  width: number; // percentage (5..90)
  height: number; // percentage (5..90)
  widthPercent?: number; // percentage alias (5..90)
  heightPercent?: number; // percentage alias (5..90)
  blurAmount: number; // in px (4..40)
  borderRadius?: number; // in px (0..60)
  feather?: number; // in px (0..50)
  rotation?: number; // in degrees (0..360)
  opacity?: number; // 0..100
}

export type TextOverlayAnimation =
  | 'none'
  | 'up'
  | 'down'
  | 'left_to_right'
  | 'right_to_left'
  | 'bounce_vertical'
  | 'bounce_horizontal'
  | 'bounce_all';

export interface TextOverlayItem {
  id: string;
  text: string;
  fontFamily?: string;
  x: number; // percentage (0..100)
  y: number; // percentage (0..100)
  xPercent?: number; // percentage alias (0..100)
  yPercent?: number; // percentage alias (0..100)
  fontSize: number; // in px (10..72)
  color: string; // hex color
  bgColor: string; // hex or rgba color
  backgroundColor?: string; // alias for bgColor
  hasBg: boolean;
  width?: number; // percentage alias (15..95)
  widthPercent: number; // percentage (15..95)
  height?: number; // percentage alias
  heightPercent?: number; // percentage alias (4..90)
  borderRadius?: number; // in px (0..60)
  feather?: number; // in px (0..50)
  rotation?: number; // in degrees (0..360)
  opacity?: number; // 0..100
  animation?: TextOverlayAnimation;
  animationSpeed?: number; // 1..10 (default: 5)
}

export interface ImageOverlayItem {
  id: string;
  imageUrl: string;
  name?: string;
  x: number; // percentage (0..100)
  y: number; // percentage (0..100)
  xPercent?: number; // percentage alias (0..100)
  yPercent?: number; // percentage alias (0..100)
  width: number; // percentage (5..95)
  widthPercent: number; // percentage (5..95)
  height?: number;
  heightPercent?: number;
  borderRadius?: number; // in px (0..60)
  feather?: number; // in px (0..50)
  rotation?: number; // in degrees (0..360)
  opacity?: number; // 0..100
}

export interface SubtitleSegment {
  id: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  text: string;      // Khmer subtitle text
  originalText?: string;
  /** What the translator understood the line to mean, from the reading pass. */
  meaning?: string;
  voiceProfile: 'km-KH-PisethNeural' | 'km-KH-SreymomNeural';
  gender: 'male' | 'female';
  speed: number;     // 0.8 to 1.5
  ttsSpeed?: number;  // Auto-calculated exact speed to match segment duration
  audioUrl?: string; // Generated TTS audio URL
  audioDuration?: number; // Actual measured duration of TTS audio in seconds
  isGenerating?: boolean;
  isChecked?: boolean;
}

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;  // in px
  color: string;     // hex color
  styleType: string;
  position: 'top' | 'mid' | 'bot';
  xPercent?: number; // 0..100 horizontal center percentage
  yPercent?: number; // 0..100 vertical center percentage
  widthPercent?: number; // 20..100 max width percentage of video container
  bgColor?: string;
  bgOpacity?: number;
  maxLines?: 1 | 2 | 0; // 1 = 1 line (1 ជួរ), 2 = 2 lines (2 ជួរ), 0 = Auto (ស្វ័យប្រវត្តិ)
}

export interface DemoVideo {
  id: string;
  title: string;
  titleKhmer?: string;
  videoUrl: string;
  duration: number;
  aspectRatio: '16:9' | '9:16';
  defaultSubtitles: Omit<SubtitleSegment, 'id'>[];
  originalPath?: string;
  category?: string;
}

export interface ExportSettings {
  includeSubtitles: boolean;
  muteOriginalVocals: boolean;
  bgmMixLevel: number; // 0 - 100
  exportFormat: 'mp4' | 'mp3' | 'srt';
}

export interface GeminiApiKeyConfig {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
  addedAt: number;
}
