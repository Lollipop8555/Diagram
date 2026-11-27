import type { DiagramDoc, ID, Rect } from '../model/types';

export interface EdgeGeom {
  id: ID;
  d: string;
  label?: { x: number; y: number; text: string };
  dashed: boolean;
  kind: string;
}

function cubic(s: [number, number], c1: [number, number], c2: [number, number], e: [number, number]): string {
  return `M ${s[0]} ${s[1]} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${e[0]} ${e[1]}`;
}

function mid(s: [number, number], c1: [number, number], c2: [number, number], e: [number, number]) {
  const t = 0.5;
  const mt = 1 - t;
  const x = mt ** 3 * s[0] + 3 * mt ** 2 * t * c1[0] + 3 * mt * t ** 2 * c2[0] + t ** 3 * e[0];
  const y = mt ** 3 * s[1] + 3 * mt ** 2 * t * c1[1] + 3 * mt * t ** 2 * c2[1] + t ** 3 * e[1];
  return { x, y };
}

export function relationPath(a: Rect, b: Rect): { d: string; label: { x: number; y: number } } {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const off = 36;

  if (horizontal) {
    const dir = dx >= 0 ? 1 : -1;
    const s: [number, number] = [dir > 0 ? a.x + a.w : a.x, ac.y];
    const e: [number, number] = [dir > 0 ? b.x : b.x + b.w, bc.y];
    const c1: [number, number] = [s[0] + dir * off, s[1]];
    const c2: [number, number] = [e[0] - dir * off, e[1]];
    return { d: cubic(s, c1, c2, e), label: mid(s, c1, c2, e) };
  }

  const dir = dy >= 0 ? 1 : -1;
  const s: [number, number] = [ac.x, dir > 0 ? a.y + a.h : a.y];
  const e: [number, number] = [bc.x, dir > 0 ? b.y : b.y + b.h];
  const c1: [number, number] = [s[0], s[1] + dir * off];
  const c2: [number, number] = [e[0], e[1] - dir * off];
  return { d: cubic(s, c1, c2, e), label: mid(s, c1, c2, e) };
}

export function selfPath(a: Rect): { d: string; label: { x: number; y: number } } {
  const s: [number, number] = [a.x + a.w, a.y + a.h * 0.32];
  const e: [number, number] = [a.x + a.w, a.y + a.h * 0.68];
  const c1: [number, number] = [a.x + a.w + 56, a.y + a.h * 0.16];
  const c2: [number, number] = [a.x + a.w + 56, a.y + a.h * 0.84];
  return { d: cubic(s, c1, c2, e), label: { x: a.x + a.w + 48, y: a.y + a.h / 2 } };
}

export function buildEdges(doc: DiagramDoc, rects: Record<ID, Rect>): EdgeGeom[] {
  const out: EdgeGeom[] = [];
  for (const rel of doc.relations) {
    const a = rects[rel.from];
    const b = rects[rel.to];
    if (!a || !b) continue;
    const geom = rel.from === rel.to ? selfPath(a) : relationPath(a, b);
    out.push({
      id: rel.id,
      d: geom.d,
      label: rel.label
        ? { x: geom.label.x, y: geom.label.y, text: rel.label }
        : undefined,
      dashed: Boolean(rel.dashed),
      kind: rel.kind,
    });
  }
  return out;
}

export function expandBounds(bounds: Rect, edges: EdgeGeom[]): Rect {
  let minX = bounds.x;
  let minY = bounds.y;
  let maxX = bounds.x + bounds.w;
  let maxY = bounds.y + bounds.h;
  edges.forEach((e) => {
    if (e.label) {
      minX = Math.min(minX, e.label.x - 40);
      maxX = Math.max(maxX, e.label.x + 40);
      minY = Math.min(minY, e.label.y - 20);
      maxY = Math.max(maxY, e.label.y + 20);
    }
  });
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function portPoints(rect: Rect) {
  return {
    top: { x: rect.x + rect.w / 2, y: rect.y },
    right: { x: rect.x + rect.w, y: rect.y + rect.h / 2 },
    bottom: { x: rect.x + rect.w / 2, y: rect.y + rect.h },
    left: { x: rect.x, y: rect.y + rect.h / 2 },
  };
}
