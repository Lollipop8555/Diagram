import type {
  BlockNode,
  DiagramDoc,
  LayoutKind,
  LayoutProps,
  RelationKind,
  SkinKind,
  SkinProps,
  TemplateId,
  Tone,
} from '../model/types';
import { RELATION_KINDS, SKIN_KINDS, TEMPLATE_IDS, TONES } from '../model/types';

export class PopError extends Error {
  line: number;
  col: number;
  constructor(message: string, line: number, col = 1) {
    super(`第 ${line} 行：${message}`);
    this.name = 'PopError';
    this.line = line;
    this.col = col;
  }
}

interface Token {
  value: string;
  quoted: boolean;
}

function lex(line: string, lineNo: number): { tokens: Token[]; open: boolean } {
  const tokens: Token[] = [];
  let i = 0;
  let open = false;
  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }
    if (ch === '{') {
      open = true;
      i += 1;
      continue;
    }
    if (ch === '}') {
      i += 1;
      continue;
    }
    let buf = '';
    let quoted = false;
    while (i < line.length && line[i] !== ' ' && line[i] !== '\t') {
      const c = line[i];
      if (c === '"') {
        quoted = true;
        i += 1;
        let closed = false;
        while (i < line.length) {
          const d = line[i];
          if (d === '\\') {
            const n = line[i + 1];
            buf += n === 'n' ? '\n' : n === 't' ? '\t' : n ?? '';
            i += 2;
            continue;
          }
          if (d === '"') {
            closed = true;
            i += 1;
            break;
          }
          buf += d;
          i += 1;
        }
        if (!closed) throw new PopError('字符串缺少结束引号', lineNo, i + 1);
        continue;
      }
      if (c === '{') {
        open = true;
        i += 1;
        continue;
      }
      buf += c;
      i += 1;
    }
    if (buf) tokens.push({ value: buf, quoted });
  }
  return { tokens, open };
}

function stripComment(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length - 1; i += 1) {
    const ch = line[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

const LAYOUT_RE = /^(linear\([xy]\)|grid\(\d+(?:,(?:auto|equal))?(?:,[\d:]+)?\)|flow|stack|leaf|spacer)$/;

function parseLayout(token: string, lineNo: number): LayoutProps | null {
  if (!LAYOUT_RE.test(token)) return null;
  if (token.startsWith('linear')) {
    const axis = token.includes('(x)') ? 'x' : 'y';
    return { kind: 'linear', axis };
  }
  if (token.startsWith('grid')) {
    const inner = token.slice(5, -1).split(',');
    const columns = Number(inner[0]);
    if (!Number.isFinite(columns) || columns < 1) throw new PopError('grid 列数非法', lineNo);
    const mode = inner[1] === 'auto' ? 'auto' : 'equal';
    const rawWeights = inner.find((token) => token.includes(':'));
    const columnWeights = rawWeights
      ? rawWeights.split(':').map(Number).filter((value) => Number.isFinite(value) && value >= 1)
      : [];
    return {
      kind: 'grid',
      columns,
      columnMode: mode,
      ...(columnWeights.length ? { columnWeights } : {}),
    };
  }
  return { kind: token as LayoutKind };
}

function applyAttr(node: { layout: LayoutProps; skin: SkinProps; subtitle?: string; badge?: string; collapsed?: boolean }, key: string, value: string, quoted: boolean, lineNo: number): boolean {
  if (quoted || ['sub', 'badge'].includes(key)) {
    if (key === 'sub') node.subtitle = value;
    else if (key === 'badge') node.badge = value;
    else throw new PopError(`未知文本属性 ${key}`, lineNo);
    return true;
  }
  if (key === 'outline') {
    if (!['solid', 'dashed', 'none'].includes(value)) throw new PopError('outline 非法', lineNo);
    node.skin.outline = value as SkinProps['outline'];
    return true;
  }
  const num = Number(value);
  switch (key) {
    case 'w':
      if (!Number.isFinite(num) || num < 0) throw new PopError('w 必须是非负数字', lineNo);
      node.layout.weight = num;
      return true;
    case 'gap':
      node.layout.gap = num;
      return true;
    case 'pad':
      node.layout.padding = num;
      return true;
    case 'span':
      node.layout.span = num;
      return true;
    case 'linegap':
      node.layout.lineGap = num;
      return true;
    case 'maxw':
      node.layout.maxWidth = num;
      return true;
    case 'align':
      if (!['start', 'center', 'end', 'stretch'].includes(value)) throw new PopError('align 非法', lineNo);
      node.layout.align = value as LayoutProps['align'];
      return true;
    case 'justify':
      if (!['start', 'center', 'end', 'between'].includes(value)) throw new PopError('justify 非法', lineNo);
      node.layout.justify = value as LayoutProps['justify'];
      return true;
    case 'anchor':
      node.layout.anchor = value as LayoutProps['anchor'];
      return true;
    case 'column':
      node.layout.columnMode = value === 'auto' ? 'auto' : 'equal';
      return true;
    case 'titlepos':
      if (!['top', 'left', 'none'].includes(value)) throw new PopError('titlepos 非法', lineNo);
      node.skin.titlePos = value as SkinProps['titlePos'];
      return true;
    case 'radius':
      node.skin.radius = num;
      return true;
    case 'density':
      if (!['compact', 'normal'].includes(value)) throw new PopError('density 非法', lineNo);
      node.skin.density = value as SkinProps['density'];
      return true;
    default:
      return false;
  }
}

export function parsePop(text: string): DiagramDoc {
  const lines = text.split(/\r?\n/);
  const stack: BlockNode[] = [];
  const roots: BlockNode[] = [];
  const relations: DiagramDoc['relations'] = [];
  const ids = new Set<string>();

  let title = '';
  let template: TemplateId = 'custom';
  let direction: 'bottom-up' | 'top-down' = 'bottom-up';
  let createdAt = new Date().toISOString();
  let description: string | undefined;
  let size: { w: number; h: number } | undefined;
  let sawHeader = false;
  let relSeq = 0;

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = stripComment(raw).trim();
    if (!line) return;

    if (line.startsWith('@')) {
      const space = line.indexOf(' ');
      const key = space < 0 ? line.slice(1) : line.slice(1, space);
      const rest = space < 0 ? '' : line.slice(space + 1).trim();
      const unquote = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);
      switch (key) {
        case 'pop': {
          sawHeader = true;
          const version = Number(rest || '1');
          if (version > 1) throw new PopError(`不支持的协议版本 ${rest}`, lineNo);
          break;
        }
        case 'title':
          title = unquote(rest);
          break;
        case 'template':
          if (!TEMPLATE_IDS.includes(rest as TemplateId)) throw new PopError(`未知模板 ${rest}`, lineNo);
          template = rest as TemplateId;
          break;
        case 'direction':
          direction = rest === 'top-down' ? 'top-down' : 'bottom-up';
          break;
        case 'created':
          createdAt = `${rest}T00:00:00.000Z`;
          break;
        case 'desc':
          description = unquote(rest);
          break;
        case 'size': {
          const [w, h] = rest.split(/\s+/).map(Number);
          if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) size = { w, h };
          break;
        }
        default:
          break;
      }
      return;
    }

    if (/^[A-Za-z_][\w-]*\s*->/.test(line)) {
      const { tokens } = lex(line, lineNo);
      const from = tokens[0]?.value;
      if (!from || tokens[1]?.value !== '->') throw new PopError('关系格式应为 a -> b', lineNo);
      const to = tokens[2]?.value;
      if (!to) throw new PopError('关系缺少目标块', lineNo);
      let kind: RelationKind = 'dep';
      let label: string | undefined;
      let dashed = false;
      tokens.slice(3).forEach((t) => {
        if (RELATION_KINDS.includes(t.value as RelationKind)) kind = t.value as RelationKind;
        else if (t.quoted) label = t.value;
        else if (t.value === 'dashed') dashed = true;
      });
      relSeq += 1;
      relations.push({ id: `r${relSeq}`, from, to, kind, label, dashed });
      return;
    }

    if (line === '}') {
      if (!stack.length) throw new PopError('多余的 }', lineNo);
      stack.pop();
      return;
    }

    const { tokens, open } = lex(line, lineNo);
    if (!tokens.length) {
      if (open) throw new PopError('缺少块定义', lineNo);
      return;
    }
    const id = tokens[0].value;
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id)) throw new PopError(`非法的块 id "${id}"`, lineNo);
    if (ids.has(id)) throw new PopError(`重复的块 id "${id}"`, lineNo);
    ids.add(id);
    if (!tokens[1]?.quoted) throw new PopError('块标题必须使用双引号', lineNo);

    const layouts: LayoutProps[] = [];
    let skinKind: SkinKind | null = null;
    let tone: Tone | null = null;
    const node: BlockNode = {
      id,
      title: tokens[1].value,
      layout: { kind: 'leaf' },
      skin: { kind: 'chip', tone: 'water' },
      children: [],
    };

    tokens.slice(2).forEach((t) => {
      const layoutHit = parseLayout(t.value, lineNo);
      if (layoutHit) {
        layouts.push(layoutHit);
        return;
      }
      if (t.quoted) {
        const colon = t.value.indexOf(':');
        if (colon > 0 && applyAttr(node, t.value.slice(0, colon), t.value.slice(colon + 1), true, lineNo)) return;
        throw new PopError(`无法识别的带引号片段 "${t.value}"`, lineNo);
      }
      const colon = t.value.indexOf(':');
      if (colon > 0) {
        const key = t.value.slice(0, colon).toLowerCase();
        const val = t.value.slice(colon + 1);
        if (applyAttr(node, key, val, false, lineNo)) return;
        throw new PopError(`未知属性 "${t.value}"`, lineNo);
      }
      if (SKIN_KINDS.includes(t.value as SkinKind)) {
        skinKind = t.value as SkinKind;
        return;
      }
      if (t.value.startsWith('@')) {
        const candidate = t.value.slice(1) as Tone;
        if (!TONES.includes(candidate)) throw new PopError(`未知色调 "${t.value}"`, lineNo);
        tone = candidate;
        return;
      }
      if (t.value === 'dashed') {
        node.skin.outline = 'dashed';
        return;
      }
      if (t.value === 'vtitle') {
        node.skin.verticalTitle = true;
        return;
      }
      if (t.value === 'hidden') {
        node.collapsed = true;
        return;
      }
      if (t.value === 'dim') return;
      throw new PopError(`无法识别的标记 "${t.value}"`, lineNo);
    });

    const resolvedLayout: LayoutProps | null = layouts.length ? layouts[0] : null;
    if (open && !resolvedLayout) throw new PopError('容器块必须声明布局组件', lineNo);
    if (resolvedLayout) node.layout = { ...resolvedLayout, ...node.layout, kind: resolvedLayout.kind };
    if (skinKind) node.skin.kind = skinKind;
    else if (open) node.skin.kind = 'container';
    if (tone) node.skin.tone = tone;
    else node.skin.tone = open ? 'paper' : 'water';

    if (!stack.length) {
      if (roots.length) throw new PopError('只允许一个根块', lineNo);
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    if (open) stack.push(node);
  });

  if (!roots.length) throw new PopError('未找到任何块', 1);
  if (stack.length) throw new PopError('存在未闭合的 {', lines.length);

  if (!sawHeader) throw new PopError('缺少 @pop 头', 1);

  const root = roots[0];

  const byId = new Set<string>();
  const walk = (b: BlockNode) => {
    byId.add(b.id);
    b.children.forEach(walk);
  };
  walk(root);
  relations.forEach((rel) => {
    if (!byId.has(rel.from)) throw new PopError(`关系引用不存在的块 ${rel.from}`, 1);
    if (!byId.has(rel.to)) throw new PopError(`关系引用不存在的块 ${rel.to}`, 1);
  });

  return {
    version: 3,
    meta: {
      title: title || root.title || 'Untitled',
      description,
      template,
      direction,
      createdAt,
      updatedAt: new Date().toISOString(),
    },
    ...(size ? { size } : {}),
    root,
    relations,
  };
}

export function tryParsePop(text: string): { ok: true; doc: DiagramDoc } | { ok: false; error: { line: number; message: string } } {
  try {
    return { ok: true, doc: parsePop(text) };
  } catch (error) {
    if (error instanceof PopError) {
      return { ok: false, error: { line: error.line, message: error.message } };
    }
    return { ok: false, error: { line: 1, message: error instanceof Error ? error.message : '解析失败' } };
  }
}
