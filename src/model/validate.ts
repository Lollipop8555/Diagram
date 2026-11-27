import type { BlockNode, DiagramDoc, ID, LayoutKind, SkinKind, TemplateId } from './types';
import { MAX_CHILDREN, acceptsChild } from '../layout/registry';
import { getTemplate, templateAllowsLayout } from './templates';

export type IssueCode = 'TEMPLATE_LAYOUT' | 'INCOMPATIBLE' | 'DEPTH' | 'CHILDREN';

export interface Issue {
  blockId: ID;
  code: IssueCode;
  detail?: string;
}

export function validateDoc(doc: DiagramDoc): Issue[] {
  const template = getTemplate(doc.meta.template);
  const issues: Issue[] = [];
  const walk = (block: BlockNode) => {
    if (!templateAllowsLayout(template, block.layout.kind)) {
      issues.push({ blockId: block.id, code: 'TEMPLATE_LAYOUT', detail: block.layout.kind });
    }
    if (block.children.length > MAX_CHILDREN) {
      issues.push({ blockId: block.id, code: 'CHILDREN' });
    }
    for (const child of block.children) {
      if (!acceptsChild(block.layout.kind, child.layout.kind)) {
        issues.push({ blockId: child.id, code: 'INCOMPATIBLE', detail: `${block.layout.kind}/${child.layout.kind}` });
      }
      walk(child);
    }
  };
  walk(doc.root);
  return issues;
}

const LAYOUT_FALLBACK: Record<LayoutKind, LayoutKind> = {
  linear: 'linear',
  grid: 'linear',
  flow: 'linear',
  stack: 'linear',
  leaf: 'leaf',
  spacer: 'spacer',
};

const SKIN_FALLBACK: Record<SkinKind, SkinKind> = {
  band: 'container',
  boundary: 'container',
  container: 'container',
  chip: 'chip',
  segment: 'container',
  note: 'note',
  plain: 'plain',
};

export interface TemplateChange {
  blockId: ID;
  from: string;
  to: string;
}

export function applyTemplate(
  doc: DiagramDoc,
  templateId: TemplateId,
): { doc: DiagramDoc; changes: TemplateChange[] } {
  const template = getTemplate(templateId);
  const changes: TemplateChange[] = [];

  const visit = (block: BlockNode): BlockNode => {
    let layout = block.layout;
    let skin = block.skin;

    if (!templateAllowsLayout(template, layout.kind)) {
      const nextKind = LAYOUT_FALLBACK[layout.kind];
      changes.push({ blockId: block.id, from: layout.kind, to: nextKind });
      layout = { ...layout, kind: nextKind };
    }
    if (!template.allowedSkins.includes(skin.kind)) {
      const nextSkin = SKIN_FALLBACK[skin.kind];
      changes.push({ blockId: block.id, from: skin.kind, to: nextSkin });
      skin = { ...skin, kind: nextSkin };
    }

    const children = block.children.map(visit);
    if (layout.kind === 'leaf' || layout.kind === 'spacer') {
      return { ...block, layout, skin, children: [] };
    }
    return { ...block, layout, skin, children };
  };

  const root = visit(doc.root);
  return {
    doc: {
      ...doc,
      meta: { ...doc.meta, template: templateId, updatedAt: new Date().toISOString() },
      root,
      relations: doc.relations,
    },
    changes,
  };
}
