import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '../model/store';
import { toPop } from '../interchange/toPop';
import { tryParsePop } from '../interchange/fromPop';
import { downloadText, slugify } from '../interchange/download';

export function TextView({ editor }: { editor: Editor }) {
  const { doc, t, activeProjectId } = editor;
  const [draft, setDraft] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  const text = useMemo(() => (doc ? toPop(doc) : ''), [doc]);
  const editing = draft !== null;
  const source = editing ? draft : text;
  const parsed = useMemo(() => (source ? tryParsePop(source) : null), [source]);
  const lines = useMemo(() => text.split('\n'), [text]);
  const dirty = editing && draft !== text;

  /** Switching projects starts a fresh draft; applying edits clears it below. */
  useEffect(() => {
    setDraft(null);
  }, [activeProjectId]);

  const startEditing = useCallback(() => {
    setDraft(text);
    window.requestAnimationFrame(() => areaRef.current?.focus());
  }, [text]);

  const cancelEditing = useCallback(() => setDraft(null), []);

  const applyEditing = useCallback(async () => {
    if (draft === null || applying || draft === text) return;
    setApplying(true);
    const ok = await editor.applySource(draft);
    setApplying(false);
    if (ok) setDraft(null);
  }, [applying, draft, editor, text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      editor.notify(t('copied'));
    } catch {
      editor.notify(t('copyFailed'), 'error');
    }
  };

  if (!doc) return <div className="text-view-placeholder">{t('addLayoutFirst')}</div>;

  const parseFailed = editing && (!parsed || !parsed.ok);
  const parseError =
    parsed && !parsed.ok ? `${t('parseError')} · L${parsed.error.line}: ${parsed.error.message}` : '';

  return (
    <div className="text-view">
      <header className="text-view-head">
        <div>
          <h2>{t('viewText')}</h2>
          <p>{editing ? t('editHint') : t('textViewHint')}</p>
        </div>
        <div className="text-view-actions">
          <span
            className={`parse-badge${parseFailed ? ' is-error' : ' is-ok'}`}
            title={parseError || undefined}
          >
            {parseFailed ? t('parseError') : t('ok')}
          </span>
          {editing ? (
            <>
              <button type="button" className="btn ghost" onClick={cancelEditing}>
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void applyEditing()}
                disabled={applying || !dirty || parseFailed}
              >
                {t('apply')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn ghost" onClick={startEditing}>
                {t('edit')}
              </button>
              <button type="button" className="btn ghost" onClick={() => void copy()}>
                {t('copy')}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => downloadText(text, `${slugify(doc.meta.title, 'diagram')}.pop`)}
              >
                {t('download')}
              </button>
            </>
          )}
        </div>
      </header>

      {editing && parseError ? <p className="edit-status">{parseError}</p> : null}
      {editing && dirty && !parseError ? <p className="edit-status">{t('dirty')}</p> : null}

      {editing ? (
        <textarea
          ref={areaRef}
          className={`code-editor${parseError ? ' is-invalid' : ''}`}
          value={draft ?? ''}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelEditing();
              return;
            }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void applyEditing();
            }
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label={t('viewText')}
        />
      ) : (
        <div className="code-block">
          <ol className="code-lines">
            {lines.map((line, index) => (
              <li key={index}>
                <code>{line || '\u00a0'}</code>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
