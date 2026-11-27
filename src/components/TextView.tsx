import { useMemo, useState } from 'react';
import type { Editor } from '../model/store';
import { toPop } from '../interchange/toPop';
import { tryParsePop } from '../interchange/fromPop';
import { downloadText, slugify } from '../interchange/download';

export function TextView({ editor }: { editor: Editor }) {
  const { doc, t } = editor;
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => (doc ? toPop(doc) : ''), [doc]);
  const parsed = useMemo(() => (text ? tryParsePop(text) : null), [text]);
  const lines = useMemo(() => text.split('\n'), [text]);

  if (!doc) return <div className="text-view-placeholder">{t('addLayoutFirst')}</div>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      editor.notify(t('copied'));
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      editor.notify(t('importFailed'), 'error');
    }
  };

  return (
    <div className="text-view">
      <header className="text-view-head">
        <div>
          <h2>{t('viewText')}</h2>
          <p>{t('textViewHint')}</p>
        </div>
        <div className="text-view-actions">
          <span className={`parse-badge${parsed?.ok ? ' is-ok' : ' is-error'}`}>
            {parsed?.ok ? t('ok') : t('importFailed')}
          </span>
          <button type="button" className="btn ghost" onClick={() => void copy()}>
            {copied ? '✓' : t('copy')}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => downloadText(text, `${slugify(doc.meta.title, 'diagram')}.pop`)}
          >
            {t('download')}
          </button>
        </div>
      </header>

      <div className="code-block">
        <ol className="code-lines">
          {lines.map((line, index) => (
            <li key={index}>
              <code>{line || '\u00a0'}</code>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
