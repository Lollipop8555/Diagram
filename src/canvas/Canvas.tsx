import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { ID, Rect } from '../model/types';
import type { Editor } from '../model/store';
import { blockAtPoint, layoutDoc, type BlockEntry } from '../layout/dispatch';
import { buildEdges } from '../layout/edges';
import { checkMove, findBlock, findParent, isDescendant, moveBlock, type ReasonCode } from '../model/tree';
import { SKIN_LABELS } from '../i18n/labels';
import { ARROW_DIRECTIONS, nextBlockInDirection } from './navigate';
import { buildSplitters, type Splitter } from './splitters';
import { ZOOM_MAX, ZOOM_MIN } from '../model/zoom';
import { BlockView } from './BlockView';

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
  /** Pointer coordinate along the splitter axis where the drag started. */
  start: number;
  aWeight: number;
  bWeight: number;
  previewA: number;
  previewB: number;
}

export function Canvas({ editor }: { editor: Editor }) {
  const { doc, selectedId, zoom, pan, fitSignal, t } = editor;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [splitDrag, setSplitDrag] = useState<SplitDrag | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const splitRef = useRef<SplitDrag | null>(null);
  const panRef = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);

  dragRef.current = drag;

  const layout = useMemo(() => (doc ? layoutDoc(doc) : null), [doc]);
  const edges = useMemo(
    () => (doc && layout ? buildEdges(doc, layout.rects) : []),
    [doc, layout],
  );

  /** Splitters live on the parent of the selected block (the root when it is selected). */
  const splitParent = useMemo(() => {
    if (!doc || !selectedId) return null;
    return findParent(doc.root, selectedId) ?? doc.root;
  }, [doc, selectedId]);

  const splitters = useMemo(() => buildSplitters(splitParent, layout), [splitParent, layout]);

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
    const bounds = layout.bounds;
    const sx = (box.width - 96) / Math.max(1, bounds.w);
    const sy = (box.height - 110) / Math.max(1, bounds.h);
    const next = Math.max(ZOOM_MIN, Math.min(1, Math.min(sx, sy)));
    editor.setZoom(next);
    editor.setPan({
      x: (box.width - bounds.w * next) / 2 - bounds.x * next,
      y: (box.height - bounds.h * next) / 2 - bounds.y * next,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  /* ----------------------------------------------------------------- wheel */

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = wrap.getBoundingClientRect();
      const px = event.clientX - box.left;
      const py = event.clientY - box.top;
      const factor = Math.exp(-event.deltaY * 0.0016);
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
      const ratio = next / zoom;
      editor.setZoom(next);
      editor.setPan({
        x: px - (px - pan.x) * ratio,
        y: py - (py - pan.y) * ratio,
      });
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
      panRef.current = { x: pan.x, y: pan.y, sx: event.clientX, sy: event.clientY };
    },
    [editor, pan.x, pan.y],
  );

  /** Splitter drag trades weight between two adjacent siblings; committed on release. */
  const onSplitterPointerDown = useCallback(
    (event: React.PointerEvent, splitter: Splitter) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      const point = toContent(event.clientX, event.clientY);
      const next: SplitDrag = {
        splitter,
        start: splitter.axis === 'x' ? point.x : point.y,
        aWeight: splitter.aWeight,
        bWeight: splitter.bWeight,
        previewA: splitter.aWeight,
        previewB: splitter.bWeight,
      };
      splitRef.current = next;
      setSplitDrag(next);
    },
    [toContent],
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

      const split = splitRef.current;
      if (split) {
        const point = toContent(event.clientX, event.clientY);
        const coord = split.splitter.axis === 'x' ? point.x : point.y;
        const total = split.aWeight + split.bWeight;
        const delta = ((coord - split.start) / split.splitter.span) * total;
        const previewA = Math.min(total - 1, Math.max(1, Math.round(split.aWeight + delta)));
        if (previewA !== split.previewA) {
          const next = { ...split, previewA, previewB: total - previewA };
          splitRef.current = next;
          setSplitDrag(next);
        }
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
        if (split.previewA !== split.aWeight) {
          editor.setPairWeight(split.splitter.aId, split.splitter.bId, split.previewA);
        }
      }

      panRef.current = null;
    };

    /**
     * A lost pointerup (released outside the window, OS dialog, tab blur) leaves a
     * phantom drag that would move a block on the next hover, so cancellation is
     * wired to pointercancel and window blur as well.
     */
    const cancel = () => {
      dragRef.current = null;
      splitRef.current = null;
      panRef.current = null;
      setDrag(null);
      setSplitDrag(null);
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
  }, [doc, editor, layout, planDrop, t, toContent]);

  /* -------------------------------------------------------------- rendering */

  if (!doc || !layout) {
    return <div className="canvas-wrap" ref={wrapRef} />;
  }

  return (
    <div className="canvas-wrap" ref={wrapRef} onPointerDown={onBackgroundPointerDown}>
      <div className="grid-bg" />
      <div
        className="stage"
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
            isTarget={drag?.active === true && drag.targetParent === entry.block.id}
            dragging={drag?.active === true && drag.id === entry.block.id}
            label={`${t(SKIN_LABELS[entry.block.skin.kind])}${
              editor.locale === 'zh' ? '：' : ': '
            }${entry.block.title || t('untitled')}`}
            onPointerDown={onBlockPointerDown}
            onDoubleClick={onBlockToggleCollapse}
            onSelect={onBlockSelect}
            onToggleCollapse={onBlockToggleCollapse}
          />
        ))}

        {splitters.map((splitter) => (
          <div
            key={splitter.key}
            className={`splitter is-${splitter.axis}${
              splitDrag?.splitter.key === splitter.key ? ' is-active' : ''
            }`}
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
              editor.setPairWeight(
                splitter.aId,
                splitter.bId,
                splitter.aWeight + (grow ? step : -step),
              );
            }}
            role="separator"
            aria-orientation={splitter.axis === 'x' ? 'vertical' : 'horizontal'}
            aria-label={t('splitterHint')}
            title={t('splitterHint')}
          />
        ))}

        {splitDrag ? (
          <div
            className="splitter-badge"
            style={{
              left: splitDrag.splitter.x + splitDrag.splitter.w / 2,
              top: splitDrag.splitter.y + splitDrag.splitter.h / 2,
            }}
          >
            {splitDrag.previewA} : {splitDrag.previewB}
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

      <div className="zoom-controls">
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
    </div>
  );
}
