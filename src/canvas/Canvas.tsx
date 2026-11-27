import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  CornerDownRight,
  FileCode2,
  Maximize,
  Minus,
  Plus,
  Trash2,
} from 'lucide-react';
import type { BlockNode, ID, Rect, Size } from '../model/types';
import type { Editor } from '../model/store';
import { blockAtPoint, layoutDoc, MIN_ROOT_H, MIN_ROOT_W, type BlockEntry } from '../layout/dispatch';
import { buildEdges } from '../layout/edges';
import { headerOf, paddingOf } from '../layout/registry';
import { checkMove, findBlock, findParent, isDescendant, moveBlock, pairWeights, tradeWeights, type ReasonCode } from '../model/tree';
import { SKIN_LABELS } from '../i18n/labels';
import { ARROW_DIRECTIONS, nextBlockInDirection } from './navigate';
import { buildAllSplitters, type Splitter } from './splitters';
import { clampZoom, fitView } from '../model/zoom';
import { BlockView } from './BlockView';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';

interface DragState {
  id: ID;
  sx: number;
  sy: number;
  active: boolean;
  point: { x: number; y: number };
  targetParent: ID | null;
  targetIndex: number;
  indicator: Rect | null;
  valid: boolean;
  reason: ReasonCode | null;
}

interface DropPlan {
  parentId: ID;
  index: number;
  indicator: Rect;
  valid: boolean;
  reason: ReasonCode | null;
}

interface SplitDrag {
  splitter: Splitter;
  /** Screen-space pointer start: pan/zoom shifts during the drag must not feed back. */
  startClientX: number;
  startClientY: number;
  aWeight: number;
  bWeight: number;
  previewA: number;
  previewB: number;
  /** Root size at the start of the drag; kept so the preview never compounds. */
  startSize: Size | null;
  /** Pair parent's size along the axis at the start of the drag. */
  parentSize: number;
  /** Root size to apply together with the weights (only when the pair grew). */
  previewSize: Size | null;
  /** Pan at the start, and the pan currently applied by the preview. */
  startPanX: number;
  startPanY: number;
  previewPanX: number;
  previewPanY: number;
}

interface ResizeDrag {
  dir: 'n' | 'e' | 's' | 'w';
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  /** Pan at the start, so west/north resizes can keep the opposite edge fixed. */
  startPanX: number;
  startPanY: number;
  w: number;
  h: number;
}


/** Pixels the root spends on padding + header along the axis. */
function rootFixedOf(block: BlockNode, axis: 'x' | 'y'): number {
  const pad = paddingOf(block);
  const head = headerOf(block);
  return axis === 'x' ? pad.x * 2 + head.gutter : pad.y * 2 + head.h;
}

/** Weights can be fractional after a splitter drag; hide a trailing ".0". */
function formatWeight(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function Canvas({ editor }: { editor: Editor }) {
  const { doc, selectedId, zoom, pan, fitSignal, t } = editor;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [splitDrag, setSplitDrag] = useState<SplitDrag | null>(null);
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag | null>(null);
  const [panning, setPanning] = useState(false);
  /** Container whose dividers are revealed (pointer is inside its range). */
  const [hoverContainerId, setHoverContainerId] = useState<ID | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const splitRef = useRef<SplitDrag | null>(null);
  const resizeRef = useRef<ResizeDrag | null>(null);
  const panRef = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const ctx = useContextMenu();

  dragRef.current = drag;

  /**
   * Live preview while dragging: splitter weights (plus any root size growth the
   * trade needed) or the root frame size. Nothing is committed until release.
   */
  const previewDoc = useMemo(() => {
    if (!doc) return doc;
    if (resizeDrag) {
      return { ...doc, size: { w: resizeDrag.w, h: resizeDrag.h } };
    }
    if (!splitDrag) return doc;
    const weightsChanged =
      splitDrag.previewA !== splitDrag.aWeight || splitDrag.previewB !== splitDrag.bWeight;
    if (!weightsChanged && !splitDrag.previewSize) return doc;
    let next = weightsChanged
      ? pairWeights(
          doc,
          splitDrag.splitter.aId,
          splitDrag.splitter.bId,
          splitDrag.previewA,
          splitDrag.previewB,
        )
      : doc;
    if (splitDrag.previewSize) next = { ...next, size: splitDrag.previewSize };
    return next;
  }, [doc, resizeDrag, splitDrag]);

  const layout = useMemo(() => (previewDoc ? layoutDoc(previewDoc) : null), [previewDoc]);
  const edges = useMemo(
    () => (previewDoc && layout ? buildEdges(previewDoc, layout.rects) : []),
    [previewDoc, layout],
  );

  /** Latest values for observers that must not re-subscribe on every render. */
  const liveRef = useRef({ layout, editor, zoom, pan });
  liveRef.current = { layout, editor, zoom, pan };

  /** Dividers between every pair of adjacent children in every linear container. */
  const splitters = useMemo(() => buildAllSplitters(layout), [layout]);

  const toContent = useCallback(
    (clientX: number, clientY: number) => {
      const wrap = wrapRef.current;
      if (!wrap) return { x: 0, y: 0 };
      const box = wrap.getBoundingClientRect();
      return {
        x: (clientX - box.left - pan.x) / zoom,
        y: (clientY - box.top - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom],
  );

  /* ---------------------------------------------------------------- zoom fit */

  useEffect(() => {
    if (!layout || !wrapRef.current) return;
    const box = wrapRef.current.getBoundingClientRect();
    if (box.width < 40 || box.height < 40) return;
    const fit = fitView(layout.bounds, box);
    editor.applyFit(fit.zoom, fit.pan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  /**
   * Splitting the IDE pane (or rotating a tablet) changes the viewport without a
   * page reload; while in fit mode the diagram follows the new size instead of
   * staying at a stale zoom.
   */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (!liveRef.current.editor.fitMode) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const current = liveRef.current;
        if (!current.editor.fitMode || !current.layout) return;
        const box = wrap.getBoundingClientRect();
        if (box.width < 40 || box.height < 40) return;
        const fit = fitView(current.layout.bounds, box);
        const settled =
          Math.abs(fit.zoom - current.zoom) < 0.005 &&
          Math.abs(fit.pan.x - current.pan.x) < 0.5 &&
          Math.abs(fit.pan.y - current.pan.y) < 0.5;
        if (settled) return;
        current.editor.applyFit(fit.zoom, fit.pan);
      });
    });
    observer.observe(wrap);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  /* ----------------------------------------------------------------- wheel */

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = wrap.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        // Pinch on a trackpad arrives as ctrl+wheel; zoom around the pointer.
        const px = event.clientX - box.left;
        const py = event.clientY - box.top;
        const factor = Math.exp(-event.deltaY * 0.0016);
        const next = clampZoom(zoom * factor);
        const ratio = next / zoom;
        editor.setZoom(next);
        editor.setPan({
          x: px - (px - pan.x) * ratio,
          y: py - (py - pan.y) * ratio,
        });
        return;
      }
      // Plain scrolling pans, matching trackpad conventions in canvas tools.
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1;
      editor.setPan({ x: pan.x - event.deltaX * unit, y: pan.y - event.deltaY * unit });
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [editor, pan.x, pan.y, zoom]);

  /* ------------------------------------------------------------ drop logic */

  const planDrop = useCallback(
    (dragId: ID, x: number, y: number): DropPlan | null => {
      if (!doc || !layout) return null;
      const hit = blockAtPoint(layout, x, y) as BlockEntry | null;
      let parent: BlockEntry | null = null;
      if (hit) {
        if (hit.block.layout.kind === 'leaf' || hit.block.layout.kind === 'spacer') {
          const parentBlock = findParent(doc.root, hit.block.id);
          parent = parentBlock ? layout.byId[parentBlock.id] ?? null : null;
        } else {
          parent = hit;
        }
      }
      const anchor = parent ?? layout.byId[doc.root.id];
      if (!anchor) return null;

      // A block and everything inside it is inert while dragging: no target ring,
      // no insert line, and dropping there is a plain no-op.
      const dragged = findBlock(doc.root, dragId);
      if (!dragged) return null;
      if (anchor.block.id === dragId || isDescendant(dragged, anchor.block.id)) return null;

      const children = anchor.block.children;
      const axis =
        anchor.block.layout.kind === 'linear'
          ? anchor.block.layout.axis ?? 'y'
          : 'y';
      let index = 0;
      for (const child of children) {
        const rect = layout.rects[child.id];
        if (!rect) continue;
        const center = axis === 'x' ? rect.x + rect.w / 2 : rect.y + rect.h / 2;
        const value = axis === 'x' ? x : y;
        if (center < value) index += 1;
      }
      if (anchor.block.layout.kind === 'stack') index = children.length;

      let reason: ReasonCode | null = checkMove(doc, dragId, {
        parentId: anchor.block.id,
        index,
      });

      const rects = children
        .map((c) => layout.rects[c.id])
        .filter((r): r is Rect => Boolean(r));
      let indicator: Rect;
      if (rects.length === 0) {
        const pad = 12;
        indicator = {
          x: anchor.rect.x + pad,
          y: anchor.rect.y + pad,
          w: Math.max(24, anchor.rect.w - pad * 2),
          h: 2,
        };
      } else if (axis === 'x') {
        const xs = rects.map((r) => r.x + r.w / 2);
        const top = Math.min(...rects.map((r) => r.y));
        const bottom = Math.max(...rects.map((r) => r.y + r.h));
        const left = index === 0 ? rects[0].x - 4 : rects[Math.min(index, rects.length) - 1]?.x;
        const right =
          index >= rects.length
            ? Math.max(...rects.map((r) => r.x + r.w)) + 4
            : rects[Math.min(index, rects.length)].x - 4;
        const bx = index === 0 ? left ?? rects[0].x : right ?? 0;
        void xs;
        indicator = { x: bx, y: top - 2, w: 2, h: bottom - top + 4 };
      } else {
        const left = Math.min(...rects.map((r) => r.x));
        const right = Math.max(...rects.map((r) => r.x + r.w));
        const by =
          index === 0
            ? rects[0].y - 4
            : index >= rects.length
              ? rects[rects.length - 1].y + rects[rects.length - 1].h + 4
              : rects[index].y - 4;
        indicator = { x: left, y: by, w: Math.max(24, right - left), h: 2 };
      }

      return {
        parentId: anchor.block.id,
        index,
        indicator,
        valid: reason === null,
        reason,
      };
    },
    [doc, layout],
  );

  /* -------------------------------------------------------- pointer events */

  const onBlockPointerDown = useCallback(
    (event: React.PointerEvent, id: ID) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      editor.select(id);
      setDrag({
        id,
        sx: event.clientX,
        sy: event.clientY,
        active: false,
        point: toContent(event.clientX, event.clientY),
        targetParent: null,
        targetIndex: 0,
        indicator: null,
        valid: false,
        reason: null,
      });
    },
    [editor, toContent],
  );

  const onBlockSelect = useCallback((id: ID) => editor.select(id), [editor]);

  /** Arrow keys walk between blocks in spatial order: keep selection in sync, not just focus. */
  const focusBlock = useCallback(
    (id: ID) => {
      editor.select(id);
      wrapRef.current?.querySelector<HTMLElement>(`[data-block-id="${id}"]`)?.focus();
    },
    [editor],
  );

  const onStageKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Alt/Cmd arrows are app-level shortcuts (reorder, promote), not navigation.
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      const el = (event.target as HTMLElement).closest?.('[data-block-id]');
      if (!(el instanceof HTMLElement)) return;
      const fromId = el.dataset.blockId;
      if (!fromId) return;

      // Enter appends a sibling after the focused block and keeps focus in the canvas.
      if (event.key === 'Enter') {
        event.preventDefault();
        const created = editor.addSibling();
        if (created) window.requestAnimationFrame(() => focusBlock(created));
        return;
      }

      // Tab dives into the first child instead of leaving the canvas.
      if (event.key === 'Tab' && !event.shiftKey && editor.doc) {
        const node = findBlock(editor.doc.root, fromId);
        const first = node?.children[0];
        if (!first) return;
        event.preventDefault();
        if (node.collapsed) editor.patchBlock(fromId, { collapsed: false });
        window.requestAnimationFrame(() => focusBlock(first.id));
        return;
      }

      const direction = ARROW_DIRECTIONS[event.key];
      if (!direction || !layout) return;
      const nextId = nextBlockInDirection(layout.rects, fromId, direction);
      if (!nextId) return;
      event.preventDefault();
      focusBlock(nextId);
    },
    [editor, focusBlock, layout],
  );

  const onBlockToggleCollapse = useCallback(
    (id: ID) => {
      const node = layout?.byId[id]?.block;
      if (!node || !node.children.length) return;
      if (node.layout.kind === 'leaf' || node.layout.kind === 'spacer') return;
      editor.patchBlock(id, { collapsed: !node.collapsed });
    },
    [editor, layout],
  );

  const onBackgroundPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      editor.select(null);
      setPanning(true);
      panRef.current = { x: pan.x, y: pan.y, sx: event.clientX, sy: event.clientY };
    },
    [editor, pan.x, pan.y],
  );

  /**
   * Dividers stay hidden until the pointer is inside their container, so the
   * diagram stays clean; the grip is then a short, obvious handle.
   */
  const onCanvasPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!layout || !doc) return;
      if (drag || splitDrag || resizeDrag || panning) return;
      const point = toContent(event.clientX, event.clientY);
      const hit = blockAtPoint(layout, point.x, point.y);
      let containerId: ID;
      if (!hit) {
        containerId = doc.root.id;
      } else {
        const own = hit.block.layout.kind === 'linear' && hit.block.children.length >= 2;
        containerId = own ? hit.block.id : (hit.parentId ?? doc.root.id);
      }
      setHoverContainerId((current) => (current === containerId ? current : containerId));
    },
    [doc, drag, layout, panning, resizeDrag, splitDrag, toContent],
  );

  /** Right-click on a block: the structural actions, without leaving the canvas. */
  const openBlockMenu = useCallback(
    (event: React.MouseEvent, id: ID) => {
      if (!doc) return;
      const node = findBlock(doc.root, id);
      if (!node) return;
      editor.select(id);
      const isRoot = doc.root.id === id;
      const canHost = node.layout.kind !== 'leaf' && node.layout.kind !== 'spacer';
      const toggleLabel = node.collapsed ? t('expand') : t('collapse');
      ctx.open(event, [
        {
          id: 'child',
          label: t('addChild'),
          icon: Plus,
          disabled: !canHost,
          onSelect: () => {
            const created = editor.addBlock('container', id);
            if (created) window.requestAnimationFrame(() => focusBlock(created));
          },
        },
        {
          id: 'sibling',
          label: t('addSibling'),
          icon: CornerDownRight,
          disabled: isRoot,
          onSelect: () => {
            editor.select(id);
            const created = editor.addSibling();
            if (created) window.requestAnimationFrame(() => focusBlock(created));
          },
        },
        {
          id: 'duplicate',
          label: t('duplicate'),
          icon: Copy,
          disabled: isRoot,
          onSelect: () => editor.duplicateBlock(id),
        },
        {
          id: 'up',
          label: t('moveUp'),
          icon: ArrowUp,
          disabled: isRoot,
          onSelect: () => editor.moveBlockUpDown(id, -1),
        },
        {
          id: 'down',
          label: t('moveDown'),
          icon: ArrowDown,
          disabled: isRoot,
          onSelect: () => editor.moveBlockUpDown(id, 1),
        },
        {
          id: 'collapse',
          label: toggleLabel,
          icon: node.collapsed ? ChevronsUpDown : ChevronsDownUp,
          disabled: !canHost || node.children.length === 0,
          onSelect: () => editor.patchBlock(id, { collapsed: !node.collapsed }),
        },
        {
          id: 'remove',
          label: t('remove'),
          icon: Trash2,
          danger: true,
          disabled: isRoot,
          onSelect: () => {
            void editor.askConfirm(t('confirmDelete'), t('remove'), true).then((ok) => {
              if (ok) editor.removeBlock(id);
            });
          },
        },
      ]);
    },
    [ctx, doc, editor, focusBlock, t],
  );

  /** Right-click on empty canvas: view-level commands. */
  const openCanvasMenu = useCallback(
    (event: React.MouseEvent) => {
      ctx.open(event, [
        { id: 'fit', label: t('fit'), icon: Maximize, onSelect: editor.requestFit },
        { id: 'actual', label: t('zoomActual'), onSelect: () => editor.setZoom(1) },
        { id: 'text', label: t('viewText'), icon: FileCode2, onSelect: () => editor.setView('text') },
      ]);
    },
    [ctx, editor, t],
  );

  /** Splitter drag trades size between two adjacent siblings; committed on release. */
  const onSplitterPointerDown = useCallback(
    (event: React.PointerEvent, splitter: Splitter) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      const parentRect = layout?.byId[splitter.parentId]?.rect;
      const next: SplitDrag = {
        splitter,
        startClientX: event.clientX,
        startClientY: event.clientY,
        aWeight: splitter.aWeight,
        bWeight: splitter.bWeight,
        previewA: splitter.aWeight,
        previewB: splitter.bWeight,
        startSize: doc?.size ? { ...doc.size } : null,
        parentSize: parentRect
          ? splitter.axis === 'x'
            ? parentRect.w
            : parentRect.h
          : 0,
        previewSize: null,
        startPanX: pan.x,
        startPanY: pan.y,
        previewPanX: pan.x,
        previewPanY: pan.y,
      };
      splitRef.current = next;
      setSplitDrag(next);
    },
    [doc, layout, pan.x, pan.y],
  );

  /** Root frame handles: drag the right/bottom edges or the corner. */
  const onRootHandlePointerDown = useCallback(
    (event: React.PointerEvent, dir: ResizeDrag['dir']) => {
      if (event.button !== 0 || !doc?.size) return;
      event.stopPropagation();
      event.preventDefault();
      const next: ResizeDrag = {
        dir,
        startX: event.clientX,
        startY: event.clientY,
        startW: doc.size.w,
        startH: doc.size.h,
        startPanX: pan.x,
        startPanY: pan.y,
        w: doc.size.w,
        h: doc.size.h,
      };
      resizeRef.current = next;
      setResizeDrag(next);
    },
    [doc, pan.x, pan.y],
  );

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (current) {
        const dx = event.clientX - current.sx;
        const dy = event.clientY - current.sy;
        const active = current.active || Math.hypot(dx, dy) > 4;
        const point = toContent(event.clientX, event.clientY);
        if (!active) {
          setDrag({ ...current, active, point });
          return;
        }
        const plan = planDrop(current.id, point.x, point.y);
        setDrag({
          ...current,
          active,
          point,
          targetParent: plan?.parentId ?? null,
          targetIndex: plan?.index ?? 0,
          indicator: plan?.indicator ?? null,
          valid: plan?.valid ?? false,
          reason: plan?.reason ?? null,
        });
        return;
      }

      const resize = resizeRef.current;
      if (resize) {
        const dx = (event.clientX - resize.startX) / zoom;
        const dy = (event.clientY - resize.startY) / zoom;
        let w = resize.startW;
        let h = resize.startH;
        if (resize.dir === 'e') w = Math.max(MIN_ROOT_W, Math.round(resize.startW + dx));
        if (resize.dir === 'w') w = Math.max(MIN_ROOT_W, Math.round(resize.startW - dx));
        if (resize.dir === 's') h = Math.max(MIN_ROOT_H, Math.round(resize.startH + dy));
        if (resize.dir === 'n') h = Math.max(MIN_ROOT_H, Math.round(resize.startH - dy));
        if (w !== resize.w || h !== resize.h) {
          const next = { ...resize, w, h };
          resizeRef.current = next;
          setResizeDrag(next);
        }
        // Resizing from the west/north edge must move the frame's origin, so shift
        // the view by the same amount and keep the opposite edge visually fixed.
        if (resize.dir === 'w') {
          editor.setPan({ x: resize.startPanX + (resize.startW - w) * zoom, y: resize.startPanY });
        } else if (resize.dir === 'n') {
          editor.setPan({ x: resize.startPanX, y: resize.startPanY + (resize.startH - h) * zoom });
        }
        return;
      }

      const split = splitRef.current;
      if (split) {
        // Measure in screen space: the frame shifts during the drag, but the
        // pointer-to-share mapping must stay 1:1.
        const pixel =
          split.splitter.axis === 'x'
            ? event.clientX - split.startClientX
            : event.clientY - split.startClientY;
        const delta = pixel / Math.max(0.001, split.splitter.unit * zoom);
        const canGrow = Boolean(split.splitter.canGrow && split.startSize && doc);
        let traded = tradeWeights(split.aWeight, split.bWeight, delta);
        const gained = traded.a + traded.b - (split.aWeight + split.bWeight);
        if (gained > 0.001 && !canGrow) {
          // No frame growth available: clamp to a pure trade so nobody shrinks.
          const total = split.aWeight + split.bWeight;
          const nextA = Math.min(total - 1, Math.max(1, split.aWeight + delta));
          traded = {
            a: Math.round(nextA * 10) / 10,
            b: Math.round((total - nextA) * 10) / 10,
          };
        }
        let previewSize: Size | null = null;
        if (gained > 0.001 && canGrow && split.startSize && doc) {
          // Keep the size-1 neighbour intact by growing the root frame instead.
          const gain = split.splitter.unit * gained;
          const fixed = rootFixedOf(doc.root, split.splitter.axis);
          const startMain =
            split.splitter.axis === 'x' ? split.startSize.w : split.startSize.h;
          // The root is `content + padding`, nested containers are pure shares.
          const denominator =
            split.splitter.parentId === doc.root.id
              ? Math.max(1, startMain - fixed)
              : Math.max(1, split.parentSize);
          const ratio = 1 + gain / denominator;
          const content = Math.max(1, startMain - fixed);
          if (split.splitter.axis === 'x') {
            previewSize = { ...split.startSize, w: Math.round(content * ratio + fixed) };
          } else {
            previewSize = { ...split.startSize, h: Math.round(content * ratio + fixed) };
          }
        }
        // Grow toward the drag direction: when the compressed neighbour is the
        // start-side block, expand the frame to the top/left (opposite edge fixed).
        let previewPanX = split.startPanX;
        let previewPanY = split.startPanY;
        if (previewSize && split.startSize) {
          const growth =
            split.splitter.axis === 'x'
              ? previewSize.w - split.startSize.w
              : previewSize.h - split.startSize.h;
          const grewA = traded.a > split.aWeight + 1e-6;
          const grewB = traded.b > split.bWeight + 1e-6;
          if (growth > 0.5 && grewB && !grewA) {
            if (split.splitter.axis === 'x') previewPanX = split.startPanX - growth * zoom;
            else previewPanY = split.startPanY - growth * zoom;
          }
        }
        const panChanged =
          previewPanX !== split.previewPanX || previewPanY !== split.previewPanY;
        if (
          traded.a !== split.previewA ||
          traded.b !== split.previewB ||
          previewSize !== split.previewSize ||
          panChanged
        ) {
          const next = {
            ...split,
            previewA: traded.a,
            previewB: traded.b,
            previewSize,
            previewPanX,
            previewPanY,
          };
          splitRef.current = next;
          setSplitDrag(next);
        }
        if (panChanged) editor.setPan({ x: previewPanX, y: previewPanY });
        return;
      }

      const panning = panRef.current;
      if (panning) {
        editor.setPan({
          x: panning.x + (event.clientX - panning.sx),
          y: panning.y + (event.clientY - panning.sy),
        });
      }
    };

    const up = (event: PointerEvent) => {
      const current = dragRef.current;
      if (current) {
        if (current.active && doc) {
          const point = toContent(event.clientX, event.clientY);
          const plan = planDrop(current.id, point.x, point.y);
          if (plan && plan.valid) {
            editor.commit((d) => {
              const result = moveBlock(d, current.id, {
                parentId: plan.parentId,
                index: plan.index,
              });
              return result.ok ? result.doc : d;
            });
            editor.select(current.id);
          } else if (plan?.reason && plan.reason !== 'NO_CHANGE') {
            editor.notify(t(`reason${plan.reason}` as Parameters<typeof t>[0]), 'error');
          }
        }
        setDrag(null);
      }

      const split = splitRef.current;
      if (split) {
        splitRef.current = null;
        setSplitDrag(null);
        const weightsChanged =
          split.previewA !== split.aWeight || split.previewB !== split.bWeight;
        if (weightsChanged || split.previewSize) {
          editor.setPairWeight(
            split.splitter.aId,
            split.splitter.bId,
            split.previewA,
            split.previewB,
            split.previewSize ?? undefined,
          );
        }
      }

      const resize = resizeRef.current;
      if (resize) {
        resizeRef.current = null;
        setResizeDrag(null);
        if (resize.w !== resize.startW || resize.h !== resize.startH) {
          editor.setDocSize({ w: resize.w, h: resize.h });
        } else if (resize.dir === 'w' || resize.dir === 'n') {
          editor.setPan({ x: resize.startPanX, y: resize.startPanY });
        }
      }

      panRef.current = null;
      setPanning(false);
    };

    /**
     * A lost pointerup (released outside the window, OS dialog, tab blur) leaves a
     * phantom drag that would move a block on the next hover, so cancellation is
     * wired to pointercancel and window blur as well.
     */
    const cancel = () => {
      const split = splitRef.current;
      if (split && (split.previewPanX !== split.startPanX || split.previewPanY !== split.startPanY)) {
        editor.setPan({ x: split.startPanX, y: split.startPanY });
      }
      const resize = resizeRef.current;
      if (resize && (resize.dir === 'w' || resize.dir === 'n')) {
        editor.setPan({ x: resize.startPanX, y: resize.startPanY });
      }
      dragRef.current = null;
      splitRef.current = null;
      resizeRef.current = null;
      panRef.current = null;
      setPanning(false);
      setDrag(null);
      setSplitDrag(null);
      setResizeDrag(null);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [doc, editor, layout, planDrop, t, toContent, zoom]);

  /* -------------------------------------------------------------- rendering */

  if (!doc || !layout) {
    return <div className="canvas-wrap" ref={wrapRef} />;
  }

  /** The handle follows the live preview, so the ratio badge stays on the boundary. */
  const activeSplitter = splitDrag
    ? (splitters.find((item) => item.key === splitDrag.splitter.key) ?? splitDrag.splitter)
    : null;

  const rootRect = layout.byId[doc.root.id]?.rect ?? layout.bounds;

  return (
    <div
      className={`canvas-wrap${panning ? ' is-panning' : ''}`}
      ref={wrapRef}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerLeave={() => setHoverContainerId(null)}
      onContextMenu={openCanvasMenu}
    >
      <div className="grid-bg" />
      <div
        className={`stage${splitDrag || resizeDrag ? ' is-resizing' : ''}`}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        onKeyDown={onStageKeyDown}
      >
        <svg className="edges" width="1" height="1">
          {edges.map((edge) => (
            <g key={edge.id}>
              <path
                d={edge.d}
                fill="none"
                stroke="#6B6478"
                strokeWidth={1.4}
                strokeDasharray={edge.dashed ? '5 4' : undefined}
                opacity={0.8}
                markerEnd="url(#edge-arrow)"
              />
              {edge.label ? (
                <>
                  <rect
                    x={edge.label.x - (edge.label.text.length * 7 + 12) / 2}
                    y={edge.label.y - 9}
                    width={edge.label.text.length * 7 + 12}
                    height={18}
                    rx={9}
                    fill="#F7F2E9"
                    opacity={0.95}
                  />
                  <text x={edge.label.x} y={edge.label.y + 3.5} textAnchor="middle" fontSize={10} fill="#4A4456">
                    {edge.label.text}
                  </text>
                </>
              ) : null}
            </g>
          ))}
          <defs>
            <marker id="edge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6B6478" />
            </marker>
          </defs>
        </svg>

        {layout.entries.map((entry) => (
          <BlockView
            key={entry.block.id}
            entry={entry}
            selected={entry.block.id === selectedId}
            showRing={entry.block.id !== doc.root.id}
            isTarget={drag?.active === true && drag.targetParent === entry.block.id}
            dragging={drag?.active === true && drag.id === entry.block.id}
            label={`${t(SKIN_LABELS[entry.block.skin.kind])}${
              editor.locale === 'zh' ? '：' : ': '
            }${entry.block.title || t('untitled')}`}
            onPointerDown={onBlockPointerDown}
            onDoubleClick={onBlockToggleCollapse}
            onSelect={onBlockSelect}
            onToggleCollapse={onBlockToggleCollapse}
            onContextMenu={openBlockMenu}
          />
        ))}

        {splitters.map((splitter) => (
          <div
            key={splitter.key}
            className={`splitter is-${splitter.axis}${
              splitDrag?.splitter.key === splitter.key ? ' is-active' : ''
            }${splitter.parentId === hoverContainerId ? ' is-visible' : ''}`}
            style={{ left: splitter.x, top: splitter.y, width: splitter.w, height: splitter.h }}
            onPointerDown={(event) => onSplitterPointerDown(event, splitter)}
            tabIndex={0}
            onKeyDown={(event) => {
              const grow = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
              const shrink = event.key === 'ArrowDown' || event.key === 'ArrowRight';
              if (!grow && !shrink) return;
              event.preventDefault();
              event.stopPropagation();
              const step = event.shiftKey ? 2 : 1;
              const traded = tradeWeights(splitter.aWeight, splitter.bWeight, grow ? step : -step);
              editor.setPairWeight(splitter.aId, splitter.bId, traded.a, traded.b);
            }}
            role="separator"
            aria-orientation={splitter.axis === 'x' ? 'vertical' : 'horizontal'}
            aria-label={t('splitterHint')}
            title={t('splitterHint')}
          />
        ))}

        {splitDrag && activeSplitter ? (
          <div
            className="splitter-badge"
            style={{
              left: activeSplitter.x + activeSplitter.w / 2,
              top: activeSplitter.y + activeSplitter.h / 2,
            }}
          >
            {formatWeight(splitDrag.previewA)} : {formatWeight(splitDrag.previewB)}
          </div>
        ) : null}

        {drag?.indicator ? (
          <div
            className={`insert-line${drag.valid ? '' : ' is-invalid'}`}
            style={{
              left: drag.indicator.x - 1,
              top: drag.indicator.y - 1,
              width: Math.max(2, drag.indicator.w),
              height: Math.max(2, drag.indicator.h),
            }}
          />
        ) : null}
      </div>

      {/* Root size grips: only while the root itself is selected, as short lines. */}
      {selectedId === doc.root.id ? (
        <div
          className="root-frame is-active"
          style={{
            left: pan.x + rootRect.x * zoom,
            top: pan.y + rootRect.y * zoom,
            width: rootRect.w * zoom,
            height: rootRect.h * zoom,
          }}
        >
          {(['n', 'e', 's', 'w'] as const).map((dir) => (
            <div
              key={dir}
              className={`root-handle is-${dir}`}
              role="separator"
              aria-orientation={dir === 'n' || dir === 's' ? 'horizontal' : 'vertical'}
              aria-label={t('resizeRoot')}
              title={t('resizeRoot')}
              onPointerDown={(event) => onRootHandlePointerDown(event, dir)}
            />
          ))}
          {resizeDrag ? (
            <div className="root-size-badge">
              {resizeDrag.w} × {resizeDrag.h}
            </div>
          ) : null}
        </div>
      ) : null}

      {drag?.active && drag.reason && drag.reason !== 'NO_CHANGE' ? (
        <div
          className="drag-reason"
          style={{
            left: drag.point.x * zoom + pan.x + 14,
            top: drag.point.y * zoom + pan.y + 14,
          }}
        >
          {t(`reason${drag.reason}` as Parameters<typeof t>[0])}
        </div>
      ) : null}

      <div className="canvas-hint">{t('dragHint')}</div>

      <div className="zoom-controls" title={t('zoomHint')}>
        <button
          type="button"
          className="icon-btn"
          onClick={() => editor.zoomOut()}
          title={t('zoomOut')}
        >
          <Minus size={15} strokeWidth={1.9} />
        </button>
        <button type="button" className="zoom-value" onClick={editor.requestFit} title={t('fit')}>
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => editor.zoomIn()}
          title={t('zoomIn')}
        >
          <Plus size={15} strokeWidth={1.9} />
        </button>
      </div>

      {ctx.menu ? <ContextMenu menu={ctx.menu} onClose={ctx.close} /> : null}
    </div>
  );
}
