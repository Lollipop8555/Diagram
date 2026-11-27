import type { BlockNode, DiagramDoc, ID, Rect, Size } from '../model/types';
import { LAYOUTS, headerOf, paddingOf, titleWidthOf } from './registry';

export interface BlockEntry {
  block: BlockNode;
  rect: Rect;
  depth: number;
  parentId: ID | null;
  index: number;
}

export interface LayoutResult {
  rects: Record<ID, Rect>;
  entries: BlockEntry[];
  byId: Record<ID, BlockEntry>;
  rootSize: Size;
  bounds: Rect;
}

function measureBlock(block: BlockNode, depth: number, sizes: Record<ID, Size>): Size {
  const pad = paddingOf(block);
  const header = headerOf(block);

  if (block.layout.kind === 'spacer') {
    const s = { w: 8, h: 8 };
    sizes[block.id] = s;
    return s;
  }

  if (block.layout.kind === 'leaf') {
    const core = LAYOUTS.leaf.measure(block, [], { availWidth: 220, depth });
    const s = {
      w: core.w + pad.x * 2,
      h: core.h + pad.y * 2 + (block.badge ? 0 : 0),
    };
    sizes[block.id] = s;
    return s;
  }

  if (block.collapsed) {
    const w = Math.max(96, titleWidthOf(block)) + pad.x * 2 + header.gutter;
    const s = { w, h: 40 };
    sizes[block.id] = s;
    return s;
  }

  const childSizes = block.children.map((child) => measureBlock(child, depth + 1, sizes));
  const core = LAYOUTS[block.layout.kind].measure(block, childSizes, {
    availWidth: block.layout.maxWidth ?? 620,
    depth,
  });
  let w = core.w + pad.x * 2 + header.gutter;
  if (header.h > 0) w = Math.max(w, titleWidthOf(block) + pad.x * 2);
  const h = core.h + pad.y * 2 + header.h;
  const s = { w: Math.max(w, 40), h: Math.max(h, 32) };
  sizes[block.id] = s;
  return s;
}

export const MIN_ROOT_W = 240;
export const MIN_ROOT_H = 160;

export function layoutDoc(doc: DiagramDoc, minWidth = 880): LayoutResult {
  const sizes: Record<ID, Size> = {};
  const rects: Record<ID, Rect> = {};
  const entries: BlockEntry[] = [];
  const byId: Record<ID, BlockEntry> = {};

  const measured = measureBlock(doc.root, 0, sizes);
  // The root frame is authoritative when it has an explicit size; children are
  // divided by weight inside it (so the whole diagram can be compressed).
  const explicit = doc.size && doc.size.w > 0 && doc.size.h > 0 ? doc.size : null;
  const rootRect: Rect = explicit
    ? { x: 0, y: 0, w: Math.max(MIN_ROOT_W, explicit.w), h: Math.max(MIN_ROOT_H, explicit.h) }
    : { x: 0, y: 0, w: Math.max(measured.w, minWidth), h: measured.h };

  const visit = (block: BlockNode, rect: Rect, depth: number, parentId: ID | null, index: number) => {
    const entry: BlockEntry = { block, rect, depth, parentId, index };
    entries.push(entry);
    byId[block.id] = entry;
    rects[block.id] = rect;
    if (block.collapsed || block.layout.kind === 'leaf' || block.layout.kind === 'spacer') return;
    const pad = paddingOf(block);
    const header = headerOf(block);
    const content: Rect = {
      x: rect.x + pad.x + header.gutter,
      y: rect.y + pad.y + header.h,
      w: Math.max(0, rect.w - pad.x * 2 - header.gutter),
      h: Math.max(0, rect.h - pad.y * 2 - header.h),
    };
    const childSizes = block.children.map((c) => sizes[c.id] ?? { w: 0, h: 0 });
    const childRects = LAYOUTS[block.layout.kind].place(block, content, childSizes, {
      availWidth: content.w,
      depth,
    });
    block.children.forEach((child, i) => {
      const r = childRects[i];
      if (!r) return;
      visit(child, r, depth + 1, block.id, i);
    });
  };

  visit(doc.root, rootRect, 0, null, 0);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  entries.forEach(({ rect }) => {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  });
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = rootRect.w;
    maxY = rootRect.h;
  }
  const bounds: Rect = explicit
    ? { x: 0, y: 0, w: rootRect.w, h: rootRect.h }
    : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

  return { rects, entries, byId, rootSize: { w: rootRect.w, h: rootRect.h }, bounds };
}

export function blockAtPoint(result: LayoutResult, x: number, y: number): BlockEntry | null {
  let hit: BlockEntry | null = null;
  for (const entry of result.entries) {
    const r = entry.rect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      if (!hit || entry.depth > hit.depth) hit = entry;
    }
  }
  return hit;
}

export function countTree(root: BlockNode): { total: number; maxDepth: number; relationsHint: number } {
  let total = 0;
  let maxDepth = 0;
  const walk = (b: BlockNode, depth: number) => {
    total += 1;
    maxDepth = Math.max(maxDepth, depth);
    b.children.forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);
  return { total, maxDepth, relationsHint: 0 };
}
