import type { BlockNode, ID } from '../model/types';
import type { LayoutResult } from '../layout/dispatch';
import { weightOf } from '../layout/registry';
import { canGrowRoot } from '../layout/root';

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
  /** Pixel length covered by both blocks along the axis, used for the hit box. */
  span: number;
  /** Pixels per weight share, measured on the pair itself (gap excluded). */
  unit: number;
  /** True when a size increase here can be absorbed by growing the root frame. */
  canGrow: boolean;
}

const HANDLE = 16;
const MIN_SPAN = 16;

/**
 * One handle between each pair of adjacent children of a linear container.
 * This is deliberately unconditional: no need to assign weights first and no
 * need to select a block — like a split screen, the divider is always there.
 */
function splittersOf(parent: BlockNode, layout: LayoutResult): Splitter[] {
  if (parent.layout.kind !== 'linear') return [];
  if (parent.collapsed || parent.children.length < 2) return [];

  const axis: 'x' | 'y' = parent.layout.axis === 'x' ? 'x' : 'y';
  const result: Splitter[] = [];

  for (let i = 0; i < parent.children.length - 1; i += 1) {
    const a = parent.children[i];
    const b = parent.children[i + 1];
    // Unset weights behave like 1 share, so every pair has a meaningful divider.
    const aWeight = weightOf(a) || 1;
    const bWeight = weightOf(b) || 1;

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

    // Exclude the gap: one share is exactly how much of the pair one weight
    // unit occupies, so the boundary tracks the pointer one-to-one.
    const pairPixels = axis === 'y' ? ra.h + rb.h : ra.w + rb.w;
    const totalWeight = aWeight + bWeight;
    const unit = totalWeight > 0 ? pairPixels / totalWeight : 0;

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
      unit,
      canGrow: canGrowRoot(layout, parent.id, axis),
    });
  }

  return result;
}

/** Handles for one container (kept for tests and focused callers). */
export function buildSplitters(
  parent: BlockNode | null,
  layout: LayoutResult | null,
): Splitter[] {
  if (!parent || !layout) return [];
  return splittersOf(parent, layout);
}

/** Every linear container in the diagram contributes its dividers. */
export function buildAllSplitters(layout: LayoutResult | null): Splitter[] {
  if (!layout) return [];
  const result: Splitter[] = [];
  for (const entry of layout.entries) {
    result.push(...splittersOf(entry.block, layout));
  }
  return result;
}
