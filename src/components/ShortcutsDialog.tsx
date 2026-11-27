import type { Editor } from '../model/store';
import type { DictKey } from '../i18n/dict';
import { Modal } from './Modal';

const MOD = '⌘ / Ctrl';

const SHORTCUTS: { keys: string; label: DictKey }[] = [
  { keys: `${MOD} Z`, label: 'scUndo' },
  { keys: `${MOD} ⇧ Z`, label: 'scRedo' },
  { keys: `${MOD} D`, label: 'scDuplicate' },
  { keys: 'Alt ↑ / ↓', label: 'scReorder' },
  { keys: 'Alt ←', label: 'scPromote' },
  { keys: 'Alt →', label: 'scDemote' },
  { keys: '↑ ↓ ← →', label: 'scNavigate' },
  { keys: 'Enter', label: 'scAddSibling' },
  { keys: 'Tab', label: 'scFirstChild' },
  { keys: '↑ ↓ / ← →', label: 'scSplitter' },
  { keys: 'Space', label: 'scToggle' },
  { keys: 'F2', label: 'scRename' },
  { keys: 'Delete / ⌫', label: 'scDelete' },
  { keys: `${MOD} + / −`, label: 'scZoom' },
  { keys: `${MOD} 0`, label: 'scFit' },
  { keys: `${MOD} 1`, label: 'scActualSize' },
  { keys: 'Wheel', label: 'scWheel' },
  { keys: `${MOD} E`, label: 'scViewToggle' },
  { keys: `${MOD} Enter`, label: 'scApplyEdit' },
  { keys: 'Right-click', label: 'scContextMenu' },
  { keys: 'Esc', label: 'scEscape' },
  { keys: 'Shift ?', label: 'scHelp' },
];

export function ShortcutsDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  return (
    <Modal labelledBy="shortcuts-title" onClose={onClose}>
      <h2 className="dialog-title" id="shortcuts-title">
        {editor.t('shortcuts')}
      </h2>
      <dl className="shortcut-list">
        {SHORTCUTS.map((row) => (
          <div className="shortcut-row" key={row.keys}>
            <dt>
              <kbd>{row.keys}</kbd>
            </dt>
            <dd>{editor.t(row.label)}</dd>
          </div>
        ))}
      </dl>
      <div className="dialog-actions">
        <button type="button" className="btn primary" data-autofocus onClick={onClose}>
          {editor.t('close')}
        </button>
      </div>
    </Modal>
  );
}
