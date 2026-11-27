import type { BlockNode, ID } from '../model/types';
import type { LayoutResult } from '../layout/dispatch';
import { weightOf } from '../layout/registry';

export interface Splitter {
  /** Stable identity: parent plus the boundary index. */
  key: string;
  parentId: ID;
  axis: 'x' | 'y';
  aId: ID;
  bId: ID;
  /** Hit box in content coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  aWeight: number;
  bWeight: number;
  /** Pixel length covered by both blocks along the axis, used to map drags to weights. */
  span: number;
}

const HANDLE = 12;
const MIN_SPAN = 16;

/**
 * Draggable weight boundaries between adjacent weighted children of a linear
 * container. Only pairs where both sides carry an explicit weight are exposed:
 * content-sized (`weight = 0`) children have no share to trade.
 */
export function buildSplitters(parent: BlockNode | null, layout: LayoutResult | null): Splitter[] {
  if (!parent || !layout) return [];
  if (parent.layout.kind !== 'linear') return [];
  if (parent.collapsed || parent.children.length < 2) return [];

  const axis: 'x' | 'y' = parent.layout.axis === 'x' ? 'x' : 'y';
  const result: Splitter[] = [];

  for (let i = 0; i < parent.children.length - 1; i += 1) {
    const a = parent.children[i];
    const b = parent.children[i + 1];
    const aWeight = weightOf(a);
    const bWeight = weightOf(b);
    if (aWeight <= 0 || bWeight <= 0) continue;

    const ra = layout.rects[a.id];
    const rb = layout.rects[b.id];
    if (!ra || !rb) continue;

    let box: { x: number; y: number; w: number; h: number };
    let span: number;

    if (axis === 'y') {
      const boundary = (ra.y + ra.h + rb.y) / 2;
      const left = Math.min(ra.x, rb.x);
      const right = Math.max(ra.x + ra.w, rb.x + rb.w);
      span = rb.y + rb.h - ra.y;
      box = { x: left, y: boundary - HANDLE / 2, w: right - left, h: HANDLE };
    } else {
      const boundary = (ra.x + ra.w + rb.x) / 2;
      const top = Math.min(ra.y, rb.y);
      const bottom = Math.max(ra.y + ra.h, rb.y + rb.h);
      span = rb.x + rb.w - ra.x;
      box = { x: boundary - HANDLE / 2, y: top, w: HANDLE, h: bottom - top };
    }

    if (span < MIN_SPAN || box.w <= 0 || box.h <= 0) continue;

    result.push({
      key: `${parent.id}:${a.id}:${b.id}`,
      parentId: parent.id,
      axis,
      aId: a.id,
      bId: b.id,
      ...box,
      aWeight,
      bWeight,
      span,
    });
  }

  return result;
}
