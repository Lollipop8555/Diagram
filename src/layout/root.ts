import type { BlockNode, DiagramDoc, ID, Size } from '../model/types';
import { layoutDoc, MIN_ROOT_H, MIN_ROOT_W, type LayoutResult } from './dispatch';
import { headerOf, paddingOf } from './registry';

/** Give a document an explicit root frame, using its measured size the first time. */
export function withDefaultSize(doc: DiagramDoc): DiagramDoc {
  if (doc.size && doc.size.w > 0 && doc.size.h > 0) return doc;
  const bounds = layoutDoc(doc).bounds;
  return {
    ...doc,
    size: {
      w: Math.max(MIN_ROOT_W, Math.round(bounds.w)),
      h: Math.max(MIN_ROOT_H, Math.round(bounds.h)),
    },
  };
}

/** Padding + header the root spends on the axis, i.e. the non-share part. */
export function rootFixed(doc: DiagramDoc, axis: 'x' | 'y'): number {
  const pad = paddingOf(doc.root);
  const head = headerOf(doc.root);
  return axis === 'x' ? pad.x * 2 + head.gutter : pad.y * 2 + head.h;
}

/**
 * A parent passes its size along `axis` down to a child proportionally when the
 * axis is its main axis, when it stretches the cross axis, or when it is a grid
 * (tracks fill the box). Flow/stack children keep their intrinsic size.
 */
function passesDown(parent: BlockNode, axis: 'x' | 'y'): boolean {
  if (parent.layout.kind === 'grid') return true;
  if (parent.layout.kind !== 'linear') return false;
  const main = parent.layout.axis ?? 'y';
  return main === axis || (parent.layout.align ?? 'stretch') === 'stretch';
}

/** Pixels per weight share along `axis` inside `parentId`. */
export function weightUnitOf(
  layout: LayoutResult,
  parentId: ID,
  axis: 'x' | 'y',
): number | null {
  const entry = layout.byId[parentId];
  if (!entry) return null;
  const pad = paddingOf(entry.block);
  const head = headerOf(entry.block);
  const content =
    axis === 'x'
      ? entry.rect.w - pad.x * 2 - head.gutter
      : entry.rect.h - pad.y * 2 - head.h;
  const sum = entry.block.children.reduce(
    (total, child) => total + Math.max(1, child.layout.weight || 1),
    0,
  );
  if (sum <= 0) return null;
  return Math.max(0, content) / sum;
}

/** Whether a size change at the root can reach `parentId` along `axis`. */
export function canGrowRoot(
  layout: LayoutResult,
  parentId: ID,
  axis: 'x' | 'y',
): boolean {
  let nodeId: ID = parentId;
  for (let guard = 0; guard < 128; guard += 1) {
    const entry = layout.byId[nodeId];
    if (!entry) return false;
    const up: ID | null = entry.parentId;
    if (!up) return true;
    const parent = layout.byId[up]?.block;
    if (!parent || !passesDown(parent, axis)) return false;
    nodeId = up;
  }
  return false;
}

/**
 * Grow the root frame so that `parentId` gains `gain` pixels along `axis`
 * without shrinking anything else. Returns null when the size cannot flow from
 * the root down to that container (flow/stack content, fixed cross sizes).
 */
export function planRootGrowth(
  doc: DiagramDoc,
  layout: LayoutResult,
  parentId: ID,
  axis: 'x' | 'y',
  gain: number,
): Size | null {
  if (!doc.size || gain <= 0) return null;
  if (!canGrowRoot(layout, parentId, axis)) return null;

  const parentRect = layout.byId[parentId]?.rect;
  if (!parentRect) return null;
  const parentSize = axis === 'x' ? parentRect.w : parentRect.h;
  if (parentSize <= 1) return null;

  const fixed = rootFixed(doc, axis);
  const current = axis === 'x' ? doc.size.w : doc.size.h;
  const content = Math.max(1, current - fixed);
  // For a nested container its size is a pure share of the root content, so the
  // relative gain gives it exactly `gain` more pixels. The root itself is
  // `content + padding`, so it has to be solved against its content instead.
  const isRoot = !layout.byId[parentId]?.parentId;
  const denominator = isRoot ? content : parentSize;
  const next = Math.round(content * (1 + gain / denominator) + fixed);
  return axis === 'x' ? { ...doc.size, w: next } : { ...doc.size, h: next };
}
