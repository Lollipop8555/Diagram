import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Editor } from '../model/store';
import type { BlockNode, ID, RelationKind } from '../model/types';
import { RELATION_KINDS } from '../model/types';
import { REL_LABELS } from '../i18n/labels';

/**
 * Connections are their own component, not a property of a block: they live in a
 * standalone panel, can be added whenever the user needs one, and each row can be
 * removed again. The canvas only draws what this list contains.
 */
export function LinksPanel({ editor }: { editor: Editor }) {
  const { doc, t } = editor;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<RelationKind>('dep');
  const [label, setLabel] = useState('');

  const options = useMemo(() => {
    const list: { id: ID; label: string }[] = [];
    const walk = (node: BlockNode) => {
      list.push({ id: node.id, label: node.title || t('untitled') });
      node.children.forEach(walk);
    };
    if (doc) walk(doc.root);
    return list;
  }, [doc, t]);

  if (!doc) return null;

  const canAdd = Boolean(from && to && from !== to);

  return (
    <section className="section links-panel">
      <h3>{t('relations')}</h3>

      <div className="link-add">
        <select
          className="input link-pick"
          value={from}
          aria-label={t('relationPickSource')}
          onChange={(event) => setFrom(event.target.value)}
        >
          <option value="">{t('relationPickSource')}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className="input link-kind"
          value={kind}
          aria-label={t('relationKind')}
          onChange={(event) => setKind(event.target.value as RelationKind)}
        >
          {RELATION_KINDS.map((value) => (
            <option key={value} value={value}>
              {t(REL_LABELS[value])}
            </option>
          ))}
        </select>

        <select
          className="input link-pick"
          value={to}
          aria-label={t('relationPickTarget')}
          onChange={(event) => setTo(event.target.value)}
        >
          <option value="">{t('relationPickTarget')}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={option.id === from}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn ghost link-add-btn"
          disabled={!canAdd}
          onClick={() => {
            editor.addRelation(from, to, kind, label);
            setTo('');
            setLabel('');
          }}
        >
          <Plus size={15} strokeWidth={2} />
        </button>
      </div>

      <input
        className="input link-label-input"
        value={label}
        placeholder={t('relationLabel')}
        aria-label={t('relationLabel')}
        onChange={(event) => setLabel(event.target.value)}
      />

      {doc.relations.length === 0 ? (
        <p className="panel-hint">{t('relationsEmpty')}</p>
      ) : (
        <ul className="relation-list">
          {doc.relations.map((relation) => (
            <li key={relation.id} className="relation-item">
              <div className="relation-head">
                <select
                  className="input relation-kind-select"
                  value={relation.kind}
                  aria-label={t('relationKind')}
                  onChange={(event) =>
                    editor.patchRelation(relation.id, { kind: event.target.value as RelationKind })
                  }
                >
                  {RELATION_KINDS.map((value) => (
                    <option key={value} value={value}>
                      {t(REL_LABELS[value])}
                    </option>
                  ))}
                </select>
                <span className="relation-text">
                  {options.find((item) => item.id === relation.from)?.label ?? relation.from} →{' '}
                  {options.find((item) => item.id === relation.to)?.label ?? relation.to}
                </span>
                <button
                  type="button"
                  className="link-btn is-neutral link-style"
                  aria-pressed={Boolean(relation.dashed)}
                  aria-label={t('lineStyleHint')}
                  title={t('lineStyleHint')}
                  onClick={() => editor.patchRelation(relation.id, { dashed: !relation.dashed })}
                >
                  {relation.dashed ? t('lineDashed') : t('lineSolid')}
                </button>
                <button
                  type="button"
                  className="link-btn"
                  aria-label={t('remove')}
                  title={t('remove')}
                  onClick={() => editor.removeRelation(relation.id)}
                >
                  <Trash2 size={13} strokeWidth={1.8} />
                </button>
              </div>
              <input
                className="input relation-label-input"
                value={relation.label ?? ''}
                placeholder={t('relationLabel')}
                aria-label={t('relationLabel')}
                onChange={(event) =>
                  editor.patchRelation(relation.id, { label: event.target.value || undefined })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
