import { useCallback, useEffect, useState } from 'react';
import { useEditor } from './model/store';
import { useWriteLock } from './model/writeLock';
import { translate } from './i18n/dict';
import type { Locale } from './model/types';
import { TopBar } from './components/TopBar';
import { Palette } from './components/Palette';
import { Inspector } from './components/Inspector';
import { EmptyState } from './components/EmptyState';
import { TextView } from './components/TextView';
import { StatusBar } from './components/StatusBar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { Canvas } from './canvas/Canvas';
import { findParent } from './model/tree';

/** Only one tab owns the shared storage; the others wait until it is free. */
export default function App() {
  const lock = useWriteLock();
  if (lock === 'owner') return <Editor />;

  const locale: Locale = localStorage.getItem('macaron.locale') === 'en' ? 'en' : 'zh';
  return (
    <div className="write-lock" role="status" aria-live="polite">
      <div className="write-lock-card">
        <span className="write-lock-mark">D</span>
        <h1>{translate(locale, lock === 'blocked' ? 'writeLockTitle' : 'writeLockPending')}</h1>
        {lock === 'blocked' ? <p>{translate(locale, 'writeLockBody')}</p> : null}
      </div>
    </div>
  );
}

function Editor() {
  const editor = useEditor();
  const { doc, selectedId, view, t } = editor;
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);

  /** Picking a project from the drawer should get out of the way. */
  useEffect(() => {
    setSidebarOpen(false);
  }, [editor.activeProjectId]);
  const toggleInspector = useCallback(() => {
    setSidebarOpen(false);
    setInspectorOpen((open) => !open);
  }, []);
  const toggleSidebar = useCallback(() => {
    setInspectorOpen(false);
    setSidebarOpen((open) => !open);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // An open dialog owns the keyboard, including Escape.
      if (editor.confirm || shortcutsOpen) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      if (typing) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        editor.redo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'e' && doc) {
        event.preventDefault();
        editor.setView(view === 'canvas' ? 'text' : 'canvas');
        return;
      }
      if (mod && event.key.toLowerCase() === 'd' && doc && selectedId) {
        event.preventDefault();
        editor.duplicateBlock(selectedId);
        return;
      }
      if (event.altKey && doc && selectedId) {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          editor.moveBlockUpDown(selectedId, -1);
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          editor.moveBlockUpDown(selectedId, 1);
          return;
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          editor.promote(selectedId);
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          editor.demote(selectedId);
          return;
        }
      }
      if (mod && doc && view === 'canvas' && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        editor.zoomIn();
        return;
      }
      if (mod && doc && view === 'canvas' && (event.key === '-' || event.key === '_')) {
        event.preventDefault();
        editor.zoomOut();
        return;
      }
      if (mod && doc && view === 'canvas' && event.key === '0') {
        event.preventDefault();
        editor.requestFit();
        return;
      }
      if (mod && doc && view === 'canvas' && event.key === '1') {
        event.preventDefault();
        editor.setZoom(1);
        return;
      }
      if (event.key === '?' || event.key === 'F1') {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (event.key === 'Escape') {
        if (sidebarOpen) {
          setSidebarOpen(false);
          return;
        }
        if (inspectorOpen) {
          setInspectorOpen(false);
          return;
        }
        editor.select(null);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && doc && selectedId) {
        if (!findParent(doc.root, selectedId)) return;
        event.preventDefault();
        const id = selectedId;
        void editor.askConfirm(t('confirmDelete'), t('remove'), true).then((ok) => {
          if (ok) editor.removeBlock(id);
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doc, editor, inspectorOpen, selectedId, shortcutsOpen, sidebarOpen, t, view]);

  return (
    <div
      className={`app${inspectorOpen ? ' inspector-open' : ''}${
        sidebarOpen ? ' sidebar-open' : ''
      }`}
    >
      <TopBar
        editor={editor}
        inspectorOpen={inspectorOpen}
        sidebarOpen={sidebarOpen}
        onToggleInspector={toggleInspector}
        onToggleSidebar={toggleSidebar}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <div className="workspace">
        <Palette editor={editor} />
        <main className="stage-area">
          {!doc ? (
            <EmptyState editor={editor} />
          ) : view === 'canvas' ? (
            <Canvas editor={editor} />
          ) : (
            <TextView editor={editor} />
          )}
        </main>
        <Inspector editor={editor} />
      </div>

      {inspectorOpen || sidebarOpen ? (
        <button
          type="button"
          className="drawer-scrim"
          aria-label={inspectorOpen ? t('closeInspector') : t('projects')}
          onClick={() => {
            setInspectorOpen(false);
            setSidebarOpen(false);
          }}
        />
      ) : null}

      {shortcutsOpen ? <ShortcutsDialog editor={editor} onClose={closeShortcuts} /> : null}

      <ConfirmDialog editor={editor} />

      <StatusBar editor={editor} />

      <div className="toasts" role="status" aria-live="polite">
        {editor.toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.tone === 'error' ? ' is-error' : ''}`}>
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}
