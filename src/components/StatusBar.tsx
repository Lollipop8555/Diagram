import type { Editor } from '../model/store';
import { getTemplate } from '../model/templates';
import { countBlocks } from '../model/tree';
export function StatusBar({ editor }: { editor: Editor }) {
  const { doc, zoom, t, locale } = editor;
  const template = doc ? getTemplate(doc.meta.template) : null;
  const blocks = doc ? countBlocks(doc.root) : 0;

  return (
    <footer className="statusbar">
      <div className="status-left">
        {doc ? (
          <>
            <span className="status-item">{template?.name[locale]}</span>
            <span className="status-dot" />
            <span className="status-item">
              {blocks} {t('blocks')}
            </span>
            <span className="status-dot" />
            <span className="status-item">
              {t('depth')} {template?.maxDepth}
            </span>
          </>
        ) : (
          <span className="status-item">{t('newDiagram')}</span>
        )}
      </div>

      <div className="status-right">
        <span className="status-item">{Math.round(zoom * 100)}%</span>
        <span className="status-dot" />
        <span className="status-item">
          {editor.savedAt ? t('savedAt', { time: editor.savedAt }) : t('savedLocal')}
        </span>
      </div>
    </footer>
  );
}
