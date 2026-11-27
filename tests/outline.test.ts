import { describe, expect, it } from 'vitest';
import type { DiagramDoc } from '../src/model/types';
import { collapseAllBlocks, filterOutline } from '../src/model/tree';

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
    root: {
      id: 'root',
      title: 'Root',
      layout: { kind: 'linear', axis: 'y' },
      skin: { kind: 'plain', tone: 'paper' },
      children: [
        {
          id: 'a',
          title: 'Auth 认证',
          layout: { kind: 'linear' },
          skin: { kind: 'container', tone: 'water' },
          children: [
            {
              id: 'a1',
              title: 'Token 签发',
              layout: { kind: 'leaf' },
              skin: { kind: 'chip', tone: 'mint' },
              children: [],
            },
          ],
        },
        {
          id: 'b',
          title: '支付',
          subtitle: 'Payments',
          badge: 'P0',
          layout: { kind: 'leaf' },
          skin: { kind: 'chip', tone: 'rose' },
          children: [],
        },
      ],
    },
    relations: [],
  };
}

describe('collapseAllBlocks', () => {
  it('collapses every container and leaves leaves untouched', () => {
    const doc = fixture();
    const next = collapseAllBlocks(doc, true);
    expect(next.root.collapsed).toBe(true);
    expect(next.root.children[0].collapsed).toBe(true);
    expect('collapsed' in next.root.children[0].children[0]).toBe(false);
    expect(next.meta.updatedAt).not.toBe(doc.meta.updatedAt);
  });

  it('expands everything back', () => {
    const collapsed = collapseAllBlocks(fixture(), true);
    const expanded = collapseAllBlocks(collapsed, false);
    expect(expanded.root.collapsed).toBe(false);
    expect(expanded.root.children[0].collapsed).toBe(false);
  });

  it('does not mutate the input document', () => {
    const doc = fixture();
    collapseAllBlocks(doc, true);
    expect(doc.root.collapsed).toBeUndefined();
    expect(doc.root.children[0].collapsed).toBeUndefined();
  });
});

describe('filterOutline', () => {
  it('returns empty sets for a blank query so callers skip filtering', () => {
    const result = filterOutline(fixture().root, '   ');
    expect(result.visible.size).toBe(0);
    expect(result.hits.size).toBe(0);
  });

  it('matches a container title and shows its ancestors only', () => {
    const result = filterOutline(fixture().root, 'auth');
    expect([...result.hits]).toEqual(['a']);
    expect([...result.visible].sort()).toEqual(['a', 'root']);
  });

  it('keeps the whole ancestor chain for a deep hit', () => {
    const result = filterOutline(fixture().root, 'token');
    expect([...result.hits]).toEqual(['a1']);
    expect([...result.visible].sort()).toEqual(['a', 'a1', 'root']);
  });

  it('searches subtitle and badge case-insensitively', () => {
    expect([...filterOutline(fixture().root, 'payments').hits]).toEqual(['b']);
    expect([...filterOutline(fixture().root, 'p0').hits]).toEqual(['b']);
  });

  it('hides everything when nothing matches', () => {
    const result = filterOutline(fixture().root, 'zzz');
    expect(result.visible.size).toBe(0);
    expect(result.hits.size).toBe(0);
  });
});
