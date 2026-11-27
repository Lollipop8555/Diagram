import { useMemo, useRef } from 'react';
import type { Editor } from '../model/store';
import { getTemplate } from '../model/templates';
import { findBlock } from '../model/tree';
import { countTree } from '../layout/dispatch';
import { ISSUE_LABELS } from '../i18n/labels';

export function StatusBar({ editor }: { editor: Editor }) {
  const { doc, zoom, t, locale, issues } = editor;
  const template = doc ? getTemplate(doc.meta.template) : null;
  const tree = doc ? countTree(doc.root) : null;
  const blocks = tree?.total ?? 0;
  /** Actual nesting of this document (root counts as the first level). */
  const levels = tree ? tree.maxDepth + 1 : 0;
  const menuRef = useRef<HTMLDetailsElement | null>(null);

  /** Issue rows carry the block title so the popover reads like a task list. */
  const rows = useMemo(() => {
    if (!doc) return [];
    return issues.map((issue, index) => ({
      key: `${issue.blockId}-${issue.code}-${index}`,
      blockId: issue.blockId,
      title: findBlock(doc.root, issue.blockId)?.title || t('untitled'),
      label: t(ISSUE_LABELS[issue.code]),
      detail: issue.detail,
    }));
  }, [doc, issues, t]);

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
            <span className="status-depth">
              <span className="status-dot" />
              <span className="status-item">
                {t('depth')} {levels}
              </span>
            </span>
          </>
        ) : (
          <span className="status-item">{t('newDiagram')}</span>
        )}
      </div>

      <div className="status-mid">
        {doc && rows.length === 0 ? (
          <span className="status-item status-ok">{t('structureOk')}</span>
        ) : null}
        {doc && rows.length > 0 ? (
          <details className="issues-pop" ref={menuRef}>
            <summary className="status-issues" title={t('issueJumpHint')}>
              {t('issueCount', { n: rows.length })}
            </summary>
            <ul>
              {rows.map((row) => (
                <li key={row.key}>
                  <button
                    type="button"
                    className="issue-jump"
                    title={t('issueJumpHint')}
                    onClick={() => {
                      editor.select(row.blockId);
                      if (menuRef.current) menuRef.current.open = false;
                    }}
                  >
                    {row.title}
                  </button>
                  <code>{row.label}</code>
                  {row.detail ? <em>{row.detail}</em> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
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
