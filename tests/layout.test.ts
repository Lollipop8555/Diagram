import { describe, expect, it } from 'vitest';
import { TEMPLATE_IDS, type BlockNode, type DiagramDoc, type Locale, type Rect } from '../src/model/types';
import { getTemplate } from '../src/model/templates';
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
