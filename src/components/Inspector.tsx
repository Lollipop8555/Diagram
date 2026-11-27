import type { Editor } from '../model/store';
import type { Align, Justify, LayoutKind, SkinKind } from '../model/types';
import { SKIN_KINDS, TONES } from '../model/types';
import { findBlock, findParent } from '../model/tree';
import { getTemplate, templateAllowsLayout } from '../model/templates';
import { SKINS, toneColors } from '../skins/palette';
import { LAYOUT_LABELS, SKIN_LABELS, TONE_LABELS } from '../i18n/labels';
import { LinksPanel } from './LinksPanel';

export function Inspector({ editor }: { editor: Editor }) {
  const { doc, selectedId, t } = editor;
  const block = doc && selectedId ? findBlock(doc.root, selectedId) : null;

  if (!doc) {
    return (
      <aside className="inspector" id="inspector">
        <header className="panel-head">
          <h2>{t('inspector')}</h2>
        </header>
        <p className="panel-hint">{t('selectBlock')}</p>
      </aside>
    );
  }

  if (!block) {
    return (
      <aside className="inspector" id="inspector">
        <header className="panel-head">
          <h2>{t('inspector')}</h2>
        </header>
        <p className="panel-hint">{t('selectBlock')}</p>
        <LinksPanel editor={editor} />
      </aside>
    );
  }

  const template = getTemplate(doc.meta.template);
  const parent = findParent(doc.root, block.id);
  const isRoot = !parent;
  const hasChildren = block.children.length > 0;
  const layout = block.layout;
  const canDemote = parent
    ? parent.children.findIndex((child) => child.id === block.id) > 0
    : false;

  const skinOptions = SKIN_KINDS.filter((kind) => template.allowedSkins.includes(kind));

  return (
    <aside className="inspector" id="inspector">
      <header className="panel-head">
        <h2>{t('inspector')}</h2>
        <span className="panel-note">{t(LAYOUT_LABELS[layout.kind])}</span>
      </header>

      <section className="section">
        <h3>{t('content')}</h3>
        <label className="field">
          <span>{t('title')}</span>
          <input
            className="input"
            value={block.title ?? ''}
            placeholder={t('untitled')}
            onChange={(event) => editor.patchBlock(block.id, { title: event.target.value })}
          />
        </label>
        <label className="field">
          <span>{t('subtitle')}</span>
          <input
            className="input"
            value={block.subtitle ?? ''}
            onChange={(event) => editor.patchBlock(block.id, { subtitle: event.target.value || undefined })}
          />
        </label>
        <label className="field">
          <span>{t('badge')}</span>
          <input
            className="input"
            value={block.badge ?? ''}
            onChange={(event) => editor.patchBlock(block.id, { badge: event.target.value || undefined })}
          />
        </label>
      </section>

      <section className="section">
        <h3>{t('layoutSec')}</h3>
        <label className="field">
          <span>{t('type')}</span>
          <select
            className="input"
            value={layout.kind}
            onChange={(event) => editor.patchLayout(block.id, { kind: event.target.value as LayoutKind })}
          >
            {(['linear', 'grid', 'flow', 'stack', 'spacer', 'leaf'] as LayoutKind[]).map((kind) => (
              <option
                key={kind}
                value={kind}
                disabled={
                  !templateAllowsLayout(template, kind) ||
                  ((kind === 'leaf' || kind === 'spacer') && hasChildren)
                }
              >
                {t(LAYOUT_LABELS[kind])}
              </option>
            ))}
          </select>
        </label>

        {(layout.kind === 'linear' || layout.kind === 'flow') && (
          <div className="field">
            <span>{t('axis')}</span>
            <div className="segmented small">
              <button
                type="button"
                className={layout.axis !== 'x' ? 'is-active' : ''}
                onClick={() => editor.patchLayout(block.id, { axis: 'y' })}
              >
                {t('vertical')}
              </button>
              <button
                type="button"
                className={layout.axis === 'x' ? 'is-active' : ''}
                onClick={() => editor.patchLayout(block.id, { axis: 'x' })}
              >
                {t('horizontal')}
              </button>
            </div>
          </div>
        )}

        {layout.kind === 'grid' && (
          <label className="field">
            <span>{t('columns')}</span>
            <input
              className="input"
              type="number"
              min={1}
              max={6}
              value={layout.columns ?? 3}
              onChange={(event) =>
                editor.patchLayout(block.id, { columns: Math.max(1, Number(event.target.value) || 1) })
              }
            />
          </label>
        )}

        {layout.kind === 'grid' && (
          <div className="field">
            <span>{t('columnWeights')}</span>
            <div className="col-weights" role="group" aria-label={t('columnWeights')}>
              {Array.from({ length: layout.columns ?? 3 }, (_, i) => (
                <input
                  key={i}
                  className="input col-weight"
                  type="number"
                  min={1}
                  max={9}
                  value={layout.columnWeights?.[i] ?? 1}
                  title={t('columnWeightsHint')}
                  aria-label={`${t('columnWeights')} ${i + 1}`}
                  onChange={(event) => {
                    const count = layout.columns ?? 3;
                    const next = Array.from({ length: count }, (_, k) => layout.columnWeights?.[k] ?? 1);
                    next[i] = Math.max(1, Math.round(Number(event.target.value) || 1));
                    editor.patchLayout(block.id, { columnWeights: next });
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {(layout.kind === 'linear' || layout.kind === 'grid' || layout.kind === 'flow' || layout.kind === 'stack') && (
          <label className="field">
            <span>{t('gap')}</span>
            <input
              className="input"
              type="number"
              min={0}
              max={64}
              value={layout.gap ?? 10}
              onChange={(event) =>
                editor.patchLayout(block.id, { gap: Math.max(0, Number(event.target.value) || 0) })
              }
            />
          </label>
        )}

        <label className="field">
          <span>{t('align')}</span>
          <select
            className="input"
            value={layout.align ?? 'stretch'}
            onChange={(event) => editor.patchLayout(block.id, { align: event.target.value as Align })}
          >
            <option value="start">{t('alignStart')}</option>
            <option value="center">{t('alignCenter')}</option>
            <option value="end">{t('alignEnd')}</option>
            <option value="stretch">{t('alignStretch')}</option>
          </select>
        </label>

        <label className="field">
          <span>{t('justify')}</span>
          <select
            className="input"
            value={layout.justify ?? 'start'}
            onChange={(event) => editor.patchLayout(block.id, { justify: event.target.value as Justify })}
          >
            <option value="start">{t('justifyStart')}</option>
            <option value="center">{t('justifyCenter')}</option>
            <option value="end">{t('justifyEnd')}</option>
            <option value="between">{t('justifyBetween')}</option>
          </select>
        </label>

        {(layout.kind === 'leaf' || layout.kind === 'flow') && (
          <label className="field">
            <span>{t('maxWidth')}</span>
            <input
              className="input"
              type="number"
              min={80}
              max={480}
              value={layout.maxWidth ?? 190}
              onChange={(event) =>
                editor.patchLayout(block.id, { maxWidth: Math.max(80, Number(event.target.value) || 190) })
              }
            />
          </label>
        )}

        {!isRoot && (
          <label className="field">
            <span>{t('weight')}</span>
            <input
              className="input"
              type="number"
              min={1}
              max={8}
              value={layout.weight ?? 1}
              onChange={(event) =>
                editor.patchLayout(block.id, { weight: Math.max(1, Number(event.target.value) || 1) })
              }
            />
          </label>
        )}

      </section>

      <section className="section">
        <h3>{t('skinSec')}</h3>
        <label className="field">
          <span>{t('type')}</span>
          <select
            className="input"
            value={block.skin.kind}
            onChange={(event) => editor.patchSkin(block.id, { kind: event.target.value as SkinKind })}
          >
            {skinOptions.map((kind) => (
              <option key={kind} value={kind}>
                {t(SKIN_LABELS[kind])}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>{t('tone')}</span>
          <div className="swatches">
            {TONES.map((tone) => {
              const colors = toneColors(tone);
              return (
                <button
                  type="button"
                  key={tone}
                  className={`swatch${block.skin.tone === tone ? ' is-active' : ''}`}
                  style={{ background: colors.solid, borderColor: colors.stroke }}
                  title={t(TONE_LABELS[tone])}
                  aria-label={t(TONE_LABELS[tone])}
                  onClick={() => editor.patchSkin(block.id, { tone })}
                />
              );
            })}
          </div>
        </div>

        <label className="field">
          <span>{t('outline')}</span>
          <select
            className="input"
            value={block.skin.outline ?? SKINS[block.skin.kind].outline}
            onChange={(event) =>
              editor.patchSkin(block.id, {
                outline: event.target.value as 'solid' | 'dashed' | 'none',
              })
            }
          >
            <option value="solid">{t('outlineSolid')}</option>
            <option value="dashed">{t('outlineDashed')}</option>
            <option value="none">{t('outlineNone')}</option>
          </select>
        </label>

        {hasChildren && (
          <label className="field switch">
            <span>{t('collapse')}</span>
            <input
              type="checkbox"
              checked={Boolean(block.collapsed)}
              onChange={(event) => editor.patchBlock(block.id, { collapsed: event.target.checked })}
            />
          </label>
        )}
      </section>

      <section className="section">
        <h3>{t('actions')}</h3>
        <div className="action-grid">
          <button type="button" className="btn ghost" onClick={() => editor.addBlock('container', block.id)}>
            {t('addChild')}
          </button>
          <button type="button" className="btn ghost" onClick={() => editor.addSibling()}>
            {t('addSibling')}
          </button>
          <button type="button" className="btn ghost" onClick={() => editor.promote(block.id)} disabled={isRoot}>
            {t('promote')}
          </button>
          <button type="button" className="btn ghost" onClick={() => editor.demote(block.id)} disabled={!canDemote}>
            {t('demote')}
          </button>
          <button type="button" className="btn ghost" onClick={() => editor.moveBlockUpDown(block.id, -1)} disabled={isRoot}>
            {t('moveUp')}
          </button>
          <button type="button" className="btn ghost" onClick={() => editor.moveBlockUpDown(block.id, 1)} disabled={isRoot}>
            {t('moveDown')}
          </button>
          <button type="button" className="btn ghost" onClick={() => editor.duplicateBlock(block.id)} disabled={isRoot}>
            {t('duplicate')}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (isRoot) return;
              void editor
                .askConfirm(t('confirmDelete'), t('remove'), true)
                .then((ok) => {
                  if (ok) editor.removeBlock(block.id);
                });
            }}
            disabled={isRoot}
          >
            {t('remove')}
          </button>
        </div>
      </section>

      <LinksPanel editor={editor} />
    </aside>
  );
}
