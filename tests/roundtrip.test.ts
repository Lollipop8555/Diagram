import { describe, expect, it } from 'vitest';
import type { BlockNode, DiagramDoc } from '../src/model/types';
import { TEMPLATE_IDS } from '../src/model/types';
import { getTemplate } from '../src/model/templates';
import { validateDoc } from '../src/model/validate';
import { toPop } from '../src/interchange/toPop';
import { tryParsePop } from '../src/interchange/fromPop';
import { fromJson, toJson } from '../src/interchange/json';
import { layoutDoc } from '../src/layout/dispatch';
import { buildEdges } from '../src/layout/edges';
import { docToSvg } from '../src/export/toSvg';
import { checkMove, findBlock, findParent, moveBlock } from '../src/model/tree';

/** Drops `undefined` fields so `{a: undefined}` and `{}` compare equal. */
function strip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Canonical block shape: implicit falsy flags become explicit, optional text drops empties. */
function normalizeBlock(node: BlockNode): unknown {
  return {
    id: node.id,
    title: node.title,
    subtitle: node.subtitle || undefined,
    badge: node.badge || undefined,
    skin: strip(node.skin),
    layout: strip(
      node.layout.kind === 'grid'
        ? { ...node.layout, columnMode: node.layout.columnMode ?? 'equal' }
        : node.layout,
    ),
    collapsed: Boolean(node.collapsed),
    children: node.children.map(normalizeBlock),
  };
}

/** Everything that must survive a serialization round trip (meta timestamps excluded). */
function structural(doc: DiagramDoc) {
  return strip({
    title: doc.meta.title,
    description: doc.meta.description || undefined,
    template: doc.meta.template,
    direction: doc.meta.direction,
    root: normalizeBlock(doc.root),
    relations: doc.relations.map((rel) => ({
      ...rel,
      label: rel.label || undefined,
      dashed: Boolean(rel.dashed),
    })),
  });
}

describe('templates', () => {
  it.each(TEMPLATE_IDS)('%s demo is structurally valid', (id) => {
    const doc = getTemplate(id).createDemo('zh');
    expect(validateDoc(doc)).toEqual([]);
  });

  it.each(TEMPLATE_IDS)('%s demo lays out and exports SVG', (id) => {
    const doc = getTemplate(id).createDemo('zh');
    const layout = layoutDoc(doc);
    expect(layout.entries.length).toBeGreaterThan(1);
    expect(layout.bounds.w).toBeGreaterThan(0);
    expect(layout.bounds.h).toBeGreaterThan(0);
    const svg = docToSvg(doc, layout, buildEdges(doc, layout.rects));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });
});

describe('pop_diagram round trip', () => {
  it.each(TEMPLATE_IDS)('%s: toPop → parse keeps the tree', (id) => {
    const doc = getTemplate(id).createDemo('en');
    const text = toPop(doc);
    const parsed = tryParsePop(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(structural(parsed.doc)).toEqual(structural(doc));
  });

  it.each(TEMPLATE_IDS)('%s: toPop is idempotent after parsing', (id) => {
    const doc = getTemplate(id).createDemo('zh');
    const text = toPop(doc);
    const parsed = tryParsePop(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(toPop(parsed.doc)).toBe(text);
  });

  it('reports a line number for broken input', () => {
    const result = tryParsePop('@pop 1\nroot "Root" leaf @water\n  broken {\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.line).toBeGreaterThan(0);
  });
});

describe('json round trip', () => {
  it.each(TEMPLATE_IDS)('%s survives toJson → fromJson', (id) => {
    const doc = getTemplate(id).createDemo('zh');
    const parsed = fromJson(toJson(doc));
    expect(structural(parsed)).toEqual(structural(doc));
  });

  it('migrates legacy documents without layout fields', () => {
    const legacy = {
      meta: { title: 'Legacy', template: 'layered' },
      root: {
        id: 'b1',
        title: 'Root',
        role: 'band',
        children: [{ id: 'b2', title: 'Leaf', role: 'module' }],
      },
    };
    const doc = fromJson(JSON.stringify(legacy));
    expect(doc.version).toBe(3);
    expect(doc.root.layout.kind).toBe('linear');
    expect(doc.root.children[0].layout.kind).toBe('leaf');
    expect(validateDoc(doc).filter((issue) => issue.code === 'CHILDREN')).toEqual([]);
  });
});

describe('tree moves', () => {
  const doc = getTemplate('custom').createDemo('zh');

  it('rejects moving a block into its own subtree', () => {
    const parent = doc.root.children[0];
    expect(parent.children.length).toBeGreaterThan(0);
    const child = parent.children[0];
    expect(checkMove(doc, parent.id, { parentId: child.id, index: 0 })).toBe('CYCLE');
  });

  it('moves a block to a new parent without losing it', () => {
    const moving = doc.root.children[0];
    const target = doc.root.children[1];
    const result = moveBlock(doc, moving.id, { parentId: target.id, index: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findParent(result.doc.root, moving.id)?.id).toBe(target.id);
    expect(findBlock(result.doc.root, moving.children[0]?.id ?? '')).not.toBeNull();
  });

  it('keeps the root immovable', () => {
    const child = doc.root.children[0];
    expect(checkMove(doc, doc.root.id, { parentId: child.id, index: 0 })).toBe('CYCLE');
  });
});

describe('grid column weights', () => {
  it('survive the pop_diagram text round trip', () => {
    const base = getTemplate('custom').createDemo('zh');
    const withWeights: DiagramDoc = {
      ...base,
      root: {
        ...base.root,
        layout: { kind: 'grid', columns: 3, columnWeights: [1, 2, 1] },
      },
    };
    const text = toPop(withWeights);
    expect(text).toContain('grid(3,equal,1:2:1)');
    const parsed = tryParsePop(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.doc.root.layout.columnWeights).toEqual([1, 2, 1]);
  });
});
