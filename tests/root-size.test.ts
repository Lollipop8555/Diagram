import { describe, expect, it } from 'vitest';
import type { BlockNode, DiagramDoc, Size } from '../src/model/types';
import { layoutDoc } from '../src/layout/dispatch';
import { planRootGrowth, withDefaultSize } from '../src/layout/root';

function leaf(id: string, weight: number): BlockNode {
  return {
    id,
    title: `块 ${id}`,
    subtitle: '说明',
    layout: { kind: 'leaf', weight },
    skin: { kind: 'chip', tone: 'mint' },
    children: [],
  };
}

/** Plain root: 4px padding on each side, no title header. */
function frameDoc(size: Size | undefined, weights: number[] = [1, 2, 1]): DiagramDoc {
  return {
    version: 3,
    meta: {
      title: 'frame',
      template: 'custom',
      direction: 'top-down',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    ...(size ? { size } : {}),
    root: {
      id: 'root',
      title: '',
      layout: { kind: 'linear', axis: 'y', gap: 0 },
      skin: { kind: 'plain', tone: 'paper' },
      children: weights.map((weight, i) => leaf(`w${i}`, weight)),
    },
    relations: [],
  };
}

function heights(doc: DiagramDoc): number[] {
  const layout = layoutDoc(doc);
  return doc.root.children.map((child) => layout.byId[child.id].rect.h);
}

describe('root frame', () => {
  it('fills the explicit frame and divides it by weight', () => {
    const doc = frameDoc({ w: 600, h: 400 });
    const layout = layoutDoc(doc);
    const root = layout.byId.root.rect;
    expect(root.w).toBe(600);
    expect(root.h).toBe(400);
    // Content = 400 - 8px padding, split 1:2:1.
    const heights = doc.root.children.map((child) => layout.byId[child.id].rect.h);
    heights.forEach((h, i) => expect(h).toBeCloseTo((392 * [1, 2, 1][i]) / 4, 5));
  });

  it('compresses the content proportionally when the frame shrinks', () => {
    const wide = heights(frameDoc({ w: 600, h: 408 }));
    const narrow = heights(frameDoc({ w: 600, h: 208 }));
    expect(narrow[0]).toBeCloseTo(wide[0] / 2, 5);
    expect(narrow[1]).toBeCloseTo(wide[1] / 2, 5);
  });

  it('gives legacy documents a frame with the same measured look', () => {
    const legacy = frameDoc(undefined);
    const before = heights(legacy);
    const sized = withDefaultSize(legacy);
    expect(sized.size).toBeTruthy();
    expect(heights(sized)).toEqual(before);
  });

  it('grows the frame instead of squeezing the neighbour', () => {
    const doc = frameDoc({ w: 600, h: 400 });
    const layout = layoutDoc(doc);
    // One extra share for the first child: its unit is 392 / 4 = 98px.
    const grown = planRootGrowth(doc, layout, 'root', 'y', 98);
    expect(grown).toEqual({ w: 600, h: 498 });

    // Apply the weight change plus the new frame: everyone else keeps its size.
    const next: DiagramDoc = {
      ...doc,
      size: grown!,
      root: {
        ...doc.root,
        children: doc.root.children.map((child, i) =>
          i === 0 ? { ...child, layout: { ...child.layout, weight: 2 } } : child,
        ),
      },
    };
    const after = layoutDoc(next);
    expect(after.byId.w0.rect.h).toBeCloseTo(layout.byId.w0.rect.h * 2, 5);
    expect(after.byId.w1.rect.h).toBeCloseTo(layout.byId.w1.rect.h, 5);
    expect(after.byId.w2.rect.h).toBeCloseTo(layout.byId.w2.rect.h, 5);
  });

  it('cannot grow when a flow or stack cuts the path', () => {
    const doc = frameDoc({ w: 600, h: 400 });
    const withStack: DiagramDoc = {
      ...doc,
      root: {
        ...doc.root,
        children: [
          {
            id: 'w0',
            title: 'stack',
            layout: { kind: 'stack' },
            skin: { kind: 'plain', tone: 'paper' },
            children: [
              {
                id: 'band',
                title: 'band',
                layout: { kind: 'linear', axis: 'y', gap: 0 },
                skin: { kind: 'plain', tone: 'paper' },
                children: [leaf('w0a', 1), leaf('w0b', 1)],
              },
            ],
          },
        ],
      },
    };
    const layout = layoutDoc(withStack);
    expect(planRootGrowth(withStack, layout, 'band', 'y', 40)).toBeNull();
  });
});
