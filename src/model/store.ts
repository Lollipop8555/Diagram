import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BlockNode,
  DiagramDoc,
  ID,
  LayoutKind,
  LayoutProps,
  Locale,
  Relation,
  RelationKind,
  Size,
  SkinKind,
  SkinProps,
  TemplateId,
} from './types';
import { translate, type DictKey } from '../i18n/dict';
import {
  checkMove,
  collapseAllBlocks,
  demoteBlock,
  duplicateSubtree,
  pairWeights,
  findBlock,
  findParent,
  indexIn,
  insertChild,
  moveBlock,
  nextBlockId,
  promoteBlock,
  removeSubtree,
  shiftBlock,
  uid,
  updateBlock,
} from './tree';
import { getTemplate, templateAllowsLayout } from './templates';
import {
  emptyHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from './history';
import { acceptsChild } from '../layout/registry';
import { layoutDoc, MIN_ROOT_H, MIN_ROOT_W } from '../layout/dispatch';
import { planRootGrowth, weightUnitOf, withDefaultSize } from '../layout/root';
import { applyTemplate, validateDoc, type TemplateChange, type Issue } from './validate';
import { SKINS } from '../skins/palette';
import { stepZoom } from './zoom';
import { tryParsePop } from '../interchange/fromPop';
import { fromJson } from '../interchange/json';
import {
  emptyTrash as clearTrash,
  loadActiveProjectId,
  loadLibrary,
  makeProject,
  nextProjectName,
  purgeProject as dropFromTrash,
  restoreProject as restoreFromTrash,
  saveActiveProjectId,
  saveLibrary,
  trashProject as moveToTrash,
  upsertProject,
  type Library,
  type Project,
} from './projects';

const DOC_KEY = 'macaron.diagram.v3';
const LOCALE_KEY = 'macaron.locale';
const MAX_FILE = 4 * 1024 * 1024;

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
}

type Updater = (doc: DiagramDoc) => DiagramDoc;

function loadDoc(): DiagramDoc | null {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    if (!raw) return null;
    return fromJson(raw);
  } catch {
    // Keep the unreadable payload so a later version (or the user) can recover it.
    try {
      const raw = localStorage.getItem(DOC_KEY);
      if (raw) localStorage.setItem(`${DOC_KEY}.broken`, raw);
    } catch {
      // storage unavailable: nothing else to do
    }
    return null;
  }
}

function stamp(doc: DiagramDoc): DiagramDoc {
  return { ...doc, meta: { ...doc.meta, updatedAt: new Date().toISOString() } };
}

export interface Editor {
  doc: DiagramDoc | null;
  locale: Locale;
  /** Remembered diagrams, newest first — the app's local "file list". */
  projects: Project[];
  /** Deleted projects, recoverable until the trash is emptied. */
  trash: Project[];
  activeProjectId: string | null;
  selectedId: ID | null;
  view: 'canvas' | 'text';
  zoom: number;
  pan: { x: number; y: number };
  /** True while the canvas should re-fit whenever its viewport resizes. */
  fitMode: boolean;
  /** Apply a fitted view without leaving fit mode (used by the canvas). */
  applyFit: (zoom: number, pan: { x: number; y: number }) => void;
  toasts: Toast[];
  /** Non-null while an in-app confirmation dialog is open. */
  confirm: ConfirmRequest | null;
  askConfirm: (message: string, confirmLabel?: string, danger?: boolean) => Promise<boolean>;
  answerConfirm: (ok: boolean) => void;
  issues: Issue[];
  /** Wall-clock time of the last successful localStorage write, e.g. "14:03". */
  savedAt: string | null;
  canUndo: boolean;
  canRedo: boolean;
  fitSignal: number;
  t: (key: DictKey, params?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  setView: (view: 'canvas' | 'text') => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setPan: (pan: { x: number; y: number }) => void;
  requestFit: () => void;
  select: (id: ID | null) => void;
  notify: (text: string, tone?: Toast['tone']) => void;
  createFromTemplate: (id: TemplateId) => void;
  commit: (updater: Updater) => void;
  setTitle: (title: string) => void;
  patchBlock: (id: ID, patch: Partial<BlockNode>) => void;
  patchLayout: (id: ID, patch: Partial<LayoutProps>) => void;
  patchSkin: (id: ID, patch: Partial<SkinProps>) => void;
  addBlock: (skin: SkinKind, parentId?: ID | null) => ID | null;
  addLayout: (kind: LayoutKind, axis?: 'x' | 'y') => ID | null;
  addSibling: () => ID | null;
  removeBlock: (id: ID) => void;
  duplicateBlock: (id: ID) => void;
  moveBlockUpDown: (id: ID, delta: -1 | 1) => void;
  /** Structural move (outline drag & drop). Returns false when the move is illegal. */
  moveBlockTo: (id: ID, parentId: ID, index: number) => boolean;
  promote: (id: ID) => void;
  demote: (id: ID) => void;
  /** Set the weights of two adjacent siblings, keeping both at 1 or above. */
  setPairWeight: (aId: ID, bId: ID, aWeight: number, bWeight?: number, size?: Size) => void;
  /** Resize the root frame (the single control over the diagram's overall size). */
  setDocSize: (size: Size) => void;
  collapseAll: (collapsed: boolean) => void;
  switchTemplate: (id: TemplateId) => TemplateChange[];
  addRelation: (from: ID, to: ID, kind?: RelationKind, label?: string) => void;
  patchRelation: (id: ID, patch: Partial<Relation>) => void;
  removeRelation: (id: ID) => void;
  importText: (text: string, filename: string) => Promise<boolean>;
  /** Apply pop_diagram source text to the open document (source view). */
  applySource: (text: string) => Promise<boolean>;
  newProject: (template: TemplateId) => void;
  openProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  duplicateProject: (id: string) => void;
  /** Move a project to the trash (recoverable). */
  deleteProject: (id: string) => void;
  restoreProject: (id: string) => void;
  purgeProject: (id: string) => void;
  emptyTrash: () => void;
  importProject: (text: string, filename: string) => Promise<boolean>;
  undo: () => void;
  redo: () => void;
}

function skinDefaults(kind: SkinKind): { layout: LayoutProps; skin: SkinProps } {
  const def = SKINS[kind];
  const layout: LayoutProps =
    kind === 'band'
      ? { kind: 'linear', axis: 'x', gap: 12 }
      : kind === 'container' || kind === 'boundary' || kind === 'plain'
        ? { kind: 'linear', axis: 'y', gap: 10 }
        : { kind: 'leaf', maxWidth: 180 };
  return { layout, skin: { kind, tone: def.tone } };
}

export function useEditor(): Editor {
  /** Library bootstrap: reuse saved projects, else adopt the legacy single doc. */
  const initial = useRef<{ library: Library; activeId: string | null } | null>(null);
  if (!initial.current) {
    const stored = loadLibrary();
    if (stored.projects.length || stored.trash.length) {
      const savedActive = loadActiveProjectId();
      const activeId = stored.projects.some((p) => p.id === savedActive)
        ? savedActive
        : (stored.projects[0]?.id ?? null);
      initial.current = { library: stored, activeId };
    } else {
      const legacy = loadDoc();
      const project = legacy ? makeProject(legacy, legacy.meta.title) : null;
      initial.current = {
        library: { projects: project ? [project] : [], trash: [] },
        activeId: project?.id ?? null,
      };
    }
  }

  const [library, setLibrary] = useState<Library>(initial.current.library);
  const projects = library.projects;
  const trash = library.trash;
  const [activeProjectId, setActiveId] = useState<string | null>(initial.current.activeId);
  const [history, setHistory] = useState<History>(() => {
    const current = initial.current!.library.projects.find(
      (p) => p.id === initial.current!.activeId,
    );
    const base = current ? current.doc : loadDoc();
    return emptyHistory(base ? withDefaultSize(base) : null);
  });
  const doc = history.present;

  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(LOCALE_KEY);
    return saved === 'en' ? 'en' : 'zh';
  });
  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [view, setView] = useState<'canvas' | 'text'>('canvas');
  const [zoom, setZoomState] = useState(1);
  const [pan, setPanState] = useState({ x: 0, y: 0 });
  /** Manual navigation leaves fit mode; requestFit / applyFit re-enter it. */
  const [fitMode, setFitMode] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [fitSignal, setFitSignal] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const confirmResolver = useRef<((ok: boolean) => void) | null>(null);
  const saveFailed = useRef(false);
  const toastSeq = useRef(0);

  const t = useCallback(
    (key: DictKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  const notify = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((list) => [...list.slice(-2), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id));
    }, 2600);
  }, []);

  /**
   * In-app replacement for `window.confirm`: the dialog renders from `confirm`
   * state while the caller awaits the promise.
   */
  const askConfirm = useCallback(
    (message: string, confirmLabel?: string, danger = false) =>
      new Promise<boolean>((resolve) => {
        confirmResolver.current?.(false);
        confirmResolver.current = resolve;
        setConfirm({
          message,
          confirmLabel: confirmLabel ?? translate(locale, 'dialogConfirm'),
          cancelLabel: translate(locale, 'cancel'),
          danger,
        });
      }),
    [locale],
  );

  const answerConfirm = useCallback((ok: boolean) => {
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    setConfirm(null);
    resolve?.(ok);
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale === 'zh' ? 'zh' : 'en';
  }, [locale]);

  useEffect(() => {
    saveLibrary(library);
  }, [library]);

  useEffect(() => {
    saveActiveProjectId(activeProjectId);
  }, [activeProjectId]);

  /** The active project always mirrors the live document. */
  useEffect(() => {
    if (!doc || !activeProjectId) return;
    setLibrary((prev) => {
      const existing = prev.projects.find((project) => project.id === activeProjectId);
      if (!existing || existing.doc === doc) return prev;
      return {
        ...prev,
        projects: upsertProject(prev.projects, {
          ...existing,
          doc,
          updatedAt: doc.meta.updatedAt,
        }),
      };
    });
  }, [doc, activeProjectId]);

  useEffect(() => {
    if (!doc) {
      try {
        localStorage.removeItem(DOC_KEY);
      } catch {
        // storage unavailable
      }
      return;
    }
    try {
      localStorage.setItem(DOC_KEY, JSON.stringify(doc));
      saveFailed.current = false;
      setSavedAt(
        new Date().toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    } catch {
      // Quota or private-mode failure: tell the user once, export stays the fallback.
      if (!saveFailed.current) {
        saveFailed.current = true;
        notify(translate(locale, 'saveFailed'), 'error');
      }
    }
  }, [doc, locale, notify]);

  const commit = useCallback((updater: Updater) => {
    setHistory((h) => {
      if (!h.present) return h;
      const next = updater(h.present);
      if (next === h.present) return h;
      return pushHistory(h, stamp(next));
    });
  }, []);

  const resetDoc = useCallback((next: DiagramDoc | null) => {
    setHistory(emptyHistory(next ? withDefaultSize(next) : null));
    setSelectedId(null);
    setFitMode(true);
    setFitSignal((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => undoHistory(h));
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => redoHistory(h));
  }, []);

  /** Any explicit zoom / pan is user navigation: stop auto-fitting. */
  const setZoom = useCallback((value: number) => {
    setFitMode(false);
    setZoomState(value);
  }, []);

  const setPan = useCallback((value: { x: number; y: number }) => {
    setFitMode(false);
    setPanState(value);
  }, []);

  const applyFit = useCallback((value: number, nextPan: { x: number; y: number }) => {
    setFitMode(true);
    setZoomState(value);
    setPanState(nextPan);
  }, []);

  const requestFit = useCallback(() => {
    setFitMode(true);
    setFitSignal((n) => n + 1);
  }, []);

  const zoomIn = useCallback(() => {
    setFitMode(false);
    setZoomState((value) => stepZoom(value, 1));
  }, []);
  const zoomOut = useCallback(() => {
    setFitMode(false);
    setZoomState((value) => stepZoom(value, -1));
  }, []);

  const createFromTemplate = useCallback(
    (id: TemplateId) => {
      const next = getTemplate(id).createDemo(locale);
      const project = makeProject(next, next.meta.title, projects);
      // Switch the active project in the same update, otherwise the doc effect
      // would write the new document into the previously opened project.
      setLibrary((prev) => ({ ...prev, projects: upsertProject(prev.projects, project) }));
      setActiveId(project.id);
      resetDoc(next);
      setView('canvas');
      notify(t('projectCreated'));
    },
    [locale, notify, projects, resetDoc, t],
  );

  const openProject = useCallback(
    (id: string) => {
      const project = projects.find((item) => item.id === id);
      if (!project) return;
      setActiveId(id);
      resetDoc(project.doc);
      setView('canvas');
    },
    [projects, resetDoc],
  );

  const renameProject = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLibrary((prev) => ({
      ...prev,
      projects: prev.projects.map((project) =>
        project.id === id ? { ...project, name: trimmed } : project,
      ),
    }));
  }, []);

  /** Copy a project (deep clone) and open the copy, so the original stays intact. */
  const duplicateProject = useCallback(
    (id: string) => {
      const source = projects.find((project) => project.id === id);
      if (!source) return;
      const copy = JSON.parse(JSON.stringify(source.doc)) as DiagramDoc;
      const project = makeProject(copy, `${source.name} ${t('copySuffix')}`, projects);
      setLibrary((prev) => ({ ...prev, projects: upsertProject(prev.projects, project) }));
      setActiveId(project.id);
      resetDoc(project.doc);
      setView('canvas');
      notify(t('projectCreated'));
    },
    [notify, projects, resetDoc, t],
  );

  /** Deleting only moves a project to the trash; emptying the trash is final. */
  const deleteProject = useCallback(
    (id: string) => {
      const remaining = projects.filter((project) => project.id !== id);
      setLibrary((prev) => moveToTrash(prev, id));
      if (activeProjectId !== id) return;
      const next = remaining[0] ?? null;
      setActiveId(next ? next.id : null);
      resetDoc(next ? next.doc : null);
    },
    [activeProjectId, projects, resetDoc],
  );

  const restoreProject = useCallback(
    (id: string) => {
      const project = trash.find((item) => item.id === id);
      if (!project) return;
      const restored = { ...project, name: nextProjectName(project.name, projects) };
      setLibrary((prev) => restoreFromTrash(prev, id));
      if (!activeProjectId) {
        setActiveId(restored.id);
        resetDoc(restored.doc);
      }
    },
    [activeProjectId, projects, resetDoc, trash],
  );

  const purgeProject = useCallback((id: string) => {
    setLibrary((prev) => dropFromTrash(prev, id));
  }, []);

  const emptyTrash = useCallback(() => {
    setLibrary((prev) => clearTrash(prev));
  }, []);

  const setTitle = useCallback(
    (title: string) => commit((d) => ({ ...d, meta: { ...d.meta, title } })),
    [commit],
  );

  const patchBlock = useCallback(
    (id: ID, patch: Partial<BlockNode>) =>
      commit((d) => ({ ...d, root: updateBlock(d.root, id, (b) => ({ ...b, ...patch })) })),
    [commit],
  );

  const patchLayout = useCallback(
    (id: ID, patch: Partial<LayoutProps>) =>
      commit((d) => {
        const next = {
          ...d,
          root: updateBlock(d.root, id, (b) => ({ ...b, layout: { ...b.layout, ...patch } })),
        };
        if (patch.weight === undefined) return next;

        // Growing a block's weight must not squeeze its siblings: grow the root
        // frame by exactly as much space as the block gained.
        const block = findBlock(d.root, id);
        const parent = findParent(d.root, id);
        if (!block || !parent || parent.layout.kind !== 'linear' || !d.size) return next;
        const axis: 'x' | 'y' = parent.layout.axis === 'x' ? 'x' : 'y';
        const before = Math.max(1, block.layout.weight || 1);
        const after = Math.max(1, patch.weight);
        if (after <= before) return next;
        const layout = layoutDoc(d);
        const unit = weightUnitOf(layout, parent.id, axis);
        if (!unit) return next;
        const grown = planRootGrowth(d, layout, parent.id, axis, unit * (after - before));
        return grown ? { ...next, size: grown } : next;
      }),
    [commit],
  );

  /** Resize the root frame; children re-flow by weight (compression is the point). */
  const setDocSize = useCallback(
    (size: Size) =>
      commit((d) => ({
        ...d,
        size: {
          w: Math.max(MIN_ROOT_W, Math.round(size.w)),
          h: Math.max(MIN_ROOT_H, Math.round(size.h)),
        },
      })),
    [commit],
  );

  const patchSkin = useCallback(
    (id: ID, patch: Partial<SkinProps>) =>
      commit((d) => ({
        ...d,
        root: updateBlock(d.root, id, (b) => ({ ...b, skin: { ...b.skin, ...patch } })),
      })),
    [commit],
  );

  const addBlock = useCallback(
    (skin: SkinKind, parentId?: ID | null) => {
      if (!doc) return null;
      const template = getTemplate(doc.meta.template);
      const defaults = skinDefaults(skin);
      if (!template.allowedSkins.includes(skin)) {
        notify(t('reasonTEMPLATE_DISALLOWED'), 'error');
        return null;
      }

      let anchor = findBlock(doc.root, parentId ?? selectedId ?? doc.root.id);
      if (!anchor) return null;
      if (anchor.layout.kind === 'leaf' || anchor.layout.kind === 'spacer') {
        anchor = findParent(doc.root, anchor.id);
      }
      if (!anchor) return null;
      if (!templateAllowsLayout(template, anchor.layout.kind)) {
        notify(t('reasonTEMPLATE_DISALLOWED'), 'error');
        return null;
      }

      const node: BlockNode = {
        id: nextBlockId(doc),
        title:
          skin === 'chip' ? t('addLeaf') : skin === 'note' ? t('addNote') : t('addContainer'),
        layout: defaults.layout,
        skin: defaults.skin,
        children: [],
      };
      commit((d) => insertChild(d, anchor.id, node));
      setSelectedId(node.id);
      return node.id;
    },
    [commit, doc, notify, selectedId, t],
  );

  const addLayout = useCallback(
    (kind: LayoutKind, axis: 'x' | 'y' = 'y') => {
      if (!doc) return null;
      const template = getTemplate(doc.meta.template);
      if (!templateAllowsLayout(template, kind)) {
        notify(t('reasonTEMPLATE_DISALLOWED'), 'error');
        return null;
      }

      let anchor = findBlock(doc.root, selectedId ?? doc.root.id);
      if (!anchor) return null;
      if (anchor.layout.kind === 'leaf' || anchor.layout.kind === 'spacer') {
        anchor = findParent(doc.root, anchor.id);
      }
      if (!anchor) return null;
      if (!acceptsChild(anchor.layout.kind, kind)) {
        notify(t('reasonINCOMPATIBLE_LAYOUT'), 'error');
        return null;
      }

      const layout: LayoutProps =
        kind === 'linear'
          ? { kind: 'linear', axis, gap: 12 }
          : kind === 'grid'
            ? { kind: 'grid', columns: 3, columnMode: 'equal', gap: 10 }
            : kind === 'flow'
              ? { kind: 'flow', gap: 10, lineGap: 10, maxWidth: 420 }
              : kind === 'stack'
                ? { kind: 'stack', gap: 8 }
                : kind === 'spacer'
                  ? { kind: 'spacer' }
                  : { kind: 'leaf', maxWidth: 190 };

      const tone = (['water', 'mint', 'peach', 'lavender'] as const)[anchor.children.length % 4];
      const skin: SkinProps =
        kind === 'leaf'
          ? { kind: 'chip', tone }
          : kind === 'spacer'
            ? { kind: 'plain', tone: 'paper' }
            : { kind: 'container', tone };

      const titleKey: DictKey =
        kind === 'linear'
          ? axis === 'x'
            ? 'layoutLinearX'
            : 'layoutLinear'
          : kind === 'grid'
            ? 'layoutGrid'
            : kind === 'flow'
              ? 'layoutFlow'
              : kind === 'stack'
                ? 'layoutStack'
                : kind === 'spacer'
                  ? 'layoutSpacer'
                  : 'layoutLeaf';

      const node: BlockNode = {
        id: nextBlockId(doc),
        title: t(titleKey),
        layout,
        skin,
        children: [],
      };
      commit((d) => insertChild(d, anchor.id, node));
      setSelectedId(node.id);
      return node.id;
    },
    [commit, doc, notify, selectedId, t],
  );

  const addSibling = useCallback(() => {
    if (!doc || !selectedId) return null;
    const node = findBlock(doc.root, selectedId);
    const parent = findParent(doc.root, selectedId);
    if (!node || !parent) return null;
    const copy: BlockNode = {
      id: nextBlockId(doc),
      title: t('addContainer'),
      layout: { ...node.layout },
      skin: { ...node.skin },
      children: [],
    };
    const index = indexIn(parent, selectedId) + 1;
    commit((d) => insertChild(d, parent.id, copy, index));
    setSelectedId(copy.id);
    return copy.id;
  }, [commit, doc, selectedId, t]);

  const removeBlock = useCallback(
    (id: ID) => {
      commit((d) => removeSubtree(d, id));
      setSelectedId((current) => (current === id ? null : current));
    },
    [commit],
  );

  const duplicateBlock = useCallback(
    (id: ID) => {
      if (!doc) return;
      const result = duplicateSubtree(doc, id);
      if (!result.newId) return;
      setSelectedId(result.newId);
      setHistory((h) => pushHistory(h, stamp(result.doc)));
    },
    [doc],
  );

  const moveBlockUpDown = useCallback(
    (id: ID, delta: -1 | 1) => commit((d) => shiftBlock(d, id, delta)),
    [commit],
  );

  /** Structural move used by the outline panel (drag & drop). */
  const moveBlockTo = useCallback(
    (id: ID, parentId: ID, index: number) => {
      if (!doc) return false;
      const reason = checkMove(doc, id, { parentId, index });
      if (reason) {
        notify(t(`reason${reason}` as Parameters<typeof t>[0]), 'error');
        return false;
      }
      commit((d) => {
        const result = moveBlock(d, id, { parentId, index });
        return result.ok ? result.doc : d;
      });
      return true;
    },
    [commit, doc, notify, t],
  );

  const promote = useCallback((id: ID) => commit((d) => promoteBlock(d, id)), [commit]);

  const demote = useCallback((id: ID) => commit((d) => demoteBlock(d, id)), [commit]);

  const setPairWeight = useCallback(
    (aId: ID, bId: ID, aWeight: number, bWeight?: number, size?: Size) =>
      commit((d) => {
        const next = pairWeights(d, aId, bId, aWeight, bWeight);
        if (!size) return next;
        return {
          ...next,
          size: {
            w: Math.max(MIN_ROOT_W, Math.round(size.w)),
            h: Math.max(MIN_ROOT_H, Math.round(size.h)),
          },
        };
      }),
    [commit],
  );

  const collapseAll = useCallback(
    (collapsed: boolean) => commit((d) => collapseAllBlocks(d, collapsed)),
    [commit],
  );

  const switchTemplate = useCallback(
    (id: TemplateId) => {
      if (!doc) return [];
      const result = applyTemplate(doc, id);
      setHistory((h) => pushHistory(h, stamp(result.doc)));
      return result.changes;
    },
    [doc],
  );

  const addRelation = useCallback(
    (from: ID, to: ID, kind: RelationKind = 'dep', label?: string) => {
      if (!from || !to || from === to) return;
      commit((d) => {
        if (d.relations.some((r) => r.from === from && r.to === to)) return d;
        const relation: Relation = { id: uid('r'), from, to, kind };
        if (label?.trim()) relation.label = label.trim();
        return { ...d, relations: [...d.relations, relation] };
      });
    },
    [commit],
  );

  const patchRelation = useCallback(
    (id: ID, patch: Partial<Relation>) =>
      commit((d) => ({
        ...d,
        relations: d.relations.map((rel) => (rel.id === id ? { ...rel, ...patch } : rel)),
      })),
    [commit],
  );

  const removeRelation = useCallback(
    (id: ID) => commit((d) => ({ ...d, relations: d.relations.filter((r) => r.id !== id) })),
    [commit],
  );

  /** Shared parser: pop_diagram text, fenced blocks and JSON backups. */
  const parseIncoming = useCallback(
    (text: string, filename: string): DiagramDoc | null => {
      if (text.length > MAX_FILE) {
        notify(t('fileTooLarge'), 'error');
        return null;
      }
      try {
        if (text.trimStart().startsWith('{')) return fromJson(text);
        let source = text;
        const fence = /```pop_diagram\s*\n([\s\S]*?)```/.exec(text);
        if (fence) source = fence[1];
        const result = tryParsePop(source);
        if (!result.ok) {
          notify(`${t('importFailed')} · L${result.error.line}: ${result.error.message}`, 'error');
          return null;
        }
        return result.doc;
      } catch (error) {
        notify(
          `${t('importFailed')} · ${error instanceof Error ? error.message : filename}`,
          'error',
        );
        return null;
      }
    },
    [notify, t],
  );

  const importText = useCallback(
    async (text: string, filename: string) => {
      let parsed = parseIncoming(text, filename);
      if (!parsed) return false;

      const issues = validateDoc(parsed);
      if (issues.length) {
        const ok = await askConfirm(t('templateSwitch'), t('dialogRepair'));
        if (!ok) return false;
        parsed = applyTemplate(parsed, parsed.meta.template).doc;
      }
      resetDoc(parsed);
      notify(t('imported'));
      return true;
    },
    [askConfirm, notify, parseIncoming, resetDoc, t],
  );

  /**
   * Source view → canvas: parse, optionally repair against the template, then
   * push onto the undo stack (unlike import, this edits the open project).
   */
  const applySource = useCallback(
    async (text: string) => {
      if (!doc) return false;
      if (text.length > MAX_FILE) {
        notify(t('fileTooLarge'), 'error');
        return false;
      }
      const result = tryParsePop(text);
      if (!result.ok) {
        notify(`${t('parseError')} · L${result.error.line}: ${result.error.message}`, 'error');
        return false;
      }
      let next = result.doc;
      if (validateDoc(next).length) {
        const ok = await askConfirm(t('repairSource'), t('dialogRepair'));
        if (!ok) return false;
        next = applyTemplate(next, next.meta.template).doc;
      }
      commit(() => withDefaultSize(next));
      setSelectedId(null);
      notify(t('applied'));
      return true;
    },
    [askConfirm, commit, doc, notify, t],
  );

  const importProject = useCallback(
    async (text: string, filename: string) => {
      let parsed = parseIncoming(text, filename);
      if (!parsed) return false;
      if (validateDoc(parsed).length) parsed = applyTemplate(parsed, parsed.meta.template).doc;
      const name = filename.replace(/\.[^.]+$/, '') || parsed.meta.title;
      const project = makeProject(parsed, name, projects);
      setLibrary((prev) => ({ ...prev, projects: upsertProject(prev.projects, project) }));
      setActiveId(project.id);
      resetDoc(parsed);
      setView('canvas');
      notify(t('projectCreated'));
      return true;
    },
    [notify, parseIncoming, projects, resetDoc, t],
  );

  const newProject = useCallback(
    (template: TemplateId) => {
      const next = getTemplate(template).createDemo(locale);
      const project = makeProject(next, next.meta.title, projects);
      setLibrary((prev) => ({ ...prev, projects: upsertProject(prev.projects, project) }));
      setActiveId(project.id);
      resetDoc(next);
      setView('canvas');
      notify(t('projectCreated'));
    },
    [locale, notify, projects, resetDoc, t],
  );

  const issues = useMemo(() => (doc ? validateDoc(doc) : []), [doc]);

  return {
    doc,
    locale,
    projects,
    trash,
    activeProjectId,
    selectedId,
    view,
    zoom,
    pan,
    fitMode,
    applyFit,
    toasts,
    confirm,
    askConfirm,
    answerConfirm,
    issues,
    savedAt,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    fitSignal,
    t,
    setLocale: setLocaleState,
    setView,
    setZoom,
    zoomIn,
    zoomOut,
    setPan,
    requestFit,
    select: setSelectedId,
    notify,
    createFromTemplate,
    commit,
    setTitle,
    patchBlock,
    patchLayout,
    patchSkin,
    addBlock,
    addLayout,
    addSibling,
    removeBlock,
    duplicateBlock,
    moveBlockUpDown,
    moveBlockTo,
    promote,
    demote,
    setPairWeight,
    setDocSize,
    collapseAll,
    switchTemplate,
    addRelation,
    patchRelation,
    removeRelation,
    importText,
    applySource,
    newProject,
    openProject,
    renameProject,
    duplicateProject,
    deleteProject,
    restoreProject,
    purgeProject,
    emptyTrash,
    importProject,
    undo,
    redo,
  };
}
