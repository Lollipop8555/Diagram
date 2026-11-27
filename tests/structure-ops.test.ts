import { describe, expect, it } from 'vitest';
import type { BlockNode, DiagramDoc } from '../src/model/types';
import {
  demoteBlock,
  demoteTarget,
  findBlock,
  findParent,
  pairWeights,
} from '../src/model/tree';

function linear(id: string, children: BlockNode[] = []): BlockNode {
  return {
    id,
    title: id,
    layout: { kind: 'linear', axis: 'y' },
    skin: { kind: 'plain', tone: 'paper' },
    children,
  };
}

function leaf(id: string): BlockNode {
  return { id, title: id, layout: { kind: 'leaf' }, skin: { kind: 'chip', tone: 'mint' }, children: [] };
}

function fixture(): DiagramDoc {
  return {
    version: 3,
    meta: {
      title: 'T',
      template: 'custom',
      direction: 'top-down',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    root: linear('root', [linear('a', [leaf('a1')]), linear('b'), leaf('c')]),
    relations: [],
  };
}

describe('demoteTarget', () => {
  it('lands at the end of the previous sibling', () => {
    const doc = fixture();
    expect(demoteTarget(doc, 'b')).toEqual({ parentId: 'a', index: 1 });
  });

  it('refuses the first child and the root', () => {
    const doc = fixture();
    expect(demoteTarget(doc, 'a')).toBeNull();
    expect(demoteTarget(doc, 'root')).toBeNull();
    expect(demoteTarget(doc, 'missing')).toBeNull();
  });
});

describe('demoteBlock', () => {
  it('moves the block under its previous sibling and opens it', () => {
    const doc = fixture();
    const collapsed = {
      ...doc,
      root: {
        ...doc.root,
        children: doc.root.children.map((child) =>
          child.id === 'a' ? { ...child, collapsed: true } : child,
        ),
      },
    };
    const next = demoteBlock(collapsed, 'b');
    expect(findParent(next.root, 'b')?.id).toBe('a');
    expect(findBlock(next.root, 'a')?.collapsed).toBe(false);
    expect(findBlock(next.root, 'a')?.children.map((child) => child.id)).toEqual(['a1', 'b']);
  });

  it('is a no-op when the previous sibling cannot take children', () => {
    const base = fixture();
    const doc = { ...base, root: linear('root', [leaf('c'), linear('d')]) };
    expect(demoteBlock(doc, 'd')).toBe(doc);
  });

  it('is a no-op for the first child and never mutates the input', () => {
    const doc = fixture();
    expect(demoteBlock(doc, 'a')).toBe(doc);
    expect(doc.root.children[1].children).toHaveLength(0);
  });
});

describe('pairWeights', () => {
  function weighted(): DiagramDoc {
    const doc = fixture();
    return {
      ...doc,
      root: {
        ...doc.root,
        children: doc.root.children.map((child) =>
          child.id === 'a'
            ? { ...child, layout: { ...child.layout, weight: 1 } }
            : child.id === 'b'
              ? { ...child, layout: { ...child.layout, weight: 3 } }
              : child,
        ),
      },
    };
  }

  it('trades weight while keeping the sum and a 1 minimum', () => {
    const doc = weighted();
    const next = pairWeights(doc, 'a', 'b', 3);
    expect(findBlock(next.root, 'a')?.layout.weight).toBe(3);
    expect(findBlock(next.root, 'b')?.layout.weight).toBe(1);
    expect(next.meta.updatedAt).not.toBe(doc.meta.updatedAt);
  });

  it('clamps out-of-range input and ignores non-pairs', () => {
    const doc = weighted();
    expect(findBlock(pairWeights(doc, 'a', 'b', 99).root, 'a')?.layout.weight).toBe(3);
    expect(findBlock(pairWeights(doc, 'a', 'b', -5).root, 'a')?.layout.weight).toBe(1);
    expect(pairWeights(doc, 'a', 'c', 2)).toBe(doc);
    expect(pairWeights(doc, 'a', 'a1', 2)).toBe(doc);
  });

  it('returns the same document when nothing changes', () => {
    const doc = weighted();
    expect(pairWeights(doc, 'a', 'b', 1)).toBe(doc);
  });
});
