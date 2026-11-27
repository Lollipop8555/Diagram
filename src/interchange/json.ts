import type { BlockNode, DiagramDoc, LayoutProps, SkinKind, SkinProps, TemplateId, Tone } from '../model/types';
import { SKIN_KINDS, TEMPLATE_IDS, TONES } from '../model/types';

export function toJson(doc: DiagramDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

const ROLE_TO_SKIN: Record<string, SkinKind> = {
  boundary: 'boundary',
  band: 'band',
  container: 'container',
  module: 'chip',
  chip: 'chip',
  segment: 'segment',
  note: 'note',
  plain: 'plain',
};

function normalizeBlock(raw: any): BlockNode {
  const children = Array.isArray(raw?.children) ? raw.children.map(normalizeBlock) : [];
  const kind = raw?.layout?.kind;
  const layout: LayoutProps = {
    ...(raw?.layout ?? {}),
    kind: ['linear', 'grid', 'flow', 'stack', 'spacer', 'leaf'].includes(kind)
      ? kind
      : children.length
        ? 'linear'
        : 'leaf',
  };
  const skinKind: SkinKind =
    raw?.skin?.kind && SKIN_KINDS.includes(raw.skin.kind)
      ? raw.skin.kind
      : ROLE_TO_SKIN[raw?.role] ?? (children.length ? 'container' : 'chip');
  const skin: SkinProps = {
    kind: skinKind,
    tone: (raw?.skin?.tone && TONES.includes(raw.skin.tone) ? raw.skin.tone : 'water') as Tone,
  };
  if (['solid', 'dashed', 'none'].includes(raw?.skin?.outline)) skin.outline = raw.skin.outline;
  if (typeof raw?.skin?.radius === 'number') skin.radius = raw.skin.radius;
  if (['compact', 'normal'].includes(raw?.skin?.density)) skin.density = raw.skin.density;
  if (['top', 'left', 'none'].includes(raw?.skin?.titlePos)) skin.titlePos = raw.skin.titlePos;
  if (raw?.skin?.verticalTitle) skin.verticalTitle = true;
  return {
    id: String(raw?.id ?? 'b?'),
    title: raw?.title ?? '',
    subtitle: raw?.subtitle,
    badge: raw?.badge,
    layout,
    skin,
    collapsed: Boolean(raw?.collapsed),
    children: layout.kind === 'leaf' || layout.kind === 'spacer' ? [] : children,
  };
}

/** Best-effort upgrade of older documents (version < 3, role based). */
export function migrateDoc(raw: any): DiagramDoc {
  const template: TemplateId = TEMPLATE_IDS.includes(raw?.meta?.template) ? raw.meta.template : 'custom';
  const root = normalizeBlock(raw?.root);
  const ids = new Set<string>();
  const walk = (b: BlockNode) => {
    ids.add(b.id);
    b.children.forEach(walk);
  };
  walk(root);
  const relations = Array.isArray(raw?.relations)
    ? raw.relations
        .filter((r: any) => ids.has(r?.from) && ids.has(r?.to))
        .map((r: any, i: number) => ({
          id: String(r.id ?? `r${i + 1}`),
          from: String(r.from),
          to: String(r.to),
          kind: ['call', 'dep', 'data', 'async', 'run'].includes(r.kind) ? r.kind : 'dep',
          label: r.label,
          dashed: Boolean(r.dashed),
        }))
    : [];
  const now = new Date().toISOString();
  return {
    version: 3,
    meta: {
      title: raw?.meta?.title ?? root.title ?? 'Untitled',
      description: raw?.meta?.description,
      template,
      direction: raw?.meta?.direction === 'top-down' ? 'top-down' : 'bottom-up',
      createdAt: raw?.meta?.createdAt ?? now,
      updatedAt: now,
    },
    root,
    relations,
  };
}

export function fromJson(text: string): DiagramDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSON 解析失败：文件格式不正确');
  }
  const doc = migrateDoc(raw);
  if (!doc.root) throw new Error('缺少 root 字段');
  return doc;
}
