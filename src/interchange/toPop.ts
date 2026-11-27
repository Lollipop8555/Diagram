import type { BlockNode, DiagramDoc, LayoutProps } from '../model/types';
import { SKIN_KINDS } from '../model/types';

function quote(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

function layoutExpr(layout: LayoutProps): string {
  switch (layout.kind) {
    case 'linear':
      return `linear(${layout.axis ?? 'y'})`;
    case 'grid': {
      const parts = [String(layout.columns ?? 1)];
      if (layout.columnMode === 'auto' || layout.columnWeights?.length) {
        parts.push(layout.columnMode === 'auto' ? 'auto' : 'equal');
      }
      if (layout.columnWeights?.length) parts.push(layout.columnWeights.join(':'));
      return `grid(${parts.join(',')})`;
    }
    default:
      return layout.kind;
  }
}

function attrsOf(block: BlockNode): string[] {
  const l = block.layout;
  const out: string[] = [];
  if (l.weight !== undefined) out.push(`w:${l.weight}`);
  if (l.gap !== undefined) out.push(`gap:${l.gap}`);
  if (l.padding !== undefined) out.push(`pad:${l.padding}`);
  if (l.align !== undefined) out.push(`align:${l.align}`);
  if (l.justify !== undefined) out.push(`justify:${l.justify}`);
  if (l.anchor !== undefined) out.push(`anchor:${l.anchor}`);
  if (l.span !== undefined) out.push(`span:${l.span}`);
  if (l.lineGap !== undefined) out.push(`linegap:${l.lineGap}`);
  if (l.maxWidth !== undefined) out.push(`maxw:${l.maxWidth}`);
  if (block.skin.outline !== undefined) out.push(`outline:${block.skin.outline}`);
  if (block.skin.titlePos !== undefined) out.push(`titlepos:${block.skin.titlePos}`);
  if (block.skin.radius !== undefined) out.push(`radius:${block.skin.radius}`);
  if (block.skin.density !== undefined) out.push(`density:${block.skin.density}`);
  if (block.collapsed) out.push('hidden');
  if (block.skin.verticalTitle) out.push('vtitle');
  if (block.subtitle) out.push(`sub:${quote(block.subtitle)}`);
  if (block.badge) out.push(`badge:${quote(block.badge)}`);
  return out;
}

function blockHead(block: BlockNode): string {
  const parts: string[] = [block.id, quote(block.title ?? '')];
  const isContainer = block.children.length > 0;
  if (isContainer) parts.push(layoutExpr(block.layout));
  const skinToken = block.skin.kind;
  if (SKIN_KINDS.includes(skinToken)) parts.push(skinToken);
  parts.push(`@${block.skin.tone}`);
  parts.push(...attrsOf(block));
  return parts.join(' ');
}

function walk(block: BlockNode, depth: number, lines: string[]): void {
  const indent = '  '.repeat(depth);
  if (block.children.length === 0) {
    lines.push(`${indent}${blockHead(block)}`);
    return;
  }
  lines.push(`${indent}${blockHead(block)} {`);
  block.children.forEach((child) => walk(child, depth + 1, lines));
  lines.push(`${indent}}`);
}

export function toPop(doc: DiagramDoc): string {
  const lines: string[] = [
    '@pop 1',
    `@title ${quote(doc.meta.title)}`,
    `@template ${doc.meta.template}`,
    `@direction ${doc.meta.direction}`,
    `@created ${doc.meta.createdAt.slice(0, 10)}`,
  ];
  if (doc.size) lines.push(`@size ${Math.round(doc.size.w)} ${Math.round(doc.size.h)}`);
  if (doc.meta.description) lines.push(`@desc ${quote(doc.meta.description)}`);
  lines.push('');
  walk(doc.root, 0, lines);
  if (doc.relations.length) {
    lines.push('');
    doc.relations.forEach((rel) => {
      const parts = [rel.from, '->', rel.to, rel.kind];
      if (rel.label) parts.push(quote(rel.label));
      if (rel.dashed) parts.push('dashed');
      lines.push(parts.join(' '));
    });
  }
  return `${lines.join('\n')}\n`;
}
