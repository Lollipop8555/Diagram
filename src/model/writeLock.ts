import { useEffect, useState } from 'react';

export type WriteLockState = 'pending' | 'owner' | 'blocked';

const LOCK_NAME = 'macaron-diagram-writer';
const FALLBACK_KEY = 'macaron.writer.v1';
const STALE_MS = 5000;

/**
 * Only one tab may write to the shared localStorage. Web Locks does this
 * natively; a heartbeat key in localStorage is the fallback for browsers
 * without it. Losers keep retrying, so they take over automatically once the
 * owner tab is closed.
 */
export function useWriteLock(): WriteLockState {
  const [state, setState] = useState<WriteLockState>('pending');

  useEffect(() => {
    let disposed = false;
    let retry = 0;
    let renew = 0;
    let releaseHold: (() => void) | null = null;

    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;

    const fallback = () => {
      const id = Math.random().toString(36).slice(2);
      const read = () => {
        try {
          const raw = localStorage.getItem(FALLBACK_KEY);
          return raw ? (JSON.parse(raw) as { id: string; ts: number }) : null;
        } catch {
          return null;
        }
      };
      const write = () =>
        localStorage.setItem(FALLBACK_KEY, JSON.stringify({ id, ts: Date.now() }));

      const claim = () => {
        if (disposed) return;
        const current = read();
        if (!current || current.id === id || Date.now() - current.ts > STALE_MS) {
          write();
          window.setTimeout(() => {
            if (disposed) return;
            if (read()?.id === id) {
              setState('owner');
              renew = window.setInterval(write, 2000);
            } else {
              setState('blocked');
              retry = window.setTimeout(claim, 2000);
            }
          }, 120);
          return;
        }
        setState('blocked');
        retry = window.setTimeout(claim, 2000);
      };

      claim();
      return () => {
        window.clearTimeout(retry);
        window.clearInterval(renew);
        if (read()?.id === id) localStorage.removeItem(FALLBACK_KEY);
      };
    };

    if (!locks) {
      return fallback();
    }

    const acquire = () => {
      if (disposed) return;
      locks
        .request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
          if (disposed) return;
          if (!lock) {
            setState('blocked');
            retry = window.setTimeout(acquire, 600);
            return;
          }
          setState('owner');
          // Hold the lock while this editor is mounted; release it on cleanup so
          // a remount (HMR / StrictMode) or another tab can take over.
          await new Promise<void>((resolve) => {
            releaseHold = resolve;
          });
        })
        .catch(() => {
          if (disposed) return;
          setState('blocked');
          retry = window.setTimeout(acquire, 1000);
        });
    };

    acquire();
    return () => {
      disposed = true;
      window.clearTimeout(retry);
      releaseHold?.();
    };
  }, []);

  return state;
}
