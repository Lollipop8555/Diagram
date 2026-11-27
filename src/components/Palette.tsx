import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerDownRight,
  FolderOpen,
  LayoutGrid,
  ListTree,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type { Editor } from '../model/store';
import type { BlockNode, ID, LayoutKind } from '../model/types';
import { getTemplate, templateAllowsLayout } from '../model/templates';
import { countBlocks, filterOutline, findBlock, findParent, indexIn, type OutlineFilter } from '../model/tree';
import { ProjectsPanel } from './ProjectsPanel';
import { ContextMenu, useContextMenu } from './ContextMenu';

interface LayoutItem {
  kind: LayoutKind;
  axis?: 'x' | 'y';
  labelKey:
    | 'layoutLinear'
    | 'layoutLinearX'
    | 'layoutGrid'
    | 'layoutFlow'
    | 'layoutStack'
    | 'layoutSpacer';
}

const LAYOUT_ITEMS: LayoutItem[] = [
  { kind: 'linear', axis: 'y', labelKey: 'layoutLinear' },
  { kind: 'linear', axis: 'x', labelKey: 'layoutLinearX' },
  { kind: 'grid', labelKey: 'layoutGrid' },
  { kind: 'flow', labelKey: 'layoutFlow' },
  { kind: 'stack', labelKey: 'layoutStack' },
  { kind: 'spacer', labelKey: 'layoutSpacer' },
];

const CONTENT_ITEMS = [
  { skin: 'container', labelKey: 'addContainer', glyph: 'container' },
  { skin: 'chip', labelKey: 'addLeaf', glyph: 'chip' },
  { skin: 'note', labelKey: 'addNote', glyph: 'note' },
] as const;

type SidebarTab = 'projects' | 'components' | 'outline';

/** Where a dragged outline row would land relative to the hovered row. */
type DropZone = 'before' | 'inside' | 'after';

export function Palette({ editor }: { editor: Editor }) {
  const { doc, t } = editor;
  const [tab, setTab] = useState<SidebarTab>('projects');
  const [query, setQuery] = useState('');
  const filter = useMemo(() => (doc ? filterOutline(doc.root, query) : null), [doc, query]);
  const searching = query.trim().length > 0;
  const noHit = searching && filter !== null && filter.visible.size === 0;

  const [dragId, setDragId] = useState<ID | null>(null);
  const [drop, setDrop] = useState<{ id: ID; zone: DropZone } | null>(null);
  const ctx = useContextMenu();
  const [renameSignal, setRenameSignal] = useState<{ id: ID; nonce: number } | null>(null);

  /** Right-click menu on an outline row: structural actions without touching the inspector. */
  const openRowMenu = (event: React.MouseEvent, id: ID) => {
    if (!doc) return;
    const node = findBlock(doc.root, id);
    if (!node) return;
    const isRoot = doc?.root.id === id;
    ctx.open(event, [
      {
        id: 'child',
        label: editor.t('addChild'),
        icon: Plus,
        // Leaves and spacers cannot host children.
        disabled: node.layout.kind === 'leaf' || node.layout.kind === 'spacer',
        onSelect: () => editor.addBlock('container', id),
      },
      {
        id: 'sibling',
        label: editor.t('addSibling'),
        icon: CornerDownRight,
        disabled: isRoot,
        onSelect: () => {
          editor.select(id);
          editor.addSibling();
        },
      },
      {
        id: 'rename',
        label: editor.t('rename'),
        icon: Pencil,
        disabled: isRoot,
        onSelect: () => setRenameSignal({ id, nonce: Date.now() }),
      },
      {
        id: 'up',
        label: editor.t('moveUp'),
        icon: ArrowUp,
        disabled: isRoot,
        onSelect: () => editor.moveBlockUpDown(id, -1),
      },
      {
        id: 'down',
        label: editor.t('moveDown'),
        icon: ArrowDown,
        disabled: isRoot,
        onSelect: () => editor.moveBlockUpDown(id, 1),
      },
      {
        id: 'promote',
        label: editor.t('promote'),
        icon: ChevronsUpDown,
        disabled: isRoot,
        onSelect: () => editor.promote(id),
      },
      {
        id: 'demote',
        label: editor.t('demote'),
        icon: ChevronsDownUp,
        disabled: isRoot,
        onSelect: () => editor.demote(id),
      },
      {
        id: 'remove',
        label: editor.t('remove'),
        icon: Trash2,
        danger: true,
        disabled: isRoot,
        onSelect: () => editor.removeBlock(id),
      },
    ]);
  };

  const onDragStart = (id: ID) => setDragId(id);
  const onDragOver = (id: ID, zone: DropZone) =>
    setDrop((current) =>
      current && current.id === id && current.zone === zone ? current : { id, zone },
    );
  const onDragEnd = () => {
    setDragId(null);
    setDrop(null);
  };

  const onDrop = (targetId: ID) => {
    const zone = drop?.zone ?? 'inside';
    const dragging = dragId;
    onDragEnd();
    if (!doc || !dragging || dragging === targetId) return;
    const target = findBlock(doc.root, targetId);
    if (!target) return;

    let parentId = targetId;
    let index = target.children.length;
    if (zone !== 'inside') {
      const parent = findParent(doc.root, targetId);
      if (parent) {
        parentId = parent.id;
        index = indexIn(parent, targetId) + (zone === 'after' ? 1 : 0);
      } else {
        // The root row: dropping on it appends to the root.
        parentId = doc.root.id;
        index = doc.root.children.length;
      }
    }
    editor.moveBlockTo(dragging, parentId, index);
  };

  const tabs: { id: SidebarTab; icon: typeof FolderOpen; label: string }[] = [
    { id: 'projects', icon: FolderOpen, label: t('projects') },
    { id: 'components', icon: LayoutGrid, label: t('palette') },
    { id: 'outline', icon: ListTree, label: t('outlineTree') },
  ];

  return (
    <aside className="sidebar" id="sidebar">
      <nav className="sidebar-rail" aria-label={t('projects')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rail-btn${tab === item.id ? ' is-active' : ''}`}
            title={item.label}
            aria-label={item.label}
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={18} strokeWidth={1.8} />
          </button>
        ))}
      </nav>

      <div className="sidebar-body">
        {tab === 'projects' ? <ProjectsPanel editor={editor} /> : null}
        {tab === 'components' ? (
          <ComponentsPanel editor={editor} />
        ) : null}
        {tab === 'outline' ? (
          <OutlinePanel
            editor={editor}
            query={query}
            setQuery={setQuery}
            filter={filter}
            searching={searching}
            noHit={noHit}
            dragId={dragId}
            drop={drop}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onRowMenu={openRowMenu}
            renameSignal={renameSignal}
          />
        ) : null}
      </div>

      {ctx.menu ? <ContextMenu menu={ctx.menu} onClose={ctx.close} /> : null}
    </aside>
  );
}

/** Component tiles are filtered by the template of the *currently open project*. */
function ComponentsPanel({ editor }: { editor: Editor }) {
  const { doc, t } = editor;
  const template = doc ? getTemplate(doc.meta.template) : null;
  const layouts = LAYOUT_ITEMS.filter(
    (item) => !template || templateAllowsLayout(template, item.kind),
  );
  const contents = CONTENT_ITEMS.filter(
    (item) => !template || template.allowedSkins.includes(item.skin),
  );

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{t('palette')}</h2>
        <span className="panel-note">{template ? template.name[editor.locale] : '—'}</span>
      </header>

      <div className="group">
        <h3>{t('layouts')}</h3>
        <div className="tiles">
          {layouts.map((item) => (
            <button
              type="button"
              key={`${item.kind}-${item.axis ?? ''}`}
              className="tile"
              disabled={!doc}
              onClick={() => editor.addLayout(item.kind, item.axis)}
              title={t(item.labelKey)}
            >
              <span className={`tile-glyph glyph-${item.kind}${item.axis === 'x' ? ' is-x' : ''}`} />
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="group">
        <h3>{t('contents')}</h3>
        <div className="tiles">
          {contents.map((item) => (
            <button
              type="button"
              key={item.skin}
              className="tile"
              disabled={!doc}
              onClick={() => editor.addBlock(item.skin)}
              title={t(item.labelKey)}
            >
              <span className={`tile-glyph glyph-${item.glyph}`} />
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="panel-hint">{doc ? t('componentsHint') : t('addLayoutFirst')}</p>
    </section>
  );
}

function OutlinePanel({
  editor,
  query,
  setQuery,
  filter,
  searching,
  noHit,
  dragId,
  drop,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRowMenu,
  renameSignal,
}: {
  editor: Editor;
  query: string;
  setQuery: (value: string) => void;
  filter: OutlineFilter | null;
  searching: boolean;
  noHit: boolean;
  dragId: ID | null;
  drop: { id: ID; zone: DropZone } | null;
  onDragStart: (id: ID) => void;
  onDragOver: (id: ID, zone: DropZone) => void;
  onDrop: (id: ID) => void;
  onDragEnd: () => void;
  onRowMenu: (event: React.MouseEvent, id: ID) => void;
  renameSignal: { id: ID; nonce: number } | null;
}) {
  const { doc, selectedId, t } = editor;
  return (
    <section className="panel outline-panel">
      <header className="panel-head">
        <h2>{t('outlineTree')}</h2>
        <div className="outline-tools">
          {doc ? <span className="panel-note">{countBlocks(doc.root)}</span> : null}
          <button
            type="button"
            className="icon-btn is-mini"
            onClick={() => editor.addBlock('container', selectedId ?? undefined)}
            disabled={!doc || !selectedId}
            title={t('addChild')}
            aria-label={t('addChild')}
          >
            <Plus size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="icon-btn is-mini"
            onClick={() => editor.addSibling()}
            disabled={!doc || !selectedId}
            title={t('addSibling')}
            aria-label={t('addSibling')}
          >
            <CornerDownRight size={14} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className="icon-btn is-mini"
            onClick={() => selectedId && editor.removeBlock(selectedId)}
            disabled={!doc || !selectedId}
            title={t('remove')}
            aria-label={t('remove')}
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="icon-btn is-mini"
            onClick={() => editor.collapseAll(true)}
            disabled={!doc}
            title={t('collapseAll')}
            aria-label={t('collapseAll')}
          >
            <ChevronsDownUp size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="icon-btn is-mini"
            onClick={() => editor.collapseAll(false)}
            disabled={!doc}
            title={t('expandAll')}
            aria-label={t('expandAll')}
          >
            <ChevronsUpDown size={14} strokeWidth={1.8} />
          </button>
        </div>
      </header>
      {doc ? (
        <>
          <input
            className="input outline-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchBlocks')}
            aria-label={t('searchBlocks')}
            type="search"
          />
          {noHit ? (
            <p className="panel-hint">{t('searchEmpty')}</p>
          ) : (
            <OutlineNode
              node={doc.root}
              depth={0}
              editor={editor}
              filter={filter}
              searching={searching}
              dragId={dragId}
              drop={drop}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onRowMenu={onRowMenu}
              renameSignal={renameSignal}
            />
          )}
        </>
      ) : (
        <p className="panel-hint">{t('addLayoutFirst')}</p>
      )}
    </section>
  );
}

function OutlineNode({
  node,
  depth,
  editor,
  filter,
  searching,
  dragId,
  drop,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRowMenu,
  renameSignal,
}: {
  node: BlockNode;
  depth: number;
  editor: Editor;
  filter: OutlineFilter | null;
  searching: boolean;
  dragId: ID | null;
  drop: { id: ID; zone: DropZone } | null;
  onDragStart: (id: ID) => void;
  onDragOver: (id: ID, zone: DropZone) => void;
  onDrop: (id: ID) => void;
  onDragEnd: () => void;
  onRowMenu: (event: React.MouseEvent, id: ID) => void;
  renameSignal: { id: ID; nonce: number } | null;
}) {
  const { selectedId, issues } = editor;
  const issue = issues.find((item) => item.blockId === node.id);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedId;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const isHit = filter?.hits.has(node.id) ?? false;
  /** While searching, ancestors of a hit are always expanded so the match is visible. */
  const expanded = searching ? true : !node.collapsed;
  const [draft, setDraft] = useState<string | null>(null);
  const isRoot = editor.doc?.root.id === node.id;

  useEffect(() => {
    if (!isSelected) return;
    rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isSelected]);

  /** The context menu can ask a row to start renaming. */
  useEffect(() => {
    if (!renameSignal || renameSignal.id !== node.id || isRoot) return;
    setDraft(node.title ?? '');
  }, [renameSignal, node.id, node.title, isRoot]);

  const startRename = () => {
    if (isRoot) return;
    setDraft(node.title ?? '');
  };

  const commitRename = () => {
    if (draft === null) return;
    const next = draft.trim();
    if (next && next !== (node.title ?? '')) editor.patchBlock(node.id, { title: next });
    setDraft(null);
  };

  if (searching && filter && !filter.visible.has(node.id)) return null;

  return (
    <div className="outline-node">
      <div
        ref={rowRef}
        className={`outline-row${isSelected ? ' is-selected' : ''}${isHit ? ' is-hit' : ''}${
          dragId === node.id ? ' is-dragging' : ''
        }${
          drop && drop.id === node.id
            ? drop.zone === 'inside'
              ? ' is-drop-inside'
              : ` is-drop-${drop.zone}`
            : ''
        }`}
        style={{ paddingLeft: 8 + depth * 13 }}
        draggable={!isRoot}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', node.id);
          onDragStart(node.id);
        }}
        onDragOver={(event) => {
          if (!dragId || dragId === node.id) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
          onDragOver(node.id, ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside');
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDrop(node.id);
        }}
        onDragEnd={onDragEnd}
        onContextMenu={(event) => onRowMenu(event, node.id)}
        onClick={() => editor.select(node.id)}
        onDoubleClick={startRename}
        role="treeitem"
        aria-selected={node.id === selectedId}
        aria-level={depth + 1}
        aria-expanded={hasChildren ? expanded : undefined}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            editor.select(node.id);
            return;
          }
          if (event.key === 'F2') {
            event.preventDefault();
            startRename();
          }
        }}
      >
        <button
          type="button"
          className={`twisty${hasChildren ? '' : ' is-empty'}${node.collapsed ? ' is-closed' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            if (!hasChildren) return;
            editor.patchBlock(node.id, { collapsed: !node.collapsed });
          }}
          aria-label={node.collapsed ? editor.t('expand') : editor.t('collapse')}
          tabIndex={-1}
        >
          <ChevronRight
            size={12}
            strokeWidth={2.2}
            className={`chevron${node.collapsed ? ' is-closed' : ''}`}
          />
        </button>
        {draft !== null ? (
          <input
            className="outline-rename"
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                commitRename();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(null);
              }
            }}
            aria-label={editor.t('rename')}
          />
        ) : (
          <span className="outline-title">{node.title || editor.t('untitled')}</span>
        )}
        {node.badge ? <span className="outline-badge">{node.badge}</span> : null}
        {issue ? <span className="outline-issue" title={issue.code} /> : null}
      </div>
      {expanded && hasChildren
        ? node.children.map((child) => (
            <OutlineNode
              key={child.id}
              node={child}
              depth={depth + 1}
              editor={editor}
              filter={filter}
              searching={searching}
              dragId={dragId}
              drop={drop}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onRowMenu={onRowMenu}
              renameSignal={renameSignal}
            />
          ))
        : null}
    </div>
  );
}
