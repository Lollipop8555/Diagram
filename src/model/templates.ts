import type {
  BlockNode,
  DiagramDoc,
  LayoutKind,
  LayoutProps,
  Locale,
  SkinKind,
  TemplateId,
  Tone,
} from './types';

type Localized = Record<Locale, string>;

export interface Template {
  id: TemplateId;
  name: Localized;
  tagline: Localized;
  allowedLayouts: LayoutKind[];
  allowedSkins: SkinKind[];
  maxDepth: number;
  direction: 'bottom-up' | 'top-down';
  theme: { rootTone: Tone; cycleTones: Tone[]; defaults: Partial<LayoutProps> };
  createDemo(locale: Locale): DiagramDoc;
}

let seq = 0;
function autoId(prefix = 'b'): string {
  seq += 1;
  return `${prefix}${seq}`;
}

interface LeafOpts extends Partial<LayoutProps> {
  sub?: string;
  badge?: string;
  tone?: Tone;
  skin?: SkinKind;
}

function leaf(id: string, title: string, tone: Tone, opts: LeafOpts = {}): BlockNode {
  const { sub, badge, tone: toneOverride, skin, ...layout } = opts;
  return {
    id,
    title,
    subtitle: sub,
    badge,
    layout: { kind: 'leaf', maxWidth: 190, ...layout },
    skin: { kind: skin ?? 'chip', tone: toneOverride ?? tone },
    children: [],
  };
}

interface BoxOpts extends Partial<LayoutProps> {
  tone?: Tone;
  skin?: SkinKind;
  label?: string;
}

function box(
  id: string,
  title: string,
  layout: Partial<LayoutProps> & { kind: LayoutKind },
  children: BlockNode[],
  opts: BoxOpts = {},
): BlockNode {
  const { tone, skin, label, ...layoutRest } = opts;
  void label;
  return {
    id,
    title,
    layout: { gap: 12, ...layout, ...layoutRest, kind: layout.kind },
    skin: { kind: skin ?? 'container', tone: tone ?? 'paper' },
    children,
  };
}

function makeDoc(
  locale: Locale,
  template: TemplateId,
  title: Localized,
  root: BlockNode,
  relations: DiagramDoc['relations'] = [],
  direction: 'bottom-up' | 'top-down' = 'bottom-up',
): DiagramDoc {
  const now = new Date().toISOString();
  return {
    version: 3,
    meta: {
      title: title[locale],
      template,
      direction,
      createdAt: now,
      updatedAt: now,
    },
    root,
    relations,
  };
}

const TONES: Tone[] = ['water', 'mint', 'peach', 'lavender'];

/* ---------------------------------------------------------------- layered */

function layeredDemo(locale: Locale): DiagramDoc {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const root = box(
    'b1',
    t('支付系统', 'Payment Platform'),
    { kind: 'linear', axis: 'y', gap: 14 },
    [
      box(
        'b2',
        t('接入层', 'Access Layer'),
        { kind: 'linear', axis: 'x', gap: 12, weight: 1 },
        [
          leaf('b5', t('API 网关', 'API Gateway'), 'water'),
          leaf('b6', 'BFF', 'water'),
          leaf('b7', 'CDN', 'water'),
        ],
        { tone: 'water', skin: 'band' },
      ),
      box(
        'b3',
        t('应用层', 'Application Layer'),
        { kind: 'linear', axis: 'x', gap: 12, weight: 1 },
        [
          leaf('b8', t('订单服务', 'Order Service'), 'mint', { sub: 'Spring Boot' }),
          leaf('b9', t('支付服务', 'Payment Service'), 'mint'),
          leaf('b10', t('账户服务', 'Account Service'), 'mint'),
        ],
        { tone: 'mint', skin: 'band' },
      ),
      box(
        'b4',
        t('基础设施层', 'Infrastructure'),
        { kind: 'linear', axis: 'x', gap: 12, weight: 1 },
        [
          leaf('b11', 'MySQL', 'peach'),
          leaf('b12', 'Redis', 'peach'),
          leaf('b13', 'Kafka', 'peach'),
        ],
        { tone: 'peach', skin: 'band' },
      ),
    ],
    { skin: 'plain', tone: 'paper', gap: 14 },
  );
  return makeDoc(
    locale,
    'layered',
    { zh: '支付系统分层架构', en: 'Payment Layered Architecture' },
    root,
  );
}

/* --------------------------------------------------------------- protocol */

function protocolDemo(locale: Locale): DiagramDoc {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const layers = [
    ['b2', t('应用层 · HTTP / DNS', 'Application · HTTP / DNS')],
    ['b3', t('传输层 · TCP / UDP', 'Transport · TCP / UDP')],
    ['b4', t('网络层 · IP / ICMP', 'Network · IP / ICMP')],
    ['b5', t('链路层 · Ethernet / ARP', 'Link · Ethernet / ARP')],
    ['b6', t('物理层 · 光纤 / 双绞线', 'Physical · Fiber / Copper')],
  ] as const;
  const root = box(
    'b1',
    t('TCP/IP 协议栈', 'TCP/IP Stack'),
    { kind: 'linear', axis: 'y', gap: 10 },
    layers.map(([id, title], i) => ({
      ...leaf(id, title, TONES[i % TONES.length]),
      layout: { kind: 'leaf', maxWidth: 420, weight: 1 },
      skin: { kind: 'band' as SkinKind, tone: TONES[i % TONES.length] },
    })),
    { skin: 'plain', tone: 'paper', gap: 10 },
  );
  return makeDoc(
    locale,
    'protocol',
    { zh: 'TCP/IP 协议栈', en: 'TCP/IP Protocol Stack' },
    root,
  );
}

/* ------------------------------------------------------------------ stack */

function stackDemo(locale: Locale): DiagramDoc {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const flow = (id: string, title: string, tone: Tone, items: string[]): BlockNode =>
    box(
      id,
      title,
      { kind: 'flow', gap: 10, lineGap: 10, maxWidth: 520, weight: 1 },
      items.map((item, i) => leaf(`${id}s${i + 1}`, item, tone)),
      { tone, skin: 'band' },
    );
  const root = box(
    'b1',
    t('技术栈', 'Technology Stack'),
    { kind: 'linear', axis: 'y', gap: 12 },
    [
      flow('b2', t('前端', 'Frontend'), 'water', ['React', 'TypeScript', 'Vite', 'Tailwind']),
      flow('b3', t('服务端', 'Backend'), 'mint', ['Node.js', 'Go', 'PostgreSQL', 'Redis']),
      flow('b4', t('运行时与基础设施', 'Runtime & Infra'), 'peach', ['Docker', 'Kubernetes', 'Linux', 'AWS']),
    ],
    { skin: 'plain', tone: 'paper', gap: 12 },
  );
  return makeDoc(
    locale,
    'stack',
    { zh: '技术栈总览', en: 'Technology Stack' },
    root,
  );
}

/* --------------------------------------------------------------------- c4 */

function c4Demo(locale: Locale): DiagramDoc {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const boundary = box(
    'b2',
    t('支付平台', 'Payment Platform'),
    { kind: 'linear', axis: 'y', gap: 16 },
    [
      box(
        'b3',
        t('Web 应用', 'Web App'),
        { kind: 'linear', axis: 'x', gap: 10 },
        [
          leaf('b5', t('下单页', 'Checkout'), 'water'),
          leaf('b6', t('账单页', 'Billing'), 'water'),
        ],
      ),
      box(
        'b4',
        t('核心服务', 'Core Services'),
        { kind: 'linear', axis: 'x', gap: 10 },
        [
          leaf('b7', t('订单 API', 'Order API'), 'mint'),
          leaf('b8', t('支付 API', 'Payment API'), 'mint'),
          leaf('b9', t('风控 API', 'Risk API'), 'mint'),
        ],
      ),
    ],
    { tone: 'lavender', skin: 'boundary' },
  );
  const external = box(
    'b10',
    t('外部系统', 'External Systems'),
    { kind: 'linear', axis: 'y', gap: 10 },
    [leaf('b11', t('银行网关', 'Bank Gateway'), 'peach'), leaf('b12', t('消息推送', 'Push Service'), 'peach')],
    { tone: 'peach', skin: 'boundary' },
  );
  const root = box(
    'b1',
    t('支付系统上下文', 'Payment System Context'),
    { kind: 'linear', axis: 'y', gap: 28 },
    [boundary, external],
    { skin: 'plain', tone: 'paper', gap: 28 },
  );
  return makeDoc(
    locale,
    'c4',
    { zh: 'C4 容器视图', en: 'C4 Container View' },
    root,
  );
}

/* ----------------------------------------------------------------- deploy */

function deployDemo(locale: Locale): DiagramDoc {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const pod = (id: string, title: string, services: string[]): BlockNode =>
    box(
      id,
      title,
      { kind: 'linear', axis: 'y', gap: 8 },
      services.map((s, i) => leaf(`${id}s${i + 1}`, s, 'mint')),
      { skin: 'container', tone: 'mint' },
    );
  const root = box(
    'b1',
    t('生产环境', 'Production'),
    { kind: 'linear', axis: 'y', gap: 18 },
    [
      box(
        'b2',
        'Region · ap-east-1',
        { kind: 'linear', axis: 'y', gap: 14 },
        [
          box(
            'b3',
            t('Kubernetes 集群', 'Kubernetes Cluster'),
            { kind: 'grid', columns: 3, gap: 14, lineGap: 14 },
            [
              pod('b4', 'web-0', ['nginx', 'app']),
              pod('b5', 'web-1', ['nginx', 'app']),
              pod('b6', 'worker-0', ['consumer']),
            ],
            { skin: 'container', tone: 'water' },
          ),
          leaf('b7', 'RDS PostgreSQL', 'peach'),
        ],
        { skin: 'boundary', tone: 'lavender' },
      ),
    ],
    { skin: 'plain', tone: 'paper', gap: 18 },
  );
  return makeDoc(
    locale,
    'deploy',
    { zh: '部署拓扑', en: 'Deployment Topology' },
    root,
  );
}

/* ----------------------------------------------------------------- module */

function moduleDemo(locale: Locale): DiagramDoc {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const mod = (id: string, title: string, tone: Tone, items: string[]): BlockNode =>
    box(
      id,
      title,
      { kind: 'linear', axis: 'y', gap: 8, weight: 1 },
      items.map((s, i) => leaf(`${id}s${i + 1}`, s, tone, { maxWidth: 150 })),
      { skin: 'container', tone },
    );
  const root = box(
    'b1',
    t('monorepo / packages', 'monorepo / packages'),
    { kind: 'linear', axis: 'x', gap: 16, align: 'start' },
    [
      mod('b2', t('core', 'core'), 'water', ['router', 'store', 'events']),
      mod('b3', t('ui', 'ui'), 'mint', ['button', 'chart', 'form']),
      mod('b4', t('infra', 'infra'), 'peach', ['http', 'logger', 'config']),
    ],
    { skin: 'plain', tone: 'paper', gap: 16, align: 'start' },
  );
  return makeDoc(
    locale,
    'module',
    { zh: '模块分解', en: 'Module Breakdown' },
    root,
  );
}

/* ----------------------------------------------------------------- memory */

function memoryDemo(locale: Locale): DiagramDoc {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const segment = (id: string, title: string, tone: Tone, weight: number, sub?: string): BlockNode => ({
    id,
    title,
    subtitle: sub,
    layout: { kind: 'leaf', weight, maxWidth: 200 },
    skin: { kind: 'segment', tone, titlePos: 'top' },
    children: [],
  });
  const root = box(
    'b1',
    t('进程地址空间', 'Process Address Space'),
    { kind: 'linear', axis: 'x', gap: 6, align: 'stretch' },
    [
      segment('b2', t('代码段', 'Text'), 'water', 2, '.text'),
      segment('b3', t('数据段', 'Data'), 'mint', 2, '.data / .bss'),
      segment('b4', t('堆', 'Heap'), 'peach', 5, 'malloc'),
      segment('b5', t('栈', 'Stack'), 'rose', 3, 'thread'),
      segment('b6', t('保留区', 'Reserved'), 'lavender', 1),
    ],
    { skin: 'plain', tone: 'paper', gap: 6 },
  );
  return makeDoc(
    locale,
    'memory',
    { zh: '进程地址空间', en: 'Process Address Space' },
    root,
  );
}

/* ----------------------------------------------------------------- custom */

function customDemo(locale: Locale): DiagramDoc {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const root = box(
    'b1',
    t('新架构图', 'New Diagram'),
    { kind: 'linear', axis: 'y', gap: 16 },
    [
      box(
        'b2',
        t('第一层', 'First Layer'),
        { kind: 'grid', columns: 2, gap: 12 },
        [
          leaf('b4', t('组件 A', 'Component A'), 'water'),
          leaf('b5', t('组件 B', 'Component B'), 'mint'),
          leaf('b6', t('组件 C', 'Component C'), 'peach'),
        ],
        { tone: 'water', skin: 'band' },
      ),
      box(
        'b3',
        t('第二层', 'Second Layer'),
        { kind: 'linear', axis: 'x', gap: 12 },
        [leaf('b7', t('服务 1', 'Service 1'), 'lavender'), leaf('b8', t('服务 2', 'Service 2'), 'lavender')],
        { tone: 'lavender', skin: 'band' },
      ),
    ],
    { skin: 'plain', tone: 'paper', gap: 16 },
  );
  return makeDoc(
    locale,
    'custom',
    { zh: '自由模板示例', en: 'Freeform Example' },
    root,
  );
}

/* ---------------------------------------------------------------- registry */

export const TEMPLATES: Record<TemplateId, Template> = {
  layered: {
    id: 'layered',
    name: { zh: '分层架构', en: 'Layered' },
    tagline: { zh: '水平层带 + 层内组件，层间依赖', en: 'Horizontal layers with components' },
    allowedLayouts: ['linear'],
    allowedSkins: ['band', 'chip', 'plain', 'note'],
    maxDepth: 3,
    direction: 'bottom-up',
    theme: { rootTone: 'paper', cycleTones: ['water', 'mint', 'peach', 'lavender'], defaults: { gap: 12 } },
    createDemo: layeredDemo,
  },
  protocol: {
    id: 'protocol',
    name: { zh: '协议栈', en: 'Protocol Stack' },
    tagline: { zh: '严格堆叠的层，逐层封装', en: 'Strictly stacked encapsulation layers' },
    allowedLayouts: ['linear', 'leaf'],
    allowedSkins: ['band', 'chip', 'plain'],
    maxDepth: 2,
    direction: 'bottom-up',
    theme: { rootTone: 'paper', cycleTones: TONES, defaults: { gap: 10 } },
    createDemo: protocolDemo,
  },
  stack: {
    id: 'stack',
    name: { zh: '技术栈', en: 'Tech Stack' },
    tagline: { zh: '硬件到框架的分层技术选型', en: 'Hardware to framework layers' },
    allowedLayouts: ['linear', 'flow', 'leaf'],
    allowedSkins: ['band', 'chip', 'plain'],
    maxDepth: 3,
    direction: 'bottom-up',
    theme: { rootTone: 'paper', cycleTones: TONES, defaults: { gap: 12 } },
    createDemo: stackDemo,
  },
  c4: {
    id: 'c4',
    name: { zh: '系统上下文', en: 'C4 Context' },
    tagline: { zh: '系统边界内嵌容器与组件', en: 'Boundaries, containers and components' },
    allowedLayouts: ['linear', 'grid', 'stack'],
    allowedSkins: ['boundary', 'container', 'chip', 'plain', 'note'],
    maxDepth: 4,
    direction: 'bottom-up',
    theme: { rootTone: 'paper', cycleTones: ['lavender', 'water', 'mint'], defaults: { gap: 14 } },
    createDemo: c4Demo,
  },
  deploy: {
    id: 'deploy',
    name: { zh: '部署拓扑', en: 'Deployment' },
    tagline: { zh: 'Region / 集群 / Pod 逐级嵌套', en: 'Region, cluster and pod nesting' },
    allowedLayouts: ['linear', 'grid', 'leaf'],
    allowedSkins: ['boundary', 'container', 'chip', 'plain'],
    maxDepth: 5,
    direction: 'bottom-up',
    theme: { rootTone: 'paper', cycleTones: ['lavender', 'water', 'mint'], defaults: { gap: 12 } },
    createDemo: deployDemo,
  },
  module: {
    id: 'module',
    name: { zh: '模块分解', en: 'Modules' },
    tagline: { zh: '包与接口的组成关系', en: 'Packages and interface composition' },
    allowedLayouts: ['linear', 'grid', 'flow'],
    allowedSkins: ['container', 'chip', 'boundary', 'note', 'plain'],
    maxDepth: 4,
    direction: 'top-down',
    theme: { rootTone: 'paper', cycleTones: TONES, defaults: { gap: 12 } },
    createDemo: moduleDemo,
  },
  memory: {
    id: 'memory',
    name: { zh: '内存布局', en: 'Memory Layout' },
    tagline: { zh: '按权重划分的地址区间', en: 'Address ranges by weight' },
    allowedLayouts: ['linear', 'leaf'],
    allowedSkins: ['segment', 'chip', 'plain'],
    maxDepth: 2,
    direction: 'top-down',
    theme: { rootTone: 'paper', cycleTones: TONES, defaults: { gap: 6 } },
    createDemo: memoryDemo,
  },
  custom: {
    id: 'custom',
    name: { zh: '自由模板', en: 'Freeform' },
    tagline: { zh: '全部布局与皮肤，任意组合', en: 'All layouts and skins, any combination' },
    allowedLayouts: ['linear', 'grid', 'flow', 'stack', 'spacer', 'leaf'],
    allowedSkins: ['band', 'boundary', 'container', 'chip', 'segment', 'note', 'plain'],
    maxDepth: 8,
    direction: 'top-down',
    theme: { rootTone: 'paper', cycleTones: TONES, defaults: { gap: 12 } },
    createDemo: customDemo,
  },
};

export function getTemplate(id: TemplateId): Template {
  return TEMPLATES[id] ?? TEMPLATES.custom;
}

/**
 * `leaf` / `spacer` are terminal markers rather than structural layouts, so they are
 * always permitted regardless of the template whitelist (otherwise every demo would
 * report false TEMPLATE_LAYOUT issues).
 */
export function templateAllowsLayout(template: Template, kind: LayoutKind): boolean {
  if (kind === 'leaf' || kind === 'spacer') return true;
  return template.allowedLayouts.includes(kind);
}

export function createEmptyDoc(locale: Locale): DiagramDoc {
  return customDemo(locale);
}

export { autoId as nextGeneratedId };
