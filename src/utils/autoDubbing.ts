/**
 * autoDubbing.ts
 * Client bridge for Native Python Auto Dubbing (JAI AUTO DUBBING).
 *
 * Communicates with backend endpoints (/api/autodub/start, /api/autodub/cancel, /api/autodub/events)
 * to process video files directly on disk via Python, FFmpeg, Gemini Multimodal, and Edge TTS.
 */

import { SubtitleStyle } from '../types';
import { globalConsoleLogger } from './consoleLogger';

export interface AutoDubVideo {
  name: string;
  path: string;
  size: number;
  alreadyDubbed?: boolean;
  outputPath?: string;
}

export type AutoDubStage =
  | 'idle'
  | 'starting'
  | 'processing'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface AutoDubProgress {
  index: number;
  total: number;
  video: AutoDubVideo;
  stage: AutoDubStage;
  detail?: string;
  percent: number;
}

export interface AutoDubResult {
  video: AutoDubVideo;
  ok: boolean;
  reason?: string;
  outputPath?: string;
  lines?: number;
}

export interface AutoDubOptions {
  sourceFolder: string;
  outputFolder: string;
  apiKeys?: string[];
  geminiModel?: string;
  subtitleStyle?: SubtitleStyle;
  dramaStyle?: string;
  voice?: string;
  voiceRate?: number;
  voicePitch?: number;
  audioMode?: 'mute_original' | 'mute_vocal' | 'duck_original';
  duckVolume?: number;
  syncOffsetMs?: number;
  burnSubtitles?: boolean;
  subtitleFont?: string;
  subtitleYPct?: number;
  subtitleColor?: string;
  subtitleFontSize?: number;
  subtitleWidthPct?: number;
  subtitleBgColor?: string;
  subtitleBgOpacity?: number;
  subtitleStyleType?: string;
  subtitleMaxLines?: number;
  skipExisting?: boolean;
  selectedFiles?: string[];
  onProgress?: (progress: AutoDubProgress) => void;
  onVideoDone?: (result: AutoDubResult) => void;
  onQuotaExhausted?: (video: AutoDubVideo, index: number, total: number) => void;
  isCancelled?: () => boolean;
}

export class AutoDubCancelled extends Error {
  constructor() {
    super('Auto dubbing cancelled');
    this.name = 'AutoDubCancelled';
  }
}

/**
 * Lists video files in the specified folder with natural sorting
 * and checks whether each video is already dubbed in the output folder.
 */
export async function listVideosInFolder(
  folder: string,
  exportFolder?: string
): Promise<AutoDubVideo[]> {
  const url = `/api/autodub/list-videos?source=${encodeURIComponent(folder)}&export=${encodeURIComponent(exportFolder || '')}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data?.error || 'មិនអាចអានបញ្ជីឈ្មោះវីដេអូបានទេ។');
  }
  return Array.isArray(data.files) ? data.files : [];
}

/**
 * Cancels any currently running Auto Dubbing process.
 */
export async function cancelAutoDubbing(): Promise<void> {
  try {
    await fetch('/api/autodub/cancel', { method: 'POST' });
  } catch (err) {
    console.error('Failed to send cancel signal to server:', err);
  }
}

/**
 * Runs the Auto Dubbing process via the Native Python Engine.
 * Streams real-time progress events over SSE until completion or cancellation.
 */
export async function runAutoDubbing(options: AutoDubOptions): Promise<AutoDubResult[]> {
  const results: AutoDubResult[] = [];

  const payload = {
    sourceFolder: options.sourceFolder,
    outputFolder: options.outputFolder,
    apiKeys: options.apiKeys || [],
    geminiModel: options.geminiModel || 'gemini-3.5-flash',
    dramaStyle: options.dramaStyle || 'Historical_Royal',
    voice: options.voice || 'auto',
    voiceRate: options.voiceRate || 0,
    voicePitch: options.voicePitch || 0,
    audioMode: options.audioMode || 'mute_original',
    duckVolume: options.duckVolume !== undefined ? options.duckVolume : 0.15,
    syncOffsetMs: options.syncOffsetMs || 0,
    subtitleBurn: options.burnSubtitles !== undefined ? options.burnSubtitles : true,
    subtitleFont: options.subtitleFont || options.subtitleStyle?.fontFamily || 'Battambang',
    subtitleYPct: options.subtitleYPct !== undefined ? options.subtitleYPct : (options.subtitleStyle?.yPercent !== undefined ? options.subtitleStyle.yPercent : 70),
    subtitleColor: options.subtitleColor || options.subtitleStyle?.color || '#facc15',
    subtitleFontSize: options.subtitleFontSize || options.subtitleStyle?.fontSize || 15,
    subtitleWidthPct: options.subtitleWidthPct || options.subtitleStyle?.widthPercent || 88,
    subtitleBgColor: options.subtitleBgColor || options.subtitleStyle?.bgColor || '#000000',
    subtitleBgOpacity: options.subtitleBgOpacity !== undefined ? options.subtitleBgOpacity : (options.subtitleStyle?.bgOpacity !== undefined ? options.subtitleStyle.bgOpacity : 100),
    subtitleStyleType: options.subtitleStyleType || options.subtitleStyle?.styleType || 'box',
    subtitleMaxLines: options.subtitleMaxLines !== undefined ? options.subtitleMaxLines : (options.subtitleStyle?.maxLines !== undefined && options.subtitleStyle.maxLines > 0 ? options.subtitleStyle.maxLines : 1),
    skipExisting: options.skipExisting !== undefined ? options.skipExisting : true,
    selectedFiles: options.selectedFiles || [],
  };

  globalConsoleLogger.add(
    `🚀 ចាប់ផ្ដើម Auto Dubbing (JAI AUTO DUBBING Python Native)... ថត: ${options.sourceFolder}`,
    'info'
  );

  return new Promise<AutoDubResult[]>((resolve, reject) => {
    let completed = false;
    let sse: EventSource | null = new EventSource('/api/autodub/events');

    let currentVideo: AutoDubVideo = {
      name: '',
      path: '',
      size: 0,
    };
    let currentIndex = 0;
    let totalVideos = 0;
    let currentEpisodePercent = 0;

    let pollInterval: any = null;

    const cleanup = () => {
      completed = true;
      if (cancelCheckInterval) clearInterval(cancelCheckInterval);
      if (pollInterval) clearInterval(pollInterval);
      if (sse) {
        sse.close();
        sse = null;
      }
    };

    // Periodic check for cancellation from client options
    const cancelCheckInterval = setInterval(() => {
      if (options.isCancelled && options.isCancelled()) {
        cancelAutoDubbing().finally(() => {
          cleanup();
          reject(new AutoDubCancelled());
        });
      }
    }, 500);

    // Fallback polling on /api/autodub/status in case SSE disconnects
    pollInterval = setInterval(async () => {
      if (completed) return;
      try {
        const res = await fetch('/api/autodub/status');
        if (res.ok) {
          const data = await res.json();
          if (data?.ok && data?.status) {
            const st = data.status;
            if (!st.isRunning && st.startedAt && Date.now() - st.startedAt > 2000 && !completed) {
              cleanup();
              resolve(results);
            }
          }
        }
      } catch {}
    }, 2000);

    // Now start the job on the server (SSE is already listening!)
    fetch('/api/autodub/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (startRes) => {
        const startData = await startRes.json().catch(() => ({}));
        if (!startRes.ok || !startData.ok) {
          cleanup();
          reject(new Error(startData?.message || 'មិនអាចចាប់ផ្ដើមដំណើរការ Auto Dubbing បានទេ។'));
        }
      })
      .catch((err) => {
        cleanup();
        reject(err);
      });

    sse.onmessage = (e) => {
      if (completed) return;
      try {
        const event = JSON.parse(e.data);

        switch (event.type) {
          case 'init': {
            totalVideos = event.total || 0;
            globalConsoleLogger.add(
              `📋 រកឃើញវីដេអូសរុប ${totalVideos} ឯកសារក្នុងថត`,
              'info'
            );
            break;
          }

          case 'video_start': {
            currentIndex = event.index || 1;
            totalVideos = event.total || totalVideos;
            currentEpisodePercent = typeof event.percent === 'number' ? event.percent : 0;
            currentVideo = {
              name: event.name,
              path: event.path,
              size: 0,
            };

            globalConsoleLogger.add(
              `▶️ [${currentIndex}/${totalVideos}] ចាប់ផ្ដើម dubbing: ${event.name}`,
              'stage'
            );

            if (options.onProgress) {
              options.onProgress({
                index: currentIndex,
                total: totalVideos,
                video: currentVideo,
                stage: 'processing',
                detail: 'កំពុងបើកវីដេអូ...',
                percent: currentEpisodePercent,
              });
            }
            break;
          }

          case 'progress': {
            const detailMsg = event.message || '';
            if (typeof event.percent === 'number') {
              currentEpisodePercent = Math.max(0, Math.min(100, Math.round(event.percent)));
            }

            if (detailMsg) {
              globalConsoleLogger.add(
                `[${currentIndex}/${totalVideos}] ${detailMsg}`,
                'info'
              );
            }

            if (options.onProgress) {
              options.onProgress({
                index: event.index || currentIndex,
                total: event.total || totalVideos,
                video: currentVideo,
                stage: 'processing',
                detail: detailMsg,
                percent: currentEpisodePercent,
              });
            }
            break;
          }

          case 'video_done': {
            currentEpisodePercent = 100;
            const res: AutoDubResult = {
              video: {
                name: event.name || currentVideo.name,
                path: event.path || currentVideo.path,
                size: 0,
              },
              ok: true,
              outputPath: event.outputPath,
            };
            results.push(res);

            globalConsoleLogger.add(
              `✅ [${currentIndex}/${totalVideos}] សម្រេចបាន: ${event.name} -> ${event.outputPath}`,
              'success'
            );

            if (options.onProgress) {
              options.onProgress({
                index: currentIndex,
                total: totalVideos,
                video: res.video,
                stage: 'done',
                detail: 'សម្រេចជោគជ័យ',
                percent: 100,
              });
            }

            if (options.onVideoDone) {
              options.onVideoDone(res);
            }
            break;
          }

          case 'video_skipped': {
            const res: AutoDubResult = {
              video: {
                name: event.name || currentVideo.name,
                path: event.path || currentVideo.path,
                size: 0,
              },
              ok: true,
              reason: event.reason || 'រំលង (Dubbed រួចរាល់)',
              outputPath: event.outputPath,
            };
            results.push(res);

            globalConsoleLogger.add(
              `⏭️ [${event.index}/${event.total}] រំលង (Dubbed រួចរាល់): ${event.name}`,
              'info'
            );

            if (options.onProgress) {
              options.onProgress({
                index: event.index || currentIndex,
                total: event.total || totalVideos,
                video: res.video,
                stage: 'skipped',
                detail: 'រំលង (Dubbed រួចរាល់)',
                percent: 100,
              });
            }

            if (options.onVideoDone) {
              options.onVideoDone(res);
            }
            break;
          }

          case 'video_failed': {
            const errMsg = event.error || 'បរាជ័យ';
            const res: AutoDubResult = {
              video: {
                name: event.name || currentVideo.name,
                path: event.path || currentVideo.path,
                size: 0,
              },
              ok: false,
              reason: errMsg,
            };
            results.push(res);

            globalConsoleLogger.add(
              `❌ [${currentIndex}/${totalVideos}] បរាជ័យ: ${event.name} (${errMsg})`,
              'error'
            );

            if (options.onProgress) {
              options.onProgress({
                index: currentIndex,
                total: totalVideos,
                video: res.video,
                stage: 'failed',
                detail: errMsg,
                percent: 100,
              });
            }

            if (options.onVideoDone) {
              options.onVideoDone(res);
            }

            if (errMsg.includes('429') || errMsg.includes('Quota')) {
              if (options.onQuotaExhausted) {
                options.onQuotaExhausted(res.video, currentIndex, totalVideos);
              }
            }
            break;
          }

          case 'log': {
            if (event.message) {
              globalConsoleLogger.add(
                event.message,
                'info'
              );
            }
            break;
          }

          case 'complete': {
            clearInterval(cancelCheckInterval);
            cleanup();
            globalConsoleLogger.add(
              `🎉 Auto Dubbing បញ្ចប់ទាំងស្រុង! ជោគជ័យ: ${event.succeeded || 0}, រំលង: ${event.skipped || 0}, បរាជ័យ: ${event.failed || 0}`,
              'success'
            );
            resolve(results);
            break;
          }

          case 'cancelled': {
            clearInterval(cancelCheckInterval);
            cleanup();
            globalConsoleLogger.add(
              '🛑 Auto Dubbing ត្រូវបានបញ្ឈប់ដោយអ្នកប្រើប្រាស់ (Cancelled)',
              'warn'
            );
            reject(new AutoDubCancelled());
            break;
          }

          case 'error': {
            clearInterval(cancelCheckInterval);
            cleanup();
            globalConsoleLogger.add(
              `❌ Auto Dubbing Error: ${event.message}`,
              'error'
            );
            reject(new Error(event.message || 'Auto Dubbing error'));
            break;
          }
        }
      } catch (parseErr) {
        console.warn('Error parsing SSE event:', parseErr);
      }
    };

    sse.onerror = (err) => {
      // SSE connection error handling
      console.warn('SSE connection closed or error:', err);
    };
  });
}
