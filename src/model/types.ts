export type ID = string;

export type Tone =
  | 'water'
  | 'mint'
  | 'rose'
  | 'peach'
  | 'lavender'
  | 'gold'
  | 'iris'
  | 'paper';

export const TONES: Tone[] = ['water', 'mint', 'rose', 'peach', 'lavender', 'gold', 'iris', 'paper'];

export type LayoutKind = 'linear' | 'grid' | 'flow' | 'stack' | 'spacer' | 'leaf';
export const LAYOUT_KINDS: LayoutKind[] = ['linear', 'grid', 'flow', 'stack', 'spacer', 'leaf'];

export type SkinKind =
  | 'band'
  | 'boundary'
  | 'container'
  | 'chip'
  | 'segment'
  | 'note'
  | 'plain';
export const SKIN_KINDS: SkinKind[] = [
  'band',
  'boundary',
  'container',
  'chip',
  'segment',
  'note',
  'plain',
];

export type Align = 'start' | 'center' | 'end' | 'stretch';
export type Justify = 'start' | 'center' | 'end' | 'between';
export type Anchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface LayoutProps {
  kind: LayoutKind;
  axis?: 'x' | 'y';
  gap?: number;
  padding?: number;
  align?: Align;
  justify?: Justify;
  columns?: number;
  columnMode?: 'equal' | 'auto';
  /** Parent-owned share of each grid column; child `weight` controls row height. */
  columnWeights?: number[];
  span?: number;
  lineGap?: number;
  anchor?: Anchor;
  weight?: number;
  maxWidth?: number;
}

export interface SkinProps {
  kind: SkinKind;
  tone: Tone;
  outline?: 'solid' | 'dashed' | 'none';
  radius?: number;
  density?: 'compact' | 'normal';
  titlePos?: 'top' | 'left' | 'none';
  verticalTitle?: boolean;
}

export interface BlockNode {
  id: ID;
  title?: string;
  subtitle?: string;
  badge?: string;
  layout: LayoutProps;
  skin: SkinProps;
  children: BlockNode[];
  collapsed?: boolean;
}

export type RelationKind = 'call' | 'dep' | 'data' | 'async' | 'run';
export const RELATION_KINDS: RelationKind[] = ['call', 'dep', 'data', 'async', 'run'];

export interface Relation {
  id: ID;
  from: ID;
  to: ID;
  label?: string;
  kind: RelationKind;
  dashed?: boolean;
}

export type TemplateId =
  | 'layered'
  | 'protocol'
  | 'stack'
  | 'c4'
  | 'deploy'
  | 'module'
  | 'memory'
  | 'custom';

export const TEMPLATE_IDS: TemplateId[] = [
  'layered',
  'protocol',
  'stack',
  'c4',
  'deploy',
  'module',
  'memory',
  'custom',
];

export interface DocMeta {
  title: string;
  description?: string;
  template: TemplateId;
  direction: 'bottom-up' | 'top-down';
  createdAt: string;
  updatedAt: string;
}

export interface DiagramDoc {
  version: 3;
  meta: DocMeta;
  /**
   * Explicit size of the root frame. The layout fills this box and divides it
   * among children by weight, so the root is the single control over the
   * diagram's overall size. Absent = size derived from content (legacy docs).
   */
  size?: Size;
  root: BlockNode;
  relations: Relation[];
}

export type Locale = 'zh' | 'en';

export interface Size {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
