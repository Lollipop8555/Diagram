import { describe, expect, it } from 'vitest';
import type { BlockNode, DiagramDoc, Relation, SkinProps } from '../src/model/types';
import { layoutDoc } from '../src/layout/dispatch';
import { docToSvg } from '../src/export/toSvg';

let seq = 0;
const nextId = () => `b${++seq}`;

function block(over: Partial<BlockNode> & { skin: SkinProps }): BlockNode {
  return {
    id: nextId(),
    title: 'Node',
    children: [],
    layout: { kind: 'leaf' },
    ...over,
  };
}

function doc(root: BlockNode, relations: Relation[] = []): DiagramDoc {
  return {
    version: 3,
    meta: {
      title: 'Doc',
      template: 'custom',
      direction: 'top-down',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    root,
    relations,
  };
}

function svgOf(root: BlockNode, relations: Relation[] = []): string {
  const d = doc(root, relations);
  return docToSvg(d, layoutDoc(d), []);
}

describe('svg export', () => {
  it('paints chip panels with the skin radius override', () => {
    const svg = svgOf(
      block({ title: 'API', skin: { kind: 'chip', tone: 'water', radius: 18 } }),
    );
    expect(svg).toContain('rx="18"');
  });

  it('keeps plain containers chrome-free but still shows their caption', () => {
    const svg = svgOf(
      block({
        title: 'Root',
        skin: { kind: 'plain', tone: 'paper' },
        layout: { kind: 'linear', axis: 'y' },
        children: [block({ title: 'Child', skin: { kind: 'chip', tone: 'mint' } })],
      }),
    );
    expect(svg).toContain('>Root</text>');
    expect(svg.match(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" rx=/g)).toHaveLength(1);
  });

  it('fills notes even when they carry no outline', () => {
    const svg = svgOf(
      block({
        title: 'remember to retry',
        skin: { kind: 'note', tone: 'gold', outline: 'none' },
      }),
    );
    expect(svg).toContain('stroke="none"');
    expect(svg).toContain('font-style="italic"');
  });

  it('renders collapsed blocks as a single summary row with a child count', () => {
    const svg = svgOf(
      block({
        title: 'Platform',
        skin: { kind: 'container', tone: 'water' },
        layout: { kind: 'linear', axis: 'y' },
        collapsed: true,
        children: [
          block({ title: 'Hidden-A', skin: { kind: 'chip', tone: 'water' } }),
          block({ title: 'Hidden-B', skin: { kind: 'chip', tone: 'water' } }),
        ],
      }),
    );
    expect(svg).not.toContain('Hidden-A');
    expect(svg).not.toContain('Hidden-B');
    expect(svg).toContain('>2</text>');
  });

  it('draws a badge pill and the boundary chip label', () => {
    const root = block({
      title: 'Scope',
      skin: { kind: 'boundary', tone: 'lavender' },
      layout: { kind: 'linear', axis: 'y' },
      badge: 'v2',
      children: [block({ title: 'Inner', skin: { kind: 'chip', tone: 'water' } })],
    });
    const svg = svgOf(root);
    expect(svg).toContain('opacity="0.65"');
    expect(svg).toContain('>v2</text>');
    expect(svg).toContain('stroke-dasharray="5 4"');
  });

  it('renders band titles as a thin top strip with a right-aligned subtitle', () => {
    const svg = svgOf(
      block({
        title: 'Gateway',
        subtitle: 'edge tier',
        skin: { kind: 'band', tone: 'iris' },
        layout: { kind: 'linear', axis: 'x' },
      }),
    );
    expect(svg).toContain('>Gateway</text>');
    expect(svg).toContain('>edge tier</text>');
    expect(svg).not.toContain('rotate(-90)');
    expect(svg).toContain('text-anchor="end"');
  });

  it('escapes text and titles the document for accessibility', () => {
    const svg = svgOf(block({ title: 'a < b & c', skin: { kind: 'chip', tone: 'water' } }));
    expect(svg).toContain('aria-label="Doc"');
    expect(svg).toContain('<title>Doc</title>');
    expect(svg).toContain('a &lt; b &amp; c');
  });
});

describe('plain skin layout', () => {
  it('reserves space for the plain caption so it never covers children', () => {
    const root = block({
      title: 'Caption',
      skin: { kind: 'plain', tone: 'paper' },
      layout: { kind: 'linear', axis: 'y' },
      children: [block({ title: 'First', skin: { kind: 'chip', tone: 'water' } })],
    });
    const layout = layoutDoc(doc(root));
    const entry = layout.entries.find((item) => item.block.id === root.id)!;
    const child = layout.entries.find((item) => item.block.id === root.children[0].id)!;
    // plain: padY 4 + caption row 18
    expect(child.rect.y).toBeGreaterThanOrEqual(entry.rect.y + 22);
  });
});
