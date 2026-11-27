import type { Editor } from '../model/store';
import type { TemplateId } from '../model/types';
import { TEMPLATES } from './templateList';

const TINTS: Record<TemplateId, [string, string, string]> = {
  layered: ['#DCE6F5', '#E9E3F6', '#E4F1E6'],
  protocol: ['#DCE6F5', '#DCE6F5', '#DCE6F5'],
  stack: ['#F5E3D6', '#F7EDD6', '#E4F1E6'],
  c4: ['#E9E3F6', '#DCE6F5', '#F5E6EC'],
  deploy: ['#E4F1E6', '#F7EDD6', '#DCE6F5'],
  module: ['#DCE6F5', '#E9E3F6', '#F5E3D6'],
  memory: ['#F5E6EC', '#F7EDD6', '#E4F1E6'],
  custom: ['#E9E3F6', '#DCE6F5', '#F7EDD6'],
};

function Thumb({ id }: { id: TemplateId }) {
  const [a, b, c] = TINTS[id];

  if (id === 'layered' || id === 'protocol') {
    const rows = id === 'layered' ? 4 : 5;
    return (
      <svg viewBox="0 0 132 74" className="thumb">
        {Array.from({ length: rows }).map((_, i) => (
          <g key={i}>
            <rect x="8" y={8 + i * 13} width="116" height="10" rx="4" fill={[a, b, c][i % 3]} />
            <rect x="12" y={11 + i * 13} width="16" height="4" rx="2" fill="rgba(47,42,56,0.16)" />
            <rect x="34" y={11 + i * 13} width={30 + ((i * 13) % 40)} height="4" rx="2" fill="rgba(255,255,255,0.85)" />
          </g>
        ))}
      </svg>
    );
  }

  if (id === 'memory') {
    return (
      <svg viewBox="0 0 132 74" className="thumb">
        <rect x="8" y="16" width="116" height="34" rx="6" fill={a} />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x={13 + i * 27} y="24" width="21" height="18" rx="4" fill={i % 2 ? b : '#fff'} />
            <rect x={15 + i * 27} y="40" width="12" height="3" rx="1.5" fill="rgba(47,42,56,0.2)" />
          </g>
        ))}
      </svg>
    );
  }

  if (id === 'c4' || id === 'deploy') {
    return (
      <svg viewBox="0 0 132 74" className="thumb">
        <rect x="8" y="8" width="116" height="58" rx="8" fill="none" stroke="rgba(47,42,56,0.18)" strokeDasharray="4 3" />
        <rect x="14" y="14" width="48" height="22" rx="5" fill={a} />
        <rect x="18" y="19" width="20" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
        <rect x="18" y="27" width="30" height="4" rx="2" fill="rgba(47,42,56,0.14)" />
        <rect x="70" y="14" width="48" height="22" rx="5" fill={b} />
        <rect x="74" y="19" width="24" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
        <rect x="14" y="42" width="104" height="18" rx="5" fill={c} />
        <rect x="18" y="48" width="26" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
        <rect x="50" y="48" width="26" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
        <rect x="82" y="48" width="26" height="5" rx="2.5" fill="rgba(255,255,255,0.9)" />
      </svg>
    );
  }

  if (id === 'stack') {
    return (
      <svg viewBox="0 0 132 74" className="thumb">
        {[0, 1, 2].map((i) => (
          <rect key={i} x={12 + i * 6} y={10 + i * 16} width={108 - i * 12} height="14" rx="5" fill={[a, b, c][i]} />
        ))}
        <rect x="18" y="60" width="96" height="6" rx="3" fill="rgba(47,42,56,0.08)" />
      </svg>
    );
  }

  if (id === 'module') {
    return (
      <svg viewBox="0 0 132 74" className="thumb">
        <rect x="8" y="10" width="56" height="54" rx="6" fill={a} />
        <rect x="68" y="10" width="56" height="54" rx="6" fill={b} />
        {[0, 1].map((row) =>
          [0, 1].map((col) => (
            <g key={`${row}-${col}`}>
              <rect x={14 + col * 24} y={18 + row * 20} width="20" height="14" rx="3" fill="#fff" opacity="0.9" />
              <rect x={74 + col * 24} y={18 + row * 20} width="20" height="14" rx="3" fill="#fff" opacity="0.9" />
            </g>
          )),
        )}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 132 74" className="thumb">
      <rect x="8" y="10" width="116" height="20" rx="5" fill={a} />
      <rect x="8" y="36" width="54" height="28" rx="5" fill={b} />
      <rect x="68" y="36" width="54" height="28" rx="5" fill={c} />
      <circle cx="28" cy="50" r="4" fill="rgba(255,255,255,0.9)" />
      <circle cx="88" cy="50" r="4" fill="rgba(255,255,255,0.9)" />
    </svg>
  );
}

export function EmptyState({ editor }: { editor: Editor }) {
  const { locale, t } = editor;

  return (
    <div className="empty">
      <div className="empty-hero">
        <p className="kicker">{t('appName')}</p>
        <h1>{t('emptyTitle')}</h1>
        <p className="lede">{t('emptyDesc')}</p>
        <ul className="empty-points">
          <li>{t('dragHint')}</li>
          <li>{t('importHint')}</li>
          <li>{t('structureHint')}</li>
        </ul>
      </div>

      <div className="template-grid">
        {Object.values(TEMPLATES).map((template) => (
          <button
            type="button"
            key={template.id}
            className="template-card"
            onClick={() => editor.createFromTemplate(template.id)}
          >
            <Thumb id={template.id} />
            <span className="template-name">{template.name[locale]}</span>
            <span className="template-tagline">{template.tagline[locale]}</span>
            <span className="template-go">{t('useTemplate')} →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
