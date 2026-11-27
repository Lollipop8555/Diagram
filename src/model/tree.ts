import type { BlockNode, DiagramDoc, ID, LayoutKind, TemplateId } from './types';
import { MAX_CHILDREN, MAX_DEPTH, acceptsChild } from '../layout/registry';
import { getTemplate } from './templates';

export type ReasonCode =
  | 'CYCLE'
  | 'INCOMPATIBLE_LAYOUT'
  | 'TEMPLATE_DISALLOWED'
  | 'DEPTH_LIMIT'
  | 'CHILD_LIMIT'
  | 'NO_CHANGE'
  | 'NOT_FOUND';

export type MoveResult = { ok: true; doc: DiagramDoc } | { ok: false; reason: ReasonCode };

let idCounter = 0;
export function uid(prefix = 'b'): ID {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function findBlock(root: BlockNode, id: ID): BlockNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const hit = findBlock(child, id);
    if (hit) return hit;
  }
  return null;
}

export function findParent(root: BlockNode, id: ID): BlockNode | null {
  for (const child of root.children) {
    if (child.id === id) return root;
    const hit = findParent(child, id);
    if (hit) return hit;
  }
  return null;
}

export function indexIn(parent: BlockNode, id: ID): number {
  return parent.children.findIndex((c) => c.id === id);
}

export function isDescendant(maybeAncestor: BlockNode, id: ID): boolean {
  return maybeAncestor.children.some((c) => c.id === id || isDescendant(c, id));
}

export function depthOf(root: BlockNode, id: ID): number {
  const walk = (b: BlockNode, d: number): number => {
    if (b.id === id) return d;
    for (const c of b.children) {
      const hit = walk(c, d + 1);
      if (hit >= 0) return hit;
    }
    return -1;
  };
  return walk(root, 0);
}

export function subtreeHeight(block: BlockNode): number {
  if (!block.children.length) return 1;
  return 1 + Math.max(...block.children.map(subtreeHeight));
}

export function countBlocks(root: BlockNode): number {
  return 1 + root.children.reduce((sum, c) => sum + countBlocks(c), 0);
}

/** Immutably replace a block (only the path to it is copied). */
export function updateBlock(
  root: BlockNode,
  id: ID,
  fn: (block: BlockNode) => BlockNode,
): BlockNode {
  if (root.id === id) return fn(root);
  let changed = false;
  const children = root.children.map((child) => {
    const next = updateBlock(child, id, fn);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

/** Immutably remove a block and return the removed subtree. */
export function detach(root: BlockNode, id: ID): { root: BlockNode; removed: BlockNode | null } {
  let removed: BlockNode | null = null;
  const walk = (node: BlockNode): BlockNode => {
    const idx = node.children.findIndex((c) => c.id === id);
    if (idx >= 0) {
      removed = node.children[idx];
      const children = node.children.filter((c) => c.id !== id);
      return { ...node, children };
    }
    let changed = false;
    const children = node.children.map((child) => {
      const next = walk(child);
      if (next !== child) changed = true;
      return next;
    });
    return changed ? { ...node, children } : node;
  };
  const nextRoot = walk(root);
  return { root: nextRoot, removed };
}

export function attach(root: BlockNode, parentId: ID, block: BlockNode, index: number): BlockNode {
  return updateBlock(root, parentId, (parent) => {
    const children = [...parent.children];
    const at = Math.max(0, Math.min(children.length, index));
    children.splice(at, 0, block);
    return { ...parent, children };
  });
}

export function cleanRelations(doc: DiagramDoc, removedIds: Set<ID>): DiagramDoc {
  return {
    ...doc,
    relations: doc.relations.filter((r) => !removedIds.has(r.from) && !removedIds.has(r.to)),
  };
}

export function collectIds(block: BlockNode, acc = new Set<ID>()): Set<ID> {
  acc.add(block.id);
  block.children.forEach((c) => collectIds(c, acc));
  return acc;
}

export function nextBlockId(doc: DiagramDoc): ID {
  let max = 0;
  const walk = (b: BlockNode) => {
    const m = /^b(\d+)$/.exec(b.id);
    if (m) max = Math.max(max, Number(m[1]));
    b.children.forEach(walk);
  };
  walk(doc.root);
  return `b${max + 1}`;
}

export interface MoveTarget {
  parentId: ID;
  index: number;
}

export function checkMove(
  doc: DiagramDoc,
  dragId: ID,
  target: MoveTarget,
  templateId?: TemplateId,
): ReasonCode | null {
  const drag = findBlock(doc.root, dragId);
  const parent = findBlock(doc.root, target.parentId);
  if (!drag || !parent) return 'NOT_FOUND';
  if (drag.id === parent.id) return 'NO_CHANGE';
  if (isDescendant(drag, parent.id)) return 'CYCLE';
  if (parent.layout.kind === 'leaf' || parent.layout.kind === 'spacer') return 'INCOMPATIBLE_LAYOUT';

  const template = getTemplate(templateId ?? doc.meta.template);
  if (!template.allowedLayouts.includes(parent.layout.kind)) return 'TEMPLATE_DISALLOWED';
  if (!acceptsChild(parent.layout.kind, drag.layout.kind)) return 'INCOMPATIBLE_LAYOUT';

  const oldParent = findParent(doc.root, dragId);
  const oldIndex = oldParent ? indexIn(oldParent, dragId) : -1;
  if (oldParent?.id === parent.id) {
    const adjusted = oldIndex >= 0 && oldIndex < target.index ? target.index - 1 : target.index;
    if (adjusted === oldIndex) return 'NO_CHANGE';
  }

  const parentDepth = depthOf(doc.root, parent.id);
  const newDepth = parentDepth + subtreeHeight(drag);
  if (newDepth > Math.min(MAX_DEPTH, template.maxDepth)) return 'DEPTH_LIMIT';
  if (parent.children.length >= MAX_CHILDREN) return 'CHILD_LIMIT';
  return null;
}

export function moveBlock(
  doc: DiagramDoc,
  dragId: ID,
  target: MoveTarget,
  templateId?: TemplateId,
): MoveResult {
  const reason = checkMove(doc, dragId, target, templateId);
  if (reason === 'NO_CHANGE') return { ok: true, doc };
  if (reason) return { ok: false, reason };

  const { root, removed } = detach(doc.root, dragId);
  if (!removed) return { ok: false, reason: 'NOT_FOUND' };

  const oldParent = findParent(doc.root, dragId);
  let index = target.index;
  if (oldParent && oldParent.id === target.parentId) {
    const oldIndex = indexIn(oldParent, dragId);
    if (oldIndex >= 0 && oldIndex < index) index -= 1;
  }
  const nextRoot = attach(root, target.parentId, removed, index);
  return {
    ok: true,
    doc: { ...doc, root: nextRoot, meta: { ...doc.meta, updatedAt: new Date().toISOString() } },
  };
}

export function insertChild(
  doc: DiagramDoc,
  parentId: ID,
  block: BlockNode,
  index?: number,
): DiagramDoc {
  const parent = findBlock(doc.root, parentId);
  if (!parent) return doc;
  const at = index ?? parent.children.length;
  return {
    ...doc,
    root: attach(doc.root, parentId, block, at),
    meta: { ...doc.meta, updatedAt: new Date().toISOString() },
  };
}

export function removeSubtree(doc: DiagramDoc, id: ID): DiagramDoc {
  if (doc.root.id === id) return doc;
  const { root, removed } = detach(doc.root, id);
  if (!removed) return doc;
  const ids = collectIds(removed);
  return cleanRelations(
    { ...doc, root, meta: { ...doc.meta, updatedAt: new Date().toISOString() } },
    ids,
  );
}

export function cloneWithNewIds(block: BlockNode): BlockNode {
  return {
    ...block,
    id: nextCloneId(),
    layout: { ...block.layout },
    skin: { ...block.skin },
    children: block.children.map(cloneWithNewIds),
  };
}

let cloneSeq = 0;
function nextCloneId(): ID {
  cloneSeq += 1;
  return `c${Date.now().toString(36)}${cloneSeq.toString(36)}`;
}

export function duplicateSubtree(doc: DiagramDoc, id: ID): { doc: DiagramDoc; newId: ID | null } {
  if (doc.root.id === id) return { doc, newId: null };
  const block = findBlock(doc.root, id);
  const parent = findParent(doc.root, id);
  if (!block || !parent) return { doc, newId: null };
  const copy = cloneWithNewIds(block);
  const index = indexIn(parent, id) + 1;
  return {
    doc: {
      ...doc,
      root: attach(doc.root, parent.id, copy, index),
      meta: { ...doc.meta, updatedAt: new Date().toISOString() },
    },
    newId: copy.id,
  };
}

export function promoteBlock(doc: DiagramDoc, id: ID): DiagramDoc {
  const parent = findParent(doc.root, id);
  if (!parent || parent.id === doc.root.id) return doc;
  const grand = findParent(doc.root, parent.id);
  if (!grand) return doc;
  const index = indexIn(grand, parent.id) + 1;
  const block = findBlock(doc.root, id);
  if (!block) return doc;
  const { root, removed } = detach(doc.root, id);
  if (!removed) return doc;
  return {
    ...doc,
    root: attach(root, grand.id, removed, index),
    meta: { ...doc.meta, updatedAt: new Date().toISOString() },
  };
}

/**
 * Where a "demote" would land: the block becomes the last child of its previous
 * sibling. Returns null when there is no previous sibling (first child / root).
 */
export function demoteTarget(doc: DiagramDoc, id: ID): MoveTarget | null {
  const parent = findParent(doc.root, id);
  if (!parent) return null;
  const index = indexIn(parent, id);
  if (index <= 0) return null;
  const previous = parent.children[index - 1];
  return { parentId: previous.id, index: previous.children.length };
}

/** Move a block inside its previous sibling (`⌥→`). Incompatible moves are no-ops. */
export function demoteBlock(doc: DiagramDoc, id: ID): DiagramDoc {
  const target = demoteTarget(doc, id);
  if (!target) return doc;
  const result = moveBlock(doc, id, target, doc.meta.template);
  if (!result.ok) return doc;
  return {
    ...result.doc,
    // The new parent must be open, otherwise the move looks like a deletion.
    root: updateBlock(result.doc.root, target.parentId, (node) => ({ ...node, collapsed: false })),
  };
}

const blockWeight = (block: BlockNode) => Math.max(1, Math.round(block.layout.weight ?? 1));

/**
 * Trade weight between two adjacent siblings, keeping their sum and both values
 * at 1 or above. Used by the canvas splitter drag.
 */
export function pairWeights(doc: DiagramDoc, aId: ID, bId: ID, aWeight: number): DiagramDoc {
  const parent = findParent(doc.root, aId);
  if (!parent) return doc;
  const a = parent.children.find((child) => child.id === aId);
  const b = parent.children.find((child) => child.id === bId);
  if (!a || !b) return doc;

  const total = blockWeight(a) + blockWeight(b);
  const nextA = Math.min(total - 1, Math.max(1, Math.round(aWeight)));
  const nextB = total - nextA;
  if (nextA === blockWeight(a) && nextB === blockWeight(b)) return doc;

  return {
    ...doc,
    root: updateBlock(doc.root, parent.id, (node) => ({
      ...node,
      children: node.children.map((child) => {
        if (child.id === aId) return { ...child, layout: { ...child.layout, weight: nextA } };
        if (child.id === bId) return { ...child, layout: { ...child.layout, weight: nextB } };
        return child;
      }),
    })),
    meta: { ...doc.meta, updatedAt: new Date().toISOString() },
  };
}

export function shiftBlock(doc: DiagramDoc, id: ID, delta: -1 | 1): DiagramDoc {
  const parent = findParent(doc.root, id);
  if (!parent) return doc;
  const index = indexIn(parent, id);
  const target = index + delta;
  if (target < 0 || target >= parent.children.length) return doc;
  const children = [...parent.children];
  [children[index], children[target]] = [children[target], children[index]];
  return {
    ...doc,
    root: updateBlock(doc.root, parent.id, (p) => ({ ...p, children })),
    meta: { ...doc.meta, updatedAt: new Date().toISOString() },
  };
}

/** Collapse/expand every block that has children (used by the outline toolbar). */
function setCollapsedDeep(node: BlockNode, collapsed: boolean): BlockNode {
  if (!node.children.length) return node;
  return {
    ...node,
    collapsed,
    children: node.children.map((child) => setCollapsedDeep(child, collapsed)),
  };
}

export function collapseAllBlocks(doc: DiagramDoc, collapsed: boolean): DiagramDoc {
  return {
    ...doc,
    root: setCollapsedDeep(doc.root, collapsed),
    meta: { ...doc.meta, updatedAt: new Date().toISOString() },
  };
}

export interface OutlineFilter {
  /** Blocks matching the query plus every ancestor needed to reach them. */
  visible: Set<ID>;
  /** Blocks whose own title/subtitle/badge matched. */
  hits: Set<ID>;
}

function blockMatches(node: BlockNode, query: string): boolean {
  const hay = `${node.title ?? ''} ${node.subtitle ?? ''} ${node.badge ?? ''}`.toLowerCase();
  return hay.includes(query);
}

/**
 * Case-insensitive outline search. An empty query returns empty sets, which
 * callers treat as "no filtering" rather than "hide everything".
 */
export function filterOutline(root: BlockNode, query: string): OutlineFilter {
  const visible = new Set<ID>();
  const hits = new Set<ID>();
  const needle = query.trim().toLowerCase();
  if (!needle) return { visible, hits };

  const walk = (node: BlockNode): boolean => {
    const selfHit = blockMatches(node, needle);
    if (selfHit) hits.add(node.id);
    let descendantHit = false;
    for (const child of node.children) {
      if (walk(child)) descendantHit = true;
    }
    if (selfHit || descendantHit) {
      visible.add(node.id);
      return true;
    }
    return false;
  };

  walk(root);
  return { visible, hits };
}

export function setLayoutKind(doc: DiagramDoc, id: ID, kind: LayoutKind): DiagramDoc {
  return {
    ...doc,
    root: updateBlock(doc.root, id, (b) => ({
      ...b,
      layout: { ...b.layout, kind },
      children: kind === 'leaf' || kind === 'spacer' ? [] : b.children,
    })),
    relations:
      kind === 'leaf'
        ? doc.relations
        : doc.relations,
    meta: { ...doc.meta, updatedAt: new Date().toISOString() },
  };
}
