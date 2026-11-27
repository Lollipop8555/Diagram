import type { SkinKind, SkinProps, Tone } from '../model/types';

export interface ToneColors {
  fill: string;
  stroke: string;
  solid: string;
  ink: string;
}

const TONE_HEX: Record<Tone, string> = {
  water: '#A8C8D8',
  mint: '#BFDDD3',
  rose: '#E7AFB6',
  peach: '#F2C9A8',
  lavender: '#C3BCE0',
  gold: '#E4C775',
  iris: '#7C8CC4',
  paper: '#EFE7DC',
};

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  const out = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function toneColors(tone: Tone): ToneColors {
  const raw = TONE_HEX[tone] ?? TONE_HEX.paper;
  return {
    fill: rgba(raw, tone === 'paper' ? 0.5 : 0.24),
    stroke: rgba(mix(raw, '#2F2A38', 0.25), 0.55),
    solid: raw,
    ink: '#2F2A38',
  };
}

export interface SkinDef {
  padX: number;
  padY: number;
  headerH: number;
  gutter: number;
  radius: number;
  outline: 'solid' | 'dashed' | 'none';
  titlePos: 'top' | 'left' | 'center' | 'none';
  /** Default tone for newly created blocks with this skin. */
  tone: Tone;
}

export const SKINS: Record<SkinKind, SkinDef> = {
  band: {
    padX: 12,
    padY: 10,
    headerH: 20,
    gutter: 0,
    radius: 10,
    outline: 'solid',
    titlePos: 'top',
    tone: 'water',
  },
  boundary: {
    padX: 14,
    padY: 14,
    headerH: 24,
    gutter: 0,
    radius: 16,
    outline: 'dashed',
    titlePos: 'top',
    tone: 'lavender',
  },
  container: {
    padX: 12,
    padY: 12,
    headerH: 24,
    gutter: 0,
    radius: 12,
    outline: 'solid',
    titlePos: 'top',
    tone: 'paper',
  },
  chip: {
    padX: 12,
    padY: 8,
    headerH: 0,
    gutter: 0,
    radius: 8,
    outline: 'solid',
    titlePos: 'center',
    tone: 'water',
  },
  segment: {
    padX: 12,
    padY: 10,
    headerH: 20,
    gutter: 0,
    radius: 4,
    outline: 'solid',
    titlePos: 'center',
    tone: 'peach',
  },
  note: {
    padX: 8,
    padY: 8,
    headerH: 18,
    gutter: 0,
    radius: 6,
    outline: 'none',
    titlePos: 'top',
    tone: 'paper',
  },
  plain: {
    padX: 4,
    padY: 4,
    headerH: 18,
    gutter: 0,
    radius: 0,
    outline: 'none',
    titlePos: 'top',
    tone: 'paper',
  },
};

export function skinDefOf(skin: SkinProps): SkinDef {
  return SKINS[skin.kind] ?? SKINS.plain;
}

export function outlineOf(skin: SkinProps): 'solid' | 'dashed' | 'none' {
  return skin.outline ?? skinDefOf(skin).outline;
}

export function toneOf(skin: SkinProps): Tone {
  return skin.tone ?? skinDefOf(skin).tone;
}
