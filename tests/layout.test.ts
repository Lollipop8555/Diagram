import { describe, expect, it } from 'vitest';
import { TEMPLATE_IDS, type BlockNode, type DiagramDoc, type Locale, type Rect } from '../src/model/types';
import { getTemplate } from '../src/model/templates';
import { pairWeights } from '../src/model/tree';
import { layoutDoc } from '../src/layout/dispatch';

function overlap(a: Rect, b: Rect): boolean {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0.5 && h > 0.5;
}

const LOCALES: Locale[] = ['zh', 'en'];

describe('layout geometry', () => {
  it('never overlaps leaf blocks inside a template', () => {
    const problems: string[] = [];
    for (const id of TEMPLATE_IDS) {
      for (const locale of LOCALES) {
        const layout = layoutDoc(getTemplate(id).createDemo(locale));
        const leaves = layout.entries.filter(
          (entry) => entry.block.layout.kind === 'leaf' && entry.block.skin.kind !== 'plain',
        );
        for (let i = 0; i < leaves.length; i += 1) {
          for (let j = i + 1; j < leaves.length; j += 1) {
            if (overlap(leaves[i].rect, leaves[j].rect)) {
              problems.push(`${id}/${locale}: ${leaves[i].block.title} × ${leaves[j].block.title}`);
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps plain captions clear of their children', () => {
    const problems: string[] = [];
    for (const id of TEMPLATE_IDS) {
      for (const locale of LOCALES) {
        const layout = layoutDoc(getTemplate(id).createDemo(locale));
        for (const entry of layout.entries) {
          if (entry.block.skin.kind !== 'plain' || !entry.block.title || !entry.block.children.length) continue;
          const captionBottom = entry.rect.y + 4 + 18;
          const childTop = Math.min(
            ...layout.entries
              .filter((item) => entry.block.children.some((child) => child.id === item.block.id))
              .map((item) => item.rect.y),
          );
          if (childTop < captionBottom - 0.5) {
            problems.push(`${id}/${locale}: ${entry.block.title} (${childTop} < ${captionBottom})`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('linear weights', () => {
  function weightedDoc(weights: number[]): DiagramDoc {
    const leaves: BlockNode[] = weights.map((weight, i) => ({
      id: `w${i}`,
      title: `块 ${i}`,
      layout: { kind: 'leaf', weight },
      skin: { kind: 'chip', tone: 'mint' },
      children: [],
    }));
    return {
      version: 3,
      meta: {
        title: 'weights',
        template: 'custom',
        direction: 'top-down',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      root: {
        id: 'root',
        title: '',
        layout: { kind: 'linear', axis: 'y', gap: 0 },
        skin: { kind: 'plain', tone: 'paper' },
        children: leaves,
      },
      relations: [],
    };
  }

  it('splits the main axis strictly by weight', () => {
    const weights = [5, 5, 3, 3, 1];
    const layout = layoutDoc(weightedDoc(weights));
    const heights = layout.rootSize ? weights.map((_, i) => layout.byId[`w${i}`].rect.h) : [];
    const unit = heights[0] / weights[0];
    heights.forEach((h, i) => expect(h / weights[i]).toBeCloseTo(unit, 5));
    // Proportional sizing must still respect the text: nothing is squeezed flat.
    expect(Math.min(...heights)).toBeGreaterThan(20);
  });

  it('stretches the cross axis to the container', () => {
    const layout = layoutDoc(weightedDoc([1, 2, 1]));
    const widths = [0, 1, 2].map((i) => layout.byId[`w${i}`].rect.w);
    expect(new Set(widths.map((w) => Math.round(w))).size).toBe(1);
    expect(widths[0]).toBeGreaterThan(80);
  });
});

describe('weight semantics', () => {
  function unevenDoc(weights: number[], kind: 'linear' | 'grid'): DiagramDoc {
    return {
      version: 3,
      meta: {
        title: 'weights',
        template: 'custom',
        direction: 'top-down',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      root: {
        id: 'root',
        title: '',
        layout:
          kind === 'linear'
            ? { kind: 'linear', axis: 'y', gap: 0 }
            : { kind: 'grid', columns: 1, gap: 0 },
        skin: { kind: 'plain', tone: 'paper' },
        // The middle leaf has a subtitle, so it is naturally taller.
        children: weights.map((weight, i) => ({
          id: `w${i}`,
          title: `块 ${i}`,
          subtitle: i === 1 ? '较长的说明文字' : undefined,
          layout: { kind: 'leaf' as const, weight },
          skin: { kind: 'chip' as const, tone: 'mint' as const },
          children: [],
        })),
      },
      relations: [],
    };
  }

  function sizes(d: DiagramDoc) {
    const layout = layoutDoc(d);
    return {
      list: d.root.children.map((child) => layout.byId[child.id].rect.h),
      total: layout.bounds.h,
    };
  }

  it('linear: a heavier child grows and its siblings keep their size', () => {
    const base = sizes(unevenDoc([1, 1, 1], 'linear'));
    const grown = sizes(unevenDoc([1, 2, 1], 'linear'));
    // Equal weights still line up at the biggest natural size.
    expect(base.list[0]).toBeCloseTo(base.list[1], 5);
    // The siblings are untouched; only the weighted one grows, and the diagram follows.
    expect(grown.list[0]).toBeCloseTo(base.list[0], 5);
    expect(grown.list[2]).toBeCloseTo(base.list[2], 5);
    expect(grown.list[1]).toBeCloseTo(base.list[1] * 2, 5);
    expect(grown.total).toBeGreaterThan(base.total);
  });

  it('linear: one extra share adds exactly one base size', () => {
    const base = sizes(unevenDoc([1, 1, 1], 'linear'));
    const one = sizes(unevenDoc([1, 2, 1], 'linear'));
    const two = sizes(unevenDoc([2, 4, 2], 'linear'));
    expect(one.list[1] - base.list[1]).toBeCloseTo(base.list[0], 5);
    // The share is a fixed unit, so doubling every weight doubles every block.
    one.list.forEach((value, i) => expect(two.list[i]).toBeCloseTo(value * 2, 5));
  });

  it('grid: a heavier row grows and the other row keeps its height', () => {
    const base = sizes(unevenDoc([1, 1], 'grid'));
    const grown = sizes(unevenDoc([1, 2], 'grid'));
    expect(base.list[0]).toBeCloseTo(base.list[1], 5);
    expect(grown.list[0]).toBeCloseTo(base.list[0], 5);
    expect(grown.list[1]).toBeCloseTo(base.list[1] * 2, 5);
  });

  it('a trade keeps the pair total while both sides keep a share', () => {
    const base = unevenDoc([2, 2], 'linear');
    const traded = pairWeights(base, 'w0', 'w1', 3, 1);
    const before = layoutDoc(base);
    const after = layoutDoc(traded);
    const sum = (layout: typeof before) =>
      layout.byId.w0.rect.h + layout.byId.w1.rect.h;
    expect(after.byId.w0.rect.h).toBeGreaterThan(before.byId.w0.rect.h);
    expect(after.byId.w1.rect.h).toBeLessThan(before.byId.w1.rect.h);
    // A splitter trade keeps the pair's total size: the boundary moves, no growth.
    expect(sum(after)).toBeCloseTo(sum(before), 5);
  });
});

describe('grid weights', () => {
  function gridDoc(
    columnWeights: number[],
    childWeights: number[] = [1, 1, 1],
    columns = 3,
  ): DiagramDoc {
    return {
      version: 3,
      meta: {
        title: 'grid',
        template: 'custom',
        direction: 'top-down',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      root: {
        id: 'root',
        title: '',
        layout: { kind: 'grid', columns, gap: 0, columnWeights },
        skin: { kind: 'plain', tone: 'paper' },
        children: childWeights.map((weight, i) => ({
          id: `g${i}`,
          title: `块 ${i}`,
          layout: { kind: 'leaf', weight },
          skin: { kind: 'chip', tone: 'mint' },
          children: [],
        })),
      },
      relations: [],
    };
  }

  it('uses container column weights for widths and fills the box', () => {
    const layout = layoutDoc(gridDoc([1, 2, 1], [1, 1, 1]));
    const widths = [0, 1, 2].map((i) => layout.byId[`g${i}`].rect.w);
    const unit = widths[0] / 1;
    widths.forEach((w, i) => expect(w / [1, 2, 1][i]).toBeCloseTo(unit, 5));
    // Plain root has 4px horizontal padding: the grid content box is 880 - 8.
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(layout.byId.root.rect.w - 8, 5);
  });

  it('ignores child weights for columns', () => {
    const layout = layoutDoc(gridDoc([1, 1, 1], [1, 9, 1]));
    const widths = [0, 1, 2].map((i) => layout.byId[`g${i}`].rect.w);
    expect(new Set(widths.map((w) => Math.round(w))).size).toBe(1);
  });

  it('uses child weights for row heights', () => {
    const layout = layoutDoc(gridDoc([1], [1, 2], 1));
    const heights = [0, 1].map((i) => layout.byId[`g${i}`].rect.h);
    expect(heights[1] / heights[0]).toBeCloseTo(2, 5);
  });

  it('gives rows with the same weight the same height', () => {
    // Two columns, three children: A + B share row 1, C sits alone in row 2.
    const layout = layoutDoc(gridDoc([1, 1], [1, 1, 1], 2));
    const a = layout.byId.g0.rect.h;
    const c = layout.byId.g2.rect.h;
    expect(a).toBeCloseTo(c, 5);
  });

  it('stretches children to the row height', () => {
    const layout = layoutDoc(gridDoc([1, 1, 1]));
    const heights = [0, 1, 2].map((i) => layout.byId[`g${i}`].rect.h);
    expect(new Set(heights.map((h) => Math.round(h))).size).toBe(1);
    expect(heights[0]).toBeGreaterThan(20);
  });
});
