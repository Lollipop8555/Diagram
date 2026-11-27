import { memo } from 'react';
import type { BlockEntry } from '../layout/dispatch';
import { skinDefOf, toneColors } from '../skins/palette';
import { countBlocks } from '../model/tree';
import { FONT_TITLE, LINE_TITLE, wrapText } from '../model/measure';

interface Props {
  entry: BlockEntry;
  selected: boolean;
  isTarget: boolean;
  dragging: boolean;
  /** Screen-reader description, e.g. "容器：支付系统". */
  label: string;
  onPointerDown: (event: React.PointerEvent, id: string) => void;
  onDoubleClick: (id: string) => void;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

function BlockViewInner({
  entry,
  selected,
  isTarget,
  dragging,
  label,
  onPointerDown,
  onDoubleClick,
  onSelect,
  onToggleCollapse,
}: Props) {
  const { block, rect } = entry;
  const def = skinDefOf(block.skin);
  const colors = toneColors(block.skin.tone);
  const outline = block.skin.outline ?? def.outline;
  const dashed = outline === 'dashed';

  const className = [
    'block',
    `skin-${block.skin.kind}`,
    selected ? 'is-selected' : '',
    isTarget ? 'is-target' : '',
    dragging ? 'is-dragging' : '',
    block.collapsed ? 'is-collapsed' : '',
    outline === 'none' ? 'no-outline' : '',
    dashed ? 'is-dashed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const showBackground = block.skin.kind !== 'plain';

  const title = block.title ?? '';

  const collapsible =
    block.children.length > 0 && block.layout.kind !== 'leaf' && block.layout.kind !== 'spacer';

  return (
    <div
      className={className}
      data-block-id={block.id}
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-pressed={selected}
      aria-expanded={collapsible ? !block.collapsed : undefined}
      onFocus={() => onSelect(block.id)}
      onKeyDown={(event) => {
        // Enter (new sibling) and Tab (first child) are handled by the canvas.
        if (event.key !== ' ') return;
        event.preventDefault();
        if (collapsible) onToggleCollapse(block.id);
        else onSelect(block.id);
      }}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderRadius: block.skin.radius ?? def.radius,
        background: showBackground ? colors.fill : 'transparent',
        borderColor: outline === 'none' ? 'transparent' : colors.stroke,
        color: colors.ink,
        // Depth owns the stacking order (child always above its parent), and a
        // selected block only lifts above its *siblings*. Children keep +100, so
        // they stay clickable even while the container is selected. Dragging wins
        // over everything except the drop indicators.
        zIndex: dragging ? 940 : entry.depth * 100 + (selected ? 50 : 0),
      }}
      onPointerDown={(event) => onPointerDown(event, block.id)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick(block.id);
      }}
      title={title}
    >
      {block.collapsed ? (
        <div className="collapsed-label">
          <span className="collapsed-title">{title}</span>
          <span className="collapsed-count">{countBlocks(block) - 1}</span>
        </div>
      ) : block.skin.kind === 'band' ? (
        <>
          <div className={`band-title${block.subtitle ? ' has-sub' : ''}`}>{title}</div>
          {block.subtitle ? <div className="band-sub">{block.subtitle}</div> : null}
        </>
      ) : block.skin.kind === 'boundary' ? (
        <div
          className="boundary-chip"
          style={{ background: colors.solid, borderColor: colors.stroke, color: colors.ink }}
        >
          {title}
        </div>
      ) : block.skin.kind === 'container' ? (
        <div className="container-title">{title}</div>
      ) : block.skin.kind === 'segment' ? (
        <>
          <div className="segment-title">{title}</div>
          {block.subtitle ? <div className="segment-sub">{block.subtitle}</div> : null}
        </>
      ) : block.skin.kind === 'note' ? (
        <div className="note-title">{title}</div>
      ) : block.skin.kind === 'plain' ? (
        title ? <div className="plain-title">{title}</div> : null
      ) : (
        <div className="chip-center">
          {wrapText(title, FONT_TITLE, Math.max(40, rect.w - def.padX * 2)).map((line, i) => (
            <div className="chip-title" key={i} style={{ height: LINE_TITLE }}>
              {line}
            </div>
          ))}
          {block.subtitle ? <div className="chip-sub">{block.subtitle}</div> : null}
        </div>
      )}

      {block.badge && !block.collapsed ? <div className="block-badge">{block.badge}</div> : null}
      {selected ? <div className="selection-ring" /> : null}
    </div>
  );
}

export const BlockView = memo(BlockViewInner);
