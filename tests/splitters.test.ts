import { describe, expect, it } from 'vitest';
import type { BlockNode, DiagramDoc, ID } from '../src/model/types';
import { layoutDoc, type LayoutResult } from '../src/layout/dispatch';
import { buildAllSplitters, buildSplitters } from '../src/canvas/splitters';

function node(id: string, weight: number | undefined, kind: 'linear' | 'grid' = 'linear'): BlockNode {
  return {
    id,
    title: id,
    layout: { kind, ...(weight === undefined ? {} : { weight }) },
    skin: { kind: 'plain', tone: 'paper' },
    children: [],
  };
}

function parent(children: BlockNode[], axis: 'x' | 'y' = 'y', collapsed = false): BlockNode {
  return {
    id: 'p',
    title: 'p',
    layout: { kind: 'linear', axis },
    skin: { kind: 'plain', tone: 'paper' },
    collapsed,
    children,
  };
}

function layoutOf(rects: Record<ID, { x: number; y: number; w: number; h: number }>): LayoutResult {
  return {
    rects,
    entries: [],
    byId: {},
    rootSize: { w: 0, h: 0 },
    bounds: { x: 0, y: 0, w: 0, h: 0 },
  };
}

describe('buildSplitters', () => {
  it('places a horizontal handle between stacked weighted siblings', () => {
    const p = parent([node('a', 1), node('b', 2)]);
    const layout = layoutOf({
      a: { x: 0, y: 0, w: 200, h: 100 },
      b: { x: 0, y: 112, w: 200, h: 200 },
    });
    const splitters = buildSplitters(p, layout);
    expect(splitters).toHaveLength(1);
    expect(splitters[0]).toMatchObject({
      axis: 'y',
      aId: 'a',
      bId: 'b',
      x: 0,
      w: 200,
      h: 16,
      aWeight: 1,
      bWeight: 2,
      span: 312,
      // (100 + 200) px of content / 3 shares; the 12px gap is excluded.
      unit: 100,
    });
    expect(splitters[0].y).toBe(98);
  });

  it('places a vertical handle for side-by-side blocks', () => {
    const p = parent([node('a', 1), node('b', 3)], 'x');
    const layout = layoutOf({
      a: { x: 0, y: 0, w: 100, h: 50 },
      b: { x: 112, y: 0, w: 200, h: 50 },
    });
    const [splitter] = buildSplitters(p, layout);
    expect(splitter).toMatchObject({ axis: 'x', x: 98, w: 16, y: 0, h: 50, span: 312 });
  });

  it('treats unset weights as one share and skips missing rects', () => {
    const p = parent([node('a', 0), node('b', 1), node('c', 1)]);
    const layout = layoutOf({
      a: { x: 0, y: 0, w: 200, h: 100 },
      b: { x: 0, y: 112, w: 200, h: 40 },
      // c intentionally missing
    });
    const splitters = buildSplitters(p, layout);
    expect(splitters).toHaveLength(1);
    expect(splitters[0]).toMatchObject({ aId: 'a', bId: 'b', aWeight: 1, bWeight: 1 });
  });

  it('skips degenerate geometry (overlapping or tiny rects)', () => {
    const p = parent([node('a', 1), node('b', 1)]);
    const layout = layoutOf({
      a: { x: 0, y: 0, w: 200, h: 5 },
      b: { x: 0, y: 6, w: 200, h: 5 },
    });
    expect(buildSplitters(p, layout)).toEqual([]);
  });

  it('ignores non-linear, collapsed and single-child parents', () => {
    const layout = layoutOf({
      a: { x: 0, y: 0, w: 200, h: 100 },
      b: { x: 0, y: 112, w: 200, h: 100 },
    });
    const gridParent: BlockNode = {
      ...parent([node('a', 1), node('b', 1)]),
      layout: { kind: 'grid', columns: 2 },
    };
    expect(buildSplitters(gridParent, layout)).toEqual([]);
    expect(buildSplitters(parent([node('a', 1), node('b', 1)], 'y', true), layout)).toEqual([]);
    expect(buildSplitters(parent([node('a', 1)]), layout)).toEqual([]);
    expect(buildSplitters(null, layout)).toEqual([]);
    expect(buildSplitters(parent([node('a', 1), node('b', 1)]), null)).toEqual([]);
  });
});

describe('buildAllSplitters', () => {
  it('covers every linear container without needing a selection or weights', () => {
    const leaves = (prefix: string) =>
      ['a', 'b'].map((suffix) => ({
        id: `${prefix}${suffix}`,
        title: suffix,
        layout: { kind: 'leaf' as const },
        skin: { kind: 'chip' as const, tone: 'mint' as const },
        children: [],
      }));
    const doc: DiagramDoc = {
      version: 3,
      meta: {
        title: 'nested',
        template: 'custom',
        direction: 'top-down',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      size: { w: 600, h: 400 },
      root: {
        id: 'root',
        title: '',
        layout: { kind: 'linear', axis: 'y', gap: 12 },
        skin: { kind: 'plain', tone: 'paper' },
        children: [
          {
            id: 'band1',
            title: 'band1',
            layout: { kind: 'linear', axis: 'x', gap: 12 },
            skin: { kind: 'plain', tone: 'paper' },
            children: leaves('b1'),
          },
          {
            id: 'band2',
            title: 'band2',
            layout: { kind: 'linear', axis: 'x', gap: 12 },
            skin: { kind: 'plain', tone: 'paper' },
            children: leaves('b2'),
          },
        ],
      },
      relations: [],
    };
    // root pair + one pair inside each band.
    expect(buildAllSplitters(layoutDoc(doc))).toHaveLength(3);
  });
});
