import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * Shared modal shell: scrim click / Escape close it, Tab is trapped inside and
 * focus returns to the trigger when it unmounts.
 *
 * `onClose` should be a stable callback (useCallback) so the effect does not
 * re-run on every render and yank focus back to the first control.
 */
export function Modal({
  labelledBy,
  describedBy,
  onClose,
  wide = false,
  children,
}: {
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  /** Wider card for list-style dialogs (projects). */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement;
    restoreRef.current = previous instanceof HTMLElement ? previous : null;
    const card = cardRef.current;
    const first = card?.querySelector<HTMLElement>(`[data-autofocus], ${FOCUSABLE}`);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !card) return;
      const items = card.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!items.length) return;
      const head = items[0];
      const tail = items[items.length - 1];
      if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      } else if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      restoreRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="dialog-scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog${wide ? ' is-wide' : ''}`}
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      >
        {children}
      </div>
    </div>
  );
}
