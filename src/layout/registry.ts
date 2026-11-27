import type { BlockNode, LayoutKind, Rect, Size } from '../model/types';
import { skinDefOf } from '../skins/palette';
import {
  FONT_SUB,
  FONT_TITLE,
  LINE_SUB,
  LINE_TITLE,
  textWidth,
  wrapText,
} from '../model/measure';

export interface MeasureCtx {
  /** Width budget for flow wrapping. */
  availWidth: number;
  depth: number;
}

export interface LayoutDef {
  kind: LayoutKind;
  accepts(child: LayoutKind): boolean;
  measure(block: BlockNode, children: Size[], ctx: MeasureCtx): Size;
  place(block: BlockNode, box: Rect, children: Size[], ctx: MeasureCtx): Rect[];
}

export const MAX_DEPTH = 8;
export const MAX_CHILDREN = 40;

export function paddingOf(block: BlockNode): { x: number; y: number } {
  const def = skinDefOf(block.skin);
  return {
    x: block.layout.padding ?? def.padX,
    y: block.layout.padding ?? def.padY,
  };
}

export function headerOf(block: BlockNode): { h: number; gutter: number } {
  const def = skinDefOf(block.skin);
  if (!block.title || def.titlePos === 'none') return { h: 0, gutter: 0 };
  if (def.titlePos === 'left') return { h: 0, gutter: def.gutter };
  if (def.titlePos === 'top') return { h: def.headerH, gutter: 0 };
  return { h: 0, gutter: 0 };
}

const gapOf = (b: BlockNode, fallback = 12) => Math.max(0, b.layout.gap ?? fallback);

const axisOf = (b: BlockNode): 'x' | 'y' => b.layout.axis ?? 'y';

const maxOf = (values: number[]): number => (values.length ? Math.max(...values) : 0);

export const weightOf = (block: BlockNode) => Math.max(0, block.layout.weight ?? 0);

/* ------------------------------------------------------------------ linear */

/**
 * Main-axis sizes for a linear container. The axis is always filled: every child
 * is a flex item with `max(1, weight)` (a missing weight behaves like 1, so
 * unweighted rows split evenly), and the sizes stay strictly proportional. The
 * unit is the largest `content / weight` ratio, so proportional sizing never
 * shrinks a child below its text.
 */
function mainWeights(block: BlockNode): number[] {
  return block.children.map((child) => Math.max(1, weightOf(child)));
}

function proportionalMain(block: BlockNode, intrinsic: number[]): number[] {
  const weights = mainWeights(block);
  let unit = 0;
  weights.forEach((w, i) => {
    unit = Math.max(unit, intrinsic[i] / w);
  });
  return weights.map((w) => unit * w);
}

/** Re-distribute an available main budget by weight, never below content size. */
function allocateMain(block: BlockNode, intrinsic: number[], budget: number): number[] {
  const weights = mainWeights(block);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w, i) => Math.max(intrinsic[i], (budget * w) / totalWeight));
}

const linear: LayoutDef = {
  kind: 'linear',
  accepts: () => true,
  measure(block, children) {
    const gap = gapOf(block);
    const vertical = axisOf(block) === 'y';
    const gapTotal = gap * Math.max(0, children.length - 1);
    const mains = proportionalMain(
      block,
      children.map((c) => (vertical ? c.h : c.w)),
    );
    const main = mains.reduce((sum, size) => sum + size, 0) + gapTotal;
    const cross = maxOf(children.map((c) => (vertical ? c.w : c.h)));
    return vertical ? { w: cross, h: main } : { w: main, h: cross };
  },
  place(block, box, children) {
    const gap = gapOf(block);
    const vertical = axisOf(block) === 'y';
    const availMain = vertical ? box.h : box.w;
    const availCross = vertical ? box.w : box.h;
    const crossOf = (s: Size) => (vertical ? s.w : s.h);

    const gapTotal = gap * Math.max(0, children.length - 1);
    const mainSizes = allocateMain(
      block,
      children.map((c) => (vertical ? c.h : c.w)),
      Math.max(0, availMain - gapTotal),
    );

    const used = mainSizes.reduce((a, b) => a + b, 0) + gapTotal;
    const free = Math.max(0, availMain - used);
    const justify = block.layout.justify ?? 'start';
    let cursor = justify === 'center' ? free / 2 : justify === 'end' ? free : 0;
    const extraGap =
      justify === 'between' && children.length > 1 ? free / (children.length - 1) : 0;
    // The cross axis is filled by default: a linear stack reads as a clean grid.
    const align = block.layout.align ?? 'stretch';

    return children.map((c, i) => {
      const mainSize = mainSizes[i];
      const cs = crossOf(c);
      const crossSize = align === 'stretch' ? availCross : cs;
      const crossPos =
        align === 'center' ? (availCross - cs) / 2 : align === 'end' ? availCross - cs : 0;
      const pos = cursor;
      cursor += mainSize + gap + extraGap;
      return vertical
        ? { x: box.x + crossPos, y: box.y + pos, w: crossSize, h: mainSize }
        : { x: box.x + pos, y: box.y + crossPos, w: mainSize, h: crossSize };
    });
  },
};

/* -------------------------------------------------------------------- grid */

interface GridInfo {
  colWidths: number[];
  rowHeights: number[];
  /** Weight share of each track, used to grow cells to fill the available box. */
  colWeights: number[];
  rowWeights: number[];
  cells: { col: number; row: number; span: number }[];
  gap: number;
  rowGap: number;
  totalW: number;
  totalH: number;
}

function gridInfo(block: BlockNode, children: Size[]): GridInfo {
  const columns = Math.max(1, Math.min(12, Math.round(block.layout.columns ?? 1)));
  const gap = gapOf(block);
  const rowGap = Math.max(0, block.layout.lineGap ?? gap);
  const colWidths = new Array<number>(columns).fill(0);
  // Column weights belong to the container; child weights only affect rows.
  const declaredWeights = block.layout.columnWeights ?? [];
  const colWeights = Array.from({ length: columns }, (_, i) =>
    Math.max(1, Math.round(declaredWeights[i] ?? 1)),
  );
  const rowHeights: number[] = [];
  const rowWeights: number[] = [];
  const cells: { col: number; row: number; span: number }[] = [];
  let col = 0;
  let row = 0;

  children.forEach((child, i) => {
    const rawSpan = Math.round(block.children[i]?.layout.span ?? 1);
    const span = Math.max(1, Math.min(columns, rawSpan));
    const weight = Math.max(1, weightOf(block.children[i]));
    if (col + span > columns) {
      col = 0;
      row += 1;
    }
    cells.push({ col, row, span });
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, child.h);
    // A row is as tall as its heaviest child: equal weights ⇒ equal row heights.
    rowWeights[row] = Math.max(rowWeights[row] ?? 0, weight);
    const cellX = col;
    for (let k = 0; k < span; k += 1) {
      colWidths[cellX + k] = Math.max(colWidths[cellX + k], child.w / span);
    }
    col += span;
    if (col >= columns) {
      col = 0;
      row += 1;
    }
  });

  const maxCol = maxOf(colWidths);
  const equal = (block.layout.columnMode ?? 'equal') === 'equal';
  const baseCols = colWidths.map((w) => (equal ? Math.max(w, maxCol) : Math.max(w, 1)));
  // A track's footprint follows its children's weights, just like a linear axis.
  const finalCols = weightedTracks(baseCols, colWeights);
  const finalRows = weightedTracks(rowHeights, rowWeights);
  const totalW = finalCols.reduce((a, b) => a + b, 0) + gap * Math.max(0, columns - 1);
  const totalH = finalRows.reduce((a, b) => a + b, 0) + rowGap * Math.max(0, finalRows.length - 1);
  return {
    colWidths: finalCols,
    rowHeights,
    colWeights,
    rowWeights,
    cells,
    gap,
    rowGap,
    totalW,
    totalH,
  };
}

/** Size tracks strictly by weight, with the largest content/weight ratio as unit. */
function weightedTracks(sizes: number[], weights: number[]): number[] {
  let unit = 0;
  weights.forEach((weight, i) => {
    if (weight > 0) unit = Math.max(unit, (sizes[i] ?? 0) / weight);
  });
  return weights.map((weight, i) =>
    weight > 0 ? unit * weight : sizes[i] ?? 0,
  );
}

/** Grow tracks into the available box, split by weight (never below content). */
function growTracks(sizes: number[], weights: number[], gap: number, available: number): number[] {
  const budget = Math.max(0, available - gap * Math.max(0, sizes.length - 1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return sizes.slice();
  return sizes.map((size, i) => Math.max(size, (budget * weights[i]) / totalWeight));
}

const grid: LayoutDef = {
  kind: 'grid',
  accepts: (child) => child !== 'spacer',
  measure(block, children) {
    if (!children.length) return { w: 0, h: 0 };
    const info = gridInfo(block, children);
    return { w: info.totalW, h: info.totalH };
  },
  place(block, box, children) {
    if (!children.length) return [];
    const info = gridInfo(block, children);
    const stretch = (block.layout.align ?? 'stretch') === 'stretch';
    const colWidths = stretch
      ? growTracks(info.colWidths, info.colWeights, info.gap, box.w)
      : info.colWidths;
    const rowHeights = stretch
      ? growTracks(info.rowHeights, info.rowWeights, info.rowGap, box.h)
      : info.rowHeights;
    const offsetX = stretch ? 0 : Math.max(0, (box.w - info.totalW) / 2);
    const offsetY = stretch ? 0 : Math.max(0, (box.h - info.totalH) / 2);
    const colX: number[] = [];
    let x = 0;
    colWidths.forEach((w) => {
      colX.push(x);
      x += w + info.gap;
    });
    const rowY: number[] = [];
    let y = 0;
    rowHeights.forEach((h) => {
      rowY.push(y);
      y += h + info.rowGap;
    });

    return children.map((child, i) => {
      const cell = info.cells[i];
      let cellW = info.gap * (cell.span - 1);
      for (let k = 0; k < cell.span; k += 1) cellW += colWidths[cell.col + k] ?? 0;
      const cellH = rowHeights[cell.row] ?? child.h;
      const align = block.layout.align ?? 'stretch';
      const cx =
        align === 'stretch'
          ? 0
          : align === 'end'
            ? cellW - child.w
            : align === 'center'
              ? (cellW - child.w) / 2
              : 0;
      const cy =
        align === 'stretch'
          ? 0
          : align === 'end'
            ? cellH - child.h
            : (cellH - child.h) / 2;
      return {
        x: box.x + offsetX + colX[cell.col] + Math.max(0, cx),
        y: box.y + offsetY + rowY[cell.row] + Math.max(0, cy),
        w: stretch ? cellW : child.w,
        h: stretch ? cellH : child.h,
      };
    });
  },
};

/* -------------------------------------------------------------------- flow */

function flowLines(
  children: Size[],
  maxWidth: number,
  gap: number,
): { lines: number[][]; widths: number[] } {
  const lines: number[][] = [];
  const widths: number[] = [];
  let line: number[] = [];
  let width = 0;
  children.forEach((child, i) => {
    const add = line.length ? gap + child.w : child.w;
    if (line.length && width + add > maxWidth) {
      lines.push(line);
      widths.push(width);
      line = [i];
      width = child.w;
    } else {
      line.push(i);
      width += add;
    }
  });
  if (line.length) {
    lines.push(line);
    widths.push(width);
  }
  return { lines, widths };
}

const flow: LayoutDef = {
  kind: 'flow',
  accepts: (child) => child === 'leaf',
  measure(block, children, ctx) {
    if (!children.length) return { w: 0, h: 0 };
    const gap = gapOf(block);
    const lineGap = Math.max(0, block.layout.lineGap ?? gap);
    const budget = block.layout.maxWidth ?? Math.max(160, ctx.availWidth);
    const { lines, widths } = flowLines(children, budget, gap);
    const h =
      lines.reduce((sum, line) => sum + maxOf(line.map((i) => children[i].h)), 0) +
      lineGap * Math.max(0, lines.length - 1);
    return { w: maxOf(widths), h };
  },
  place(block, box, children) {
    if (!children.length) return [];
    const gap = gapOf(block);
    const lineGap = Math.max(0, block.layout.lineGap ?? gap);
    const { lines } = flowLines(children, Math.max(40, box.w), gap);
    const rects: Rect[] = [];
    let y = 0;
    lines.forEach((line) => {
      const lineH = maxOf(line.map((i) => children[i].h));
      const lineW = line.reduce((sum, i, k) => sum + children[i].w + (k ? gap : 0), 0);
      const align = block.layout.align ?? 'start';
      let x = align === 'center' ? (box.w - lineW) / 2 : align === 'end' ? box.w - lineW : 0;
      line.forEach((i) => {
        rects[i] = { x: box.x + x, y: box.y + y, w: children[i].w, h: children[i].h };
        x += children[i].w + gap;
      });
      y += lineH + lineGap;
    });
    return rects;
  },
};

/* ------------------------------------------------------------------- stack */

const stack: LayoutDef = {
  kind: 'stack',
  accepts: (child) => child !== 'spacer',
  measure(_block, children) {
    if (!children.length) return { w: 0, h: 0 };
    return { w: maxOf(children.map((c) => c.w)), h: maxOf(children.map((c) => c.h)) };
  },
  place(block, box, children) {
    return children.map((child, i) => {
      if (i === 0) return { x: box.x, y: box.y, w: child.w, h: child.h };
      const anchor = block.children[i]?.layout.anchor ?? 'top-right';
      const x =
        anchor === 'top-left' || anchor === 'bottom-left'
          ? box.x
          : anchor === 'center'
            ? box.x + (box.w - child.w) / 2
            : box.x + box.w - child.w;
      const y =
        anchor === 'top-left' || anchor === 'top-right'
          ? box.y
          : anchor === 'center'
            ? box.y + (box.h - child.h) / 2
            : box.y + box.h - child.h;
      return { x, y, w: child.w, h: child.h };
    });
  },
};

/* ------------------------------------------------------------ leaf / spacer */

const leaf: LayoutDef = {
  kind: 'leaf',
  accepts: () => false,
  measure(block) {
    const maxWidth = block.layout.maxWidth ?? 190;
    const titleLines = wrapText(block.title ?? '', FONT_TITLE, maxWidth);
    const subLines = block.subtitle ? wrapText(block.subtitle, FONT_SUB, maxWidth) : [];
    const w = Math.max(
      textWidth(block.title ?? '', FONT_TITLE),
      block.subtitle ? textWidth(block.subtitle, FONT_SUB) : 0,
      block.badge ? textWidth(block.badge, FONT_TITLE) + 8 : 0,
      24,
    );
    const h =
      Math.max(1, titleLines.length) * LINE_TITLE +
      subLines.length * LINE_SUB +
      (block.subtitle ? 2 : 0);
    return { w: Math.min(w, maxWidth), h };
  },
  place: () => [],
};

const spacer: LayoutDef = {
  kind: 'spacer',
  accepts: () => false,
  measure: () => ({ w: 8, h: 8 }),
  place: () => [],
};

export const LAYOUTS: Record<LayoutKind, LayoutDef> = {
  linear,
  grid,
  flow,
  stack,
  leaf,
  spacer,
};

const MATRIX: Record<LayoutKind, LayoutKind[]> = {
  linear: ['linear', 'grid', 'flow', 'stack', 'spacer', 'leaf'],
  grid: ['linear', 'grid', 'flow', 'stack', 'leaf'],
  flow: ['leaf'],
  stack: ['linear', 'grid', 'flow', 'stack', 'leaf'],
  spacer: [],
  leaf: [],
};

export function acceptsChild(parent: LayoutKind, child: LayoutKind): boolean {
  return MATRIX[parent].includes(child);
}

export function isContainer(kind: LayoutKind): boolean {
  return kind !== 'leaf' && kind !== 'spacer';
}

export function titleWidthOf(block: BlockNode): number {
  return block.title ? textWidth(block.title, FONT_TITLE) + 24 : 0;
}
