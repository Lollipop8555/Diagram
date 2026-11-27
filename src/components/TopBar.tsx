import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  CircleHelp,
  Download,
  PanelLeft,
  PanelRight,
  Redo2,
  Undo2,
} from 'lucide-react';
import type { Editor } from '../model/store';
import { downloadBlob, downloadText, slugify } from '../interchange/download';
import { toPop } from '../interchange/toPop';
import { toJson } from '../interchange/json';
import { docToSvg, svgToPngBlob } from '../export/toSvg';
import { buildEdges } from '../layout/edges';
import { InstallButton } from './InstallButton';
import { layoutDoc } from '../layout/dispatch';

export function TopBar({
  editor,
  inspectorOpen,
  sidebarOpen,
  onToggleInspector,
  onToggleSidebar,
  onOpenShortcuts,
}: {
  editor: Editor;
  inspectorOpen: boolean;
  sidebarOpen: boolean;
  onToggleInspector: () => void;
  onToggleSidebar: () => void;
  onOpenShortcuts: () => void;
}) {
  const { doc, locale, view, t } = editor;
  const [title, setTitle] = useState(doc?.meta.title ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    setTitle(doc?.meta.title ?? '');
  }, [doc?.root.id, doc?.meta.title]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.open) return;
      if (!menuRef.current.contains(event.target as Node)) {
        menuRef.current.open = false;
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const commitTitle = () => {
    if (!doc) return;
    const next = title.trim() || t('untitled');
    setTitle(next);
    if (next !== doc.meta.title) editor.setTitle(next);
  };

  const exportAs = async (kind: 'pop' | 'json' | 'svg' | 'png') => {
    if (!doc) return;
    const base = slugify(doc.meta.title, 'diagram');
    const layout = layoutDoc(doc);
    const edges = buildEdges(doc, layout.rects);
    if (kind === 'pop') {
      downloadText(toPop(doc), `${base}.pop`);
    } else if (kind === 'json') {
      downloadText(toJson(doc), `${base}.json`, 'application/json;charset=utf-8');
    } else if (kind === 'svg') {
      downloadText(docToSvg(doc, layout, edges), `${base}.svg`, 'image/svg+xml;charset=utf-8');
    } else {
      try {
        const svg = docToSvg(doc, layout, edges);
        const blob = await svgToPngBlob(svg, 3);
        downloadBlob(blob, `${base}.png`);
      } catch {
        editor.notify(t('pngFailed'), 'error');
        return;
      }
    }
    editor.notify(t('exportDone'));
    if (menuRef.current) menuRef.current.open = false;
    setMenuOpen(false);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">D</span>
        <span className="brand-text">
          <strong>{t('appName')}</strong>
          <em>{t('brandTagline')}</em>
        </span>
      </div>

      <div className="topbar-mid">
        <input
          className="doc-title"
          value={title}
          placeholder={t('docTitle')}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          }}
          disabled={!doc}
          aria-label={t('docTitle')}
        />
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="icon-btn history-btn"
          onClick={editor.undo}
          disabled={!editor.canUndo}
          title={t('undo')}
          aria-label={t('undo')}
        >
          <Undo2 size={16} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="icon-btn history-btn"
          onClick={editor.redo}
          disabled={!editor.canRedo}
          title={t('redo')}
          aria-label={t('redo')}
        >
          <Redo2 size={16} strokeWidth={1.8} />
        </button>

        <div className="segmented" role="group">
          <button
            type="button"
            className={view === 'canvas' ? 'is-active' : ''}
            onClick={() => editor.setView('canvas')}
          >
            {t('viewCanvas')}
          </button>
          <button
            type="button"
            className={view === 'text' ? 'is-active' : ''}
            onClick={() => editor.setView('text')}
            disabled={!doc}
          >
            {t('viewText')}
          </button>
        </div>

        <button type="button" className="btn ghost lang" onClick={() => editor.setLocale(locale === 'zh' ? 'en' : 'zh')}>
          {t('lang')}
        </button>

        <details className="menu" ref={menuRef} onToggle={() => setMenuOpen(menuRef.current?.open ?? false)}>
          <summary
            className={`btn primary${doc ? '' : ' is-disabled'}`}
            aria-disabled={!doc}
            onClick={(event) => {
              // A <summary> cannot be disabled; keep the empty state from opening it.
              if (!doc) event.preventDefault();
            }}
          >
            <Download size={14} strokeWidth={1.8} />
            {t('export')}
            <ChevronDown size={12} strokeWidth={2} />
          </summary>
          {menuOpen ? (
            <div className="menu-list">
              <button type="button" onClick={() => void exportAs('pop')}>
                {t('exportPop')}
              </button>
              <button type="button" onClick={() => void exportAs('json')}>
                {t('exportJson')}
              </button>
              <button type="button" onClick={() => void exportAs('svg')}>
                {t('exportSvg')}
              </button>
              <button type="button" onClick={() => void exportAs('png')}>
                {t('exportPng')}
              </button>
            </div>
          ) : null}
        </details>

        <InstallButton label={t('install')} />

        <button
          type="button"
          className="icon-btn shortcuts-btn"
          onClick={onOpenShortcuts}
          title={t('shortcuts')}
          aria-label={t('shortcuts')}
        >
          <CircleHelp size={17} strokeWidth={1.8} />
        </button>

        <button
          type="button"
          className="icon-btn sidebar-toggle"
          onClick={onToggleSidebar}
          title={t('panels')}
          aria-label={t('panels')}
          aria-controls="sidebar"
          aria-expanded={sidebarOpen}
        >
          <PanelLeft size={17} strokeWidth={1.8} />
        </button>

        <button
          type="button"
          className="icon-btn inspector-toggle"
          onClick={onToggleInspector}
          title={t('inspector')}
          aria-label={t('inspector')}
          aria-controls="inspector"
          aria-expanded={inspectorOpen}
        >
          <PanelRight size={17} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
