import type { DictKey } from './dict';
import type { LayoutKind, RelationKind, SkinKind, Tone } from '../model/types';

export const SKIN_LABELS: Record<SkinKind, DictKey> = {
  band: 'skinBand',
  boundary: 'skinBoundary',
  container: 'skinContainer',
  chip: 'skinChip',
  segment: 'skinSegment',
  note: 'skinNote',
  plain: 'skinPlain',
};

export const TONE_LABELS: Record<Tone, DictKey> = {
  water: 'toneWater',
  mint: 'toneMint',
  rose: 'toneRose',
  peach: 'tonePeach',
  lavender: 'toneLavender',
  gold: 'toneGold',
  iris: 'toneIris',
  paper: 'tonePaper',
};

export const LAYOUT_LABELS: Record<LayoutKind, DictKey> = {
  linear: 'layoutLinear',
  grid: 'layoutGrid',
  flow: 'layoutFlow',
  stack: 'layoutStack',
  spacer: 'layoutSpacer',
  leaf: 'layoutLeaf',
};

export const REL_LABELS: Record<RelationKind, DictKey> = {
  call: 'relCall',
  dep: 'relDep',
  data: 'relData',
  async: 'relAsync',
  run: 'relRun',
};
