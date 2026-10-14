import React, { useRef, useState, useEffect } from 'react';
import { Clock, Scissors, Sliders, Target, Wand2, Type, Mic, ZoomIn, ZoomOut } from 'lucide-react';
import { SubtitleSegment } from '../types';
import { formatTimeCode } from '../utils/timeFormat';
import { vocalSecondsOnTimeline } from '../utils/autoSpeed';

interface TimelineEditorProps {
  subtitles: SubtitleSegment[];
  currentTime: number;
  duration: number;
  zoomLevel: number;
  onSeek: (time: number) => void;
  onSelectSegment: (id: string | null) => void;
  onShiftTime: (offset: number) => void;
  onChangeZoom: (zoom: number) => void;
  onSplitSegment: () => void;
  onUpdateSegmentTimes: (id: string, start: number, end: number) => void;
  onAutoAlignTimeline?: () => void;
  onSnapToPlayhead?: () => void;
}

// Calculate non-overlapping segment times with jump-across logic
function getValidSegmentTimes(
  currentId: string,
  rawStart: number,
  duration: number,
  subtitles: SubtitleSegment[],
  maxDuration: number
): { startTime: number; endTime: number } {
  const D = Math.max(0.1, duration);
  let start = Math.max(0, Math.min(maxDuration - D, rawStart));
  let end = start + D;

  const others = subtitles
    .filter((s) => s.id !== currentId)
    .sort((a, b) => a.startTime - b.startTime);

  if (others.length === 0) {
    return {
      startTime: Number(start.toFixed(2)),
      endTime: Number(end.toFixed(2)),
    };
  }

  // Iterate up to others.length + 2 times to resolve multi-collision jumps
  for (let iter = 0; iter < others.length + 2; iter++) {
    let collided = false;
    for (const other of others) {
      const sOther = other.startTime;
      const eOther = other.endTime;

      // Overlap condition: start < eOther AND end > sOther
      if (start < eOther - 0.001 && end > sOther + 0.001) {
        collided = true;
        const dragCenter = start + D / 2;
        const otherCenter = (sOther + eOther) / 2;

        if (dragCenter >= otherCenter) {
          // Dragged past midpoint -> Jump to right side of this segment
          start = eOther;
          end = start + D;
        } else {
          // Dragged before midpoint -> Jump to left side of this segment
          start = sOther - D;
          end = start + D;
        }
      }
    }

    // Boundary clamp
    if (start < 0) {
      start = 0;
      end = start + D;
    } else if (end > maxDuration) {
      end = maxDuration;
      start = Math.max(0, end - D);
    }

    if (!collided) break;
  }

  return {
    startTime: Number(start.toFixed(2)),
    endTime: Number(end.toFixed(2)),
  };
}

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  subtitles,
  currentTime,
  duration,
  zoomLevel,
  onSeek,
  onSelectSegment,
  onShiftTime,
  onChangeZoom,
  onSplitSegment,
  onUpdateSegmentTimes,
  onAutoAlignTimeline,
  onSnapToPlayhead,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);

  // Dragging state for segment dragging & resizing
  const [draggingInfo, setDraggingInfo] = useState<{
    id: string;
    mode: 'move' | 'resize-left' | 'resize-right';
    startX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);

  const totalDuration = duration > 0 ? duration : 60;
  const MIN_ZOOM = 100;
  const MAX_ZOOM = Math.max(5000, Math.min(100000, Math.round((totalDuration / 2) * 100)));

  // Track responsive container width
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const updateWidth = () => {
      if (container.clientWidth > 0) {
        setContainerWidth(container.clientWidth);
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Compute time from clientX coordinates considering scroll position and zoom
  const getTimeFromPointerEvent = (clientX: number): number => {
    const container = scrollContainerRef.current;
    const content = contentRef.current;
    if (!container || !content) return 0;
    const containerRect = container.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();

    const relativeX = clientX - containerRect.left;
    const absoluteX = relativeX + container.scrollLeft;
    const contentWidth = contentRect.width;
    if (contentWidth <= 0) return 0;

    const ratio = Math.max(0, Math.min(1, absoluteX / contentWidth));
    return ratio * totalDuration;
  };

  // Handle timeline scrub
  const handleTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingInfo) return;
    const newTime = getTimeFromPointerEvent(e.clientX);
    onSeek(newTime);
    onSelectSegment(null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || draggingInfo) return;
    setIsScrubbing(true);
    handleTimelineScrub(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isScrubbing && !draggingInfo) {
      handleTimelineScrub(e);
    }
  };

  const handleMouseUp = () => {
    setIsScrubbing(false);
  };

  // Window listeners during scrubbing so mouse movements outside the element still scrub
  useEffect(() => {
    if (!isScrubbing) return;
    const onWindowMove = (e: MouseEvent) => {
      if (draggingInfo) return;
      const newTime = getTimeFromPointerEvent(e.clientX);
      onSeek(newTime);
    };
    const onWindowUp = () => {
      setIsScrubbing(false);
    };
    window.addEventListener('mousemove', onWindowMove);
    window.addEventListener('mouseup', onWindowUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMove);
      window.removeEventListener('mouseup', onWindowUp);
    };
  }, [isScrubbing, draggingInfo, totalDuration]);

  // Handle Ctrl + Mouse Wheel for Zoom and regular Wheel for horizontal scrolling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        const containerRect = container.getBoundingClientRect();
        const contentEl = contentRef.current;
        const contentWidth = contentEl ? contentEl.getBoundingClientRect().width : containerRect.width;

        const offsetX = e.clientX - containerRect.left;
        const contentXBefore = container.scrollLeft + offsetX;
        const ratio = contentWidth > 0 ? contentXBefore / contentWidth : 0;

        // Zoom in on scroll up (deltaY < 0), zoom out on scroll down (deltaY > 0)
        const factor = e.deltaY < 0 ? 1.25 : 0.8;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoomLevel * factor)));

        if (newZoom !== zoomLevel) {
          onChangeZoom(newZoom);

          requestAnimationFrame(() => {
            if (!container || !contentRef.current) return;
            const newContentWidth = contentRef.current.getBoundingClientRect().width;
            const newContentX = ratio * newContentWidth;
            container.scrollLeft = Math.max(0, newContentX - offsetX);
          });
        }
      } else {
        // Normal vertical wheel scrolls horizontally when timeline content exceeds visible container
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          if (container.scrollWidth > container.clientWidth) {
            e.preventDefault();
            container.scrollLeft += e.deltaY;
          }
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [zoomLevel, onChangeZoom, totalDuration, MIN_ZOOM, MAX_ZOOM]);

  // Auto-follow playhead during playback when zoomed in
  useEffect(() => {
    if (isScrubbing || draggingInfo) return;
    const container = scrollContainerRef.current;
    const content = contentRef.current;
    if (!container || !content || zoomLevel <= 100) return;

    const contentWidth = content.getBoundingClientRect().width;
    const cWidth = container.clientWidth;
    if (cWidth <= 0 || contentWidth <= 0) return;

    const playheadX = (currentTime / totalDuration) * contentWidth;
    const currentScrollLeft = container.scrollLeft;

    if (playheadX > currentScrollLeft + cWidth * 0.9 || playheadX < currentScrollLeft) {
      container.scrollTo({
        left: Math.max(0, playheadX - cWidth * 0.3),
        behavior: 'smooth',
      });
    }
  }, [currentTime, isScrubbing, draggingInfo, zoomLevel, totalDuration]);

  // Drag Start for Segment Box
  const handleSegmentDragStart = (
    e: React.MouseEvent | React.TouchEvent,
    id: string,
    mode: 'move' | 'resize-left' | 'resize-right',
    start: number,
    end: number
  ) => {
    e.stopPropagation();
    onSelectSegment(id);
    onSeek(start);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setDraggingInfo({
      id,
      mode,
      startX: clientX,
      initialStart: start,
      initialEnd: end,
    });
  };

  // Global mouse & touch listeners during active segment dragging
  useEffect(() => {
    if (!draggingInfo) return;

    const handlePointerMove = (clientX: number) => {
      if (!contentRef.current) return;
      const contentRect = contentRef.current.getBoundingClientRect();
      if (contentRect.width <= 0) return;

      const deltaX = clientX - draggingInfo.startX;
      const deltaTime = (deltaX / contentRect.width) * totalDuration;

      // Auto-scroll timeline container if dragging near edges
      if (scrollContainerRef.current) {
        const cRect = scrollContainerRef.current.getBoundingClientRect();
        const edgeThreshold = 40;
        if (clientX < cRect.left + edgeThreshold) {
          scrollContainerRef.current.scrollLeft -= 10;
        } else if (clientX > cRect.right - edgeThreshold) {
          scrollContainerRef.current.scrollLeft += 10;
        }
      }

      if (draggingInfo.mode === 'move') {
        const segDuration = draggingInfo.initialEnd - draggingInfo.initialStart;
        const rawStart = draggingInfo.initialStart + deltaTime;
        const valid = getValidSegmentTimes(
          draggingInfo.id,
          rawStart,
          segDuration,
          subtitles,
          totalDuration
        );
        onUpdateSegmentTimes(draggingInfo.id, valid.startTime, valid.endTime);
      } else if (draggingInfo.mode === 'resize-left') {
        const rawStart = draggingInfo.initialStart + deltaTime;
        const others = subtitles
          .filter((s) => s.id !== draggingInfo.id)
          .sort((a, b) => a.startTime - b.startTime);
        const prev = others.filter((s) => s.endTime <= draggingInfo.initialEnd).pop();
        const minStart = prev ? prev.endTime : 0;
        const maxStart = draggingInfo.initialEnd - 0.2;
        const newStart = Math.max(minStart, Math.min(maxStart, rawStart));
        onUpdateSegmentTimes(
          draggingInfo.id,
          Number(newStart.toFixed(2)),
          draggingInfo.initialEnd
        );
      } else if (draggingInfo.mode === 'resize-right') {
        const rawEnd = draggingInfo.initialEnd + deltaTime;
        const others = subtitles
          .filter((s) => s.id !== draggingInfo.id)
          .sort((a, b) => a.startTime - b.startTime);
        const next = others.find((s) => s.startTime >= draggingInfo.initialStart);
        const maxEnd = next ? next.startTime : totalDuration;
        const minEnd = draggingInfo.initialStart + 0.2;
        const newEnd = Math.max(minEnd, Math.min(maxEnd, rawEnd));
        onUpdateSegmentTimes(
          draggingInfo.id,
          draggingInfo.initialStart,
          Number(newEnd.toFixed(2))
        );
      }
    };

    const handleMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) handlePointerMove(e.touches[0].clientX);
    };

    const handlePointerEnd = () => {
      setDraggingInfo(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handlePointerEnd);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handlePointerEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handlePointerEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handlePointerEnd);
    };
  }, [draggingInfo, subtitles, totalDuration, onUpdateSegmentTimes]);

  // Generate dynamic, human-friendly time ticks spaced adaptively to never collide
  const NICE_INTERVALS = [
    0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, // seconds
    60, 120, 300, 600, 900, 1800, // 1m, 2m, 5m, 10m, 15m, 30m
    3600, 7200, 14400, // 1h, 2h, 4h
  ];

  const currentContentWidth = (containerWidth * Math.max(100, zoomLevel)) / 100;
  const pxPerSec = currentContentWidth / totalDuration;
  // Require at least 80px between ticks so text never collides
  const minIntervalSec = 80 / (pxPerSec || 1);
  const tickInterval = NICE_INTERVALS.find((val) => val >= minIntervalSec) || 3600;

  const tickCount = Math.floor(totalDuration / tickInterval);
  const safeCount = Math.min(1000, tickCount);
  const ticks: number[] = [];
  for (let i = 0; i <= safeCount; i++) {
    const t = i * tickInterval;
    if (t <= totalDuration) {
      ticks.push(t);
    }
  }

  const playheadPercent = Math.max(0, Math.min(100, (currentTime / totalDuration) * 100));

  // Zoom button click handlers
  const handleZoomStep = (direction: 1 | -1) => {
    const container = scrollContainerRef.current;
    const factor = direction > 0 ? 1.5 : 0.667;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoomLevel * factor)));
    if (newZoom !== zoomLevel) {
      if (container) {
        const cWidth = container.clientWidth;
        const contentEl = contentRef.current;
        const currentW = contentEl ? contentEl.getBoundingClientRect().width : cWidth;
        const centerContentX = container.scrollLeft + cWidth / 2;
        const ratio = currentW > 0 ? centerContentX / currentW : 0.5;

        onChangeZoom(newZoom);

        requestAnimationFrame(() => {
          if (!container || !contentRef.current) return;
          const newW = contentRef.current.getBoundingClientRect().width;
          container.scrollLeft = Math.max(0, ratio * newW - cWidth / 2);
        });
      } else {
        onChangeZoom(newZoom);
      }
    }
  };

  const handleResetZoom = () => {
    onChangeZoom(100);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
    }
  };

  return (
    <div className="h-48 bg-[#0a0f18] border border-[#1c293f] rounded-lg flex flex-col overflow-hidden select-none shadow-lg w-full">
      {/* Timeline Controls Header */}
      <div className="bg-[#0f1725] border-b border-[#1c293f] px-3 py-1.5 flex flex-wrap items-center justify-between text-xs font-mono gap-2">
        {/* Left Clock & Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span>TIMELINE EDITOR</span>
          </div>
          <div className="bg-[#152133] border border-[#233550] px-2 py-0.5 rounded text-[11px] text-slate-300">
            {formatTimeCode(currentTime)} / {formatTimeCode(duration)}
          </div>
        </div>

        {/* Shift Time Buttons & Actions & Zoom Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[10px] mr-1"># SHIFT TIME:</span>
            {[-0.5, -0.1, 0.1, 0.5].map((offset) => (
              <button
                key={offset}
                onClick={() => onShiftTime(offset)}
                className="px-2 py-0.5 rounded bg-[#152133] border border-[#233550] text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 text-[11px] cursor-pointer"
              >
                {offset > 0 ? `+${offset}s` : `${offset}s`}
              </button>
            ))}
          </div>

          {/* Snap Playhead button */}
          {onSnapToPlayhead && (
            <button
              onClick={onSnapToPlayhead}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#152133] border border-[#233550] text-cyan-300 hover:border-cyan-500/50 text-[11px] cursor-pointer"
              title="Snap selected subtitle start to playhead"
            >
              <Target className="w-3 h-3 text-cyan-400" />
              <span>Snap Playhead</span>
            </button>
          )}

          {/* Auto Align Timeline button */}
          {onAutoAlignTimeline && (
            <button
              onClick={onAutoAlignTimeline}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-[11px] cursor-pointer"
              title="Auto-align timeline, remove overlaps and fix gaps"
            >
              <Wand2 className="w-3 h-3 text-emerald-400" />
              <span>Align Timeline</span>
            </button>
          )}

          {/* Split button */}
          <button
            onClick={onSplitSegment}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#152133] border border-[#233550] text-amber-300 hover:border-amber-500/50 text-[11px] cursor-pointer"
            title="Split subtitle at playhead"
          >
            <Scissors className="w-3 h-3 text-amber-400" />
            <span>Split</span>
          </button>

          {/* Zoom In/Out Controls */}
          <div
            className="flex items-center gap-1 bg-[#152133] border border-[#233550] rounded px-1.5 py-0.5"
            title="ចុច Ctrl + Mouse Scroll ដើម្បីពង្រីក/បង្រួម (Zoom in/out)"
          >
            <span className="text-[10px] text-slate-400 mr-0.5 font-bold">ZOOM:</span>
            <button
              onClick={() => handleZoomStep(-1)}
              className="p-1 rounded hover:bg-[#1d2d44] text-slate-300 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
              title="បង្រួម (Zoom Out) - ឬចុច Ctrl + Mouse Scroll Down"
              disabled={zoomLevel <= MIN_ZOOM}
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              onClick={handleResetZoom}
              className="px-1.5 py-0.2 rounded text-[11px] font-mono text-cyan-400 hover:text-cyan-300 hover:bg-[#1d2d44] cursor-pointer transition-colors font-bold"
              title="កំណត់មក Fit (100%) វិញ"
            >
              {zoomLevel <= 100 ? 'FIT' : `${zoomLevel}%`}
            </button>
            <button
              onClick={() => handleZoomStep(1)}
              className="p-1 rounded hover:bg-[#1d2d44] text-slate-300 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
              title="ពង្រីក (Zoom In) - ឬចុច Ctrl + Mouse Scroll Up"
              disabled={zoomLevel >= MAX_ZOOM}
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Timeline Canvas with Left Track Header Column */}
      <div className="flex-1 bg-[#080d15] flex select-none overflow-hidden w-full">
        {/* Left Track Icons Header Column (Fixed on the left) */}
        <div className="w-10 bg-[#090f1a] border-r border-[#1a283f] flex flex-col shrink-0 z-20">
          {/* Time ruler top spacer */}
          <div className="h-6 bg-[#0c1421] border-b border-[#1c293f] flex items-center justify-center">
            <Clock className="w-3 h-3 text-slate-500" />
          </div>

          {/* Track 1 Icon: Subtitles (T1) */}
          <div className="h-14 border-b border-[#182438] flex items-center justify-center bg-[#0a101b]" title="Track 1: Subtitles (T1)">
            <div className="w-7 h-7 rounded bg-[#0e1726] border border-cyan-500/40 text-cyan-400 flex items-center justify-center shadow-[0_0_8px_rgba(6,182,212,0.25)]">
              <Type className="w-3.5 h-3.5 text-cyan-400" />
            </div>
          </div>

          {/* Track 2 Icon: Vocals (A1) */}
          <div className="h-14 flex items-center justify-center bg-[#080d17]" title="Track 2: Vocals (A1)">
            <div className="w-7 h-7 rounded bg-[#0e1726] border border-purple-500/40 text-purple-400 flex items-center justify-center shadow-[0_0_8px_rgba(168,85,247,0.25)]">
              <Mic className="w-3.5 h-3.5 text-purple-400" />
            </div>
          </div>
        </div>

        {/* Scrollable Timeline Canvas Area */}
        <div
          ref={scrollContainerRef}
          className="flex-1 bg-[#080d15] relative overflow-x-auto overflow-y-hidden timeline-scrollbar select-none"
        >
          <div
            ref={contentRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              width: `${Math.max(100, zoomLevel)}%`,
              minWidth: '100%',
            }}
            className="relative h-full cursor-crosshair"
          >
            {/* Time Ruler Header Track */}
            <div className="h-6 bg-[#0c1421] border-b border-[#1c293f] relative flex items-end w-full select-none">
              {ticks.map((t) => {
                const leftPos = (t / totalDuration) * 100;
                return (
                  <div
                    key={t}
                    className="absolute top-0 bottom-0 border-l border-[#1c293f] pl-1 pt-0.5 pointer-events-none"
                    style={{ left: `${leftPos}%` }}
                  >
                    <span className="text-[9px] font-mono text-slate-500 block">
                      {formatTimeCode(t)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Playhead Red Indicator */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none transition-none"
              style={{ left: `${playheadPercent}%` }}
            >
              <div className="w-3 h-3 bg-red-500 transform -translate-x-[5px] rotate-45 rounded-sm shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
            </div>

            {/* Track 1: Subtitles */}
            <div className="h-14 border-b border-[#182438] relative flex items-center bg-[#0a101b] px-1 w-full">
              {subtitles.map((seg) => {
                const leftPercent = Math.max(0, Math.min(100, (seg.startTime / totalDuration) * 100));
                const rawWidthPercent = ((seg.endTime - seg.startTime) / totalDuration) * 100;
                const widthPercent = Math.max(0.01, Math.min(100 - leftPercent, rawWidthPercent));
                const isActive = currentTime >= seg.startTime && currentTime <= seg.endTime;
                const isDraggingThis = draggingInfo?.id === seg.id;

                return (
                  <div
                    key={seg.id}
                    onMouseDown={(e) => handleSegmentDragStart(e, seg.id, 'move', seg.startTime, seg.endTime)}
                    onTouchStart={(e) => handleSegmentDragStart(e, seg.id, 'move', seg.startTime, seg.endTime)}
                    style={{
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                      minWidth: '4px',
                    }}
                    className={`absolute h-9 rounded border flex items-center justify-between text-xs font-khmer overflow-hidden cursor-grab active:cursor-grabbing transition-shadow select-none group/seg ${
                      isDraggingThis
                        ? 'bg-cyan-800/90 border-cyan-300 ring-2 ring-cyan-400/60 text-white z-30 shadow-[0_0_16px_rgba(6,182,212,0.8)]'
                        : isActive
                        ? 'bg-cyan-900/70 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.5)] z-10'
                        : 'bg-[#121f33] border-[#223552] text-slate-300 hover:border-cyan-500/60 hover:bg-[#162742]'
                    }`}
                    title={`${formatTimeCode(seg.startTime)} - ${formatTimeCode(seg.endTime)}: ${seg.text}`}
                  >
                    {/* Left Resize Handle */}
                    <div
                      onMouseDown={(e) => handleSegmentDragStart(e, seg.id, 'resize-left', seg.startTime, seg.endTime)}
                      onTouchStart={(e) => handleSegmentDragStart(e, seg.id, 'resize-left', seg.startTime, seg.endTime)}
                      className="absolute left-0 top-0 bottom-0 w-2.5 bg-cyan-400/0 hover:bg-cyan-400/60 cursor-ew-resize flex items-center justify-center z-20 transition-colors"
                      title="អូសដើម្បីសារេពេលវេលាចាប់ផ្តើម"
                    >
                      <div className="w-0.5 h-4 bg-cyan-200/50 rounded-full" />
                    </div>

                    <span className="truncate text-[11px] px-3 font-medium pointer-events-none">
                      {seg.text || '(Empty)'}
                    </span>

                    {/* Right Resize Handle */}
                    <div
                      onMouseDown={(e) => handleSegmentDragStart(e, seg.id, 'resize-right', seg.startTime, seg.endTime)}
                      onTouchStart={(e) => handleSegmentDragStart(e, seg.id, 'resize-right', seg.startTime, seg.endTime)}
                      className="absolute right-0 top-0 bottom-0 w-2.5 bg-cyan-400/0 hover:bg-cyan-400/60 cursor-ew-resize flex items-center justify-center z-20 transition-colors"
                      title="អូសដើម្បីសារេពេលវេលាបញ្ចប់"
                    >
                      <div className="w-0.5 h-4 bg-cyan-200/50 rounded-full" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Track 2: Vocals */}
            <div className="h-14 relative flex items-center bg-[#080d17] px-1 w-full">
              {(() => {
                const sortedSubs = [...subtitles].sort((a, b) => a.startTime - b.startTime);
                return sortedSubs.map((seg, idx) => {
                  const nextSeg = sortedSubs[idx + 1];
                  const maxAllowedVocalEnd = nextSeg ? nextSeg.startTime : totalDuration;
                  const speed = seg.ttsSpeed || seg.speed || 1.0;
                  const vocalDuration = vocalSecondsOnTimeline(seg);
                  const vocalEnd = Math.min(maxAllowedVocalEnd, seg.startTime + vocalDuration);
                  const outrunsSubtitle = vocalEnd > seg.endTime + 0.01;

                  const leftPercent = Math.max(0, Math.min(100, (seg.startTime / totalDuration) * 100));
                  const rawWidthPercent = ((vocalEnd - seg.startTime) / totalDuration) * 100;
                  const widthPercent = Math.max(0.01, Math.min(100 - leftPercent, rawWidthPercent));
                  const isDraggingThis = draggingInfo?.id === seg.id;
                  const displaySpeed = Number(speed.toFixed(2));

                  return (
                    <div
                      key={`vocal-${seg.id}`}
                      onMouseDown={(e) => handleSegmentDragStart(e, seg.id, 'move', seg.startTime, seg.endTime)}
                      onTouchStart={(e) => handleSegmentDragStart(e, seg.id, 'move', seg.startTime, seg.endTime)}
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        minWidth: '4px',
                      }}
                      className={`absolute h-8 rounded border px-1.5 py-1 flex items-center justify-between text-[10px] font-mono overflow-hidden cursor-grab active:cursor-grabbing transition-all ${
                        isDraggingThis
                          ? 'bg-purple-800/90 border-purple-300 ring-2 ring-purple-400/60 text-white z-30 shadow-[0_0_16px_rgba(168,85,247,0.8)]'
                          : seg.audioUrl
                          ? 'bg-gradient-to-r from-purple-950/90 via-purple-900/80 to-indigo-950/90 border-purple-400/70 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.4)] hover:border-purple-300'
                          : 'bg-[#0f1725]/50 border-[#1a273e] text-slate-600 hover:border-purple-500/40'
                      }`}
                      title={
                        `${formatTimeCode(seg.startTime)} - ${formatTimeCode(vocalEnd)} (Speed: ${displaySpeed}x)` +
                        (outrunsSubtitle ? ' — vocal runs past the subtitle' : '')
                      }
                    >
                      {/* Left Resize Handle */}
                      <div
                        onMouseDown={(e) => handleSegmentDragStart(e, seg.id, 'resize-left', seg.startTime, seg.endTime)}
                        onTouchStart={(e) => handleSegmentDragStart(e, seg.id, 'resize-left', seg.startTime, seg.endTime)}
                        className="absolute left-0 top-0 bottom-0 w-2.5 bg-purple-400/0 hover:bg-purple-400/60 cursor-ew-resize flex items-center justify-center z-20 transition-colors"
                      />

                      <div className="flex items-center gap-1 pointer-events-none truncate px-0.5">
                        <span className="w-0.5 h-3 bg-purple-400 rounded-full animate-pulse shrink-0" />
                        <span className="w-0.5 h-4 bg-indigo-400 rounded-full animate-pulse delay-75 shrink-0" />
                        <span className="text-[10px] font-mono font-bold text-purple-200 shrink-0">
                          {displaySpeed}x
                        </span>
                      </div>

                      {/* Right Resize Handle */}
                      <div
                        onMouseDown={(e) => handleSegmentDragStart(e, seg.id, 'resize-right', seg.startTime, seg.endTime)}
                        onTouchStart={(e) => handleSegmentDragStart(e, seg.id, 'resize-right', seg.startTime, seg.endTime)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 bg-purple-400/0 hover:bg-purple-400/60 cursor-ew-resize flex items-center justify-center z-20 transition-colors"
                      />
                    </div>
                  );
                });
            })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

