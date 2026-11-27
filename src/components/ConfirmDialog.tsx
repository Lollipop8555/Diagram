import { useCallback } from 'react';
import type { Editor } from '../model/store';
import { Modal } from './Modal';

/**
 * Modal confirmation used instead of `window.confirm`: it is styleable, ships its
 * own focus handling and keeps keyboard flow inside the app.
 */
export function ConfirmDialog({ editor }: { editor: Editor }) {
  const request = editor.confirm;
  const { answerConfirm, t } = editor;
  const close = useCallback(() => answerConfirm(false), [answerConfirm]);

  if (!request) return null;

  return (
    <Modal labelledBy="confirm-title" describedBy="confirm-body" onClose={close}>
      <h2 className="dialog-title" id="confirm-title">
        {t('dialogTitle')}
      </h2>
      <p className="dialog-body" id="confirm-body">
        {request.message}
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn ghost" onClick={close}>
          {request.cancelLabel}
        </button>
        <button
          type="button"
          className={request.danger ? 'btn danger' : 'btn primary'}
          data-autofocus
          onClick={() => answerConfirm(true)}
        >
          {request.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
