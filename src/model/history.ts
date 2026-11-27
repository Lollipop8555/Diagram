import type { DiagramDoc } from './types';

export const MAX_HISTORY = 60;

export interface History {
  past: DiagramDoc[];
  present: DiagramDoc | null;
  future: DiagramDoc[];
}

export function emptyHistory(present: DiagramDoc | null = null): History {
  return { past: [], present, future: [] };
}

/**
 * Record an edited snapshot: the previous one moves onto the undo stack (capped at
 * `max` entries) and any redo branch is dropped.
 */
export function pushHistory(history: History, next: DiagramDoc, max = MAX_HISTORY): History {
  if (next === history.present) return history;
  if (!history.present) return { past: [], present: next, future: [] };
  return {
    past: [...history.past, history.present].slice(-max),
    present: next,
    future: [],
  };
}

export function undoHistory(history: History, max = MAX_HISTORY): History {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: history.present ? [history.present, ...history.future].slice(0, max) : history.future,
  };
}

export function redoHistory(history: History, max = MAX_HISTORY): History {
  if (!history.future.length) return history;
  return {
    past: history.present ? [...history.past, history.present].slice(-max) : history.past,
    present: history.future[0],
    future: history.future.slice(1),
  };
}
