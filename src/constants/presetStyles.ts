import React from 'react';

export interface PresetStyleDef {
  id: string;
  name: string;
  defaultColor: string;
  style: React.CSSProperties;
}

export const PRESET_STYLES: PresetStyleDef[] = [
  { id: 'none', name: 'None', defaultColor: '#ffffff', style: { color: '#ffffff' } },
  { id: 'white_black_stroke', name: 'White Heavy Stroke', defaultColor: '#ffffff', style: { color: '#ffffff', textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 6px #000' } },
  { id: 'white_outline', name: 'White Outline', defaultColor: '#ffffff', style: { color: '#ffffff', textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000' } },
  { id: 'white_shadow', name: 'White Drop Shadow', defaultColor: '#ffffff', style: { color: '#ffffff', textShadow: '0px 3px 8px rgba(0,0,0,0.95)' } },
  { id: 'white_glow', name: 'White Soft Shadow', defaultColor: '#ffffff', style: { color: '#ffffff', textShadow: '0 0 8px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.8), -1px -1px 0 #000' } },
  { id: 'yellow_black_stroke', name: 'Yellow Black Stroke', defaultColor: '#facc15', style: { color: '#facc15', textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 8px rgba(0,0,0,0.8)' } },
  { id: 'red_white_outline', name: 'Red White Outline', defaultColor: '#ef4444', style: { color: '#ef4444', textShadow: '-1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff' } },
  { id: 'orange_white_outline', name: 'Orange White Outline', defaultColor: '#f97316', style: { color: '#f97316', textShadow: '-1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff' } },
  { id: 'blue_white_outline', name: 'Blue White Outline', defaultColor: '#3b82f6', style: { color: '#3b82f6', textShadow: '-1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff' } },
  { id: 'green_black_stroke', name: 'Green Black Stroke', defaultColor: '#22c55e', style: { color: '#22c55e', textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000' } },
  { id: 'black_lightgray_box', name: 'Black on Light Gray Box', defaultColor: '#000000', style: { color: '#000000', backgroundColor: '#9ca3af', padding: '2px 8px', borderRadius: '6px' } },
  { id: 'white_darkgray_box', name: 'White on Dark Gray Box', defaultColor: '#ffffff', style: { color: '#ffffff', backgroundColor: '#374151', padding: '2px 8px', borderRadius: '6px' } },
  { id: 'black_yellow_box', name: 'Black on Yellow Box', defaultColor: '#000000', style: { color: '#000000', backgroundColor: '#facc15', padding: '2px 8px', borderRadius: '6px' } },
  { id: 'white_purple_box', name: 'White on Purple Box', defaultColor: '#ffffff', style: { color: '#ffffff', backgroundColor: '#8b5cf6', padding: '2px 8px', borderRadius: '6px' } },
  { id: 'purple_white_box', name: 'Purple on White Box', defaultColor: '#7c3aed', style: { color: '#7c3aed', backgroundColor: '#ffffff', padding: '2px 8px', borderRadius: '6px' } },
  { id: 'black_white_box', name: 'Black on White Box', defaultColor: '#000000', style: { color: '#000000', backgroundColor: '#ffffff', padding: '2px 8px', borderRadius: '6px' } },
  { id: 'white_black_box', name: 'White on Black Box', defaultColor: '#ffffff', style: { color: '#ffffff', backgroundColor: '#000000', padding: '2px 8px', borderRadius: '6px' } },
  { id: 'green_black_box', name: 'Green on Black Box', defaultColor: '#22c55e', style: { color: '#22c55e', backgroundColor: '#000000', padding: '2px 8px', borderRadius: '6px' } },
  { id: 'green_darkgreen_stroke', name: 'Green Dark Stroke', defaultColor: '#22c55e', style: { color: '#22c55e', textShadow: '-1.5px -1.5px 0 #14532d, 1.5px -1.5px 0 #14532d, -1.5px 1.5px 0 #14532d, 1.5px 1.5px 0 #14532d' } },
  { id: 'yellow_red_shadow', name: 'Yellow Red Shadow', defaultColor: '#facc15', style: { color: '#facc15', textShadow: '2px 2px 0 #dc2626, -1px -1px 0 #000' } },
  { id: 'pink_neon', name: 'Pink Neon Glow', defaultColor: '#ffffff', style: { color: '#ffffff', textShadow: '0 0 6px #ec4899, 0 0 12px #ec4899, -1px -1px 0 #000' } },
  { id: 'yellow_neon', name: 'Yellow Neon Glow', defaultColor: '#ffffff', style: { color: '#ffffff', textShadow: '0 0 6px #eab308, 0 0 12px #eab308, -1px -1px 0 #000' } },
  { id: 'green_neon', name: 'Green Neon Glow', defaultColor: '#ffffff', style: { color: '#ffffff', textShadow: '0 0 6px #22c55e, 0 0 12px #22c55e, 0 0 18px #15803d' } },
];
