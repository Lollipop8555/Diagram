import { describe, expect, it } from 'vitest';
import type { DiagramDoc } from '../src/model/types';
import {
  emptyHistory,
  MAX_HISTORY,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from '../src/model/history';

function makeDoc(n: number): DiagramDoc {
  return {
    version: 3,
    meta: {
      title: `doc-${n}`,
      template: 'custom',
      direction: 'top-down',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    root: {
      id: 'root',
      title: `root-${n}`,
      skin: { kind: 'plain', tone: 'paper' },
      layout: { kind: 'stack' },
      children: [],
    },
    relations: [],
  };
}

/** Push `count` consecutive snapshots on top of `first`. */
function pushSeries(first: number, count: number): History {
  let history = emptyHistory(makeDoc(first));
  for (let i = 1; i <= count; i += 1) {
    history = pushHistory(history, makeDoc(first + i));
  }
  return history;
}

describe('history stack', () => {
  it('starts empty and records nothing until the first edit', () => {
    const history = emptyHistory(makeDoc(0));
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
    expect(undoHistory(history)).toBe(history);
    expect(redoHistory(history)).toBe(history);
  });

  it('ignores a push that does not change the document', () => {
    const history = emptyHistory(makeDoc(0));
    expect(pushHistory(history, history.present!)).toBe(history);
  });

  it('records the previous snapshot and clears the redo branch', () => {
    let history = pushSeries(0, 2);
    expect(history.past).toHaveLength(2);
    history = undoHistory(history);
    expect(history.future).toHaveLength(1);
    history = pushHistory(history, makeDoc(99));
    expect(history.future).toEqual([]);
    expect(history.present?.meta.title).toBe('doc-99');
  });

  it('walks back and forth through the same snapshots', () => {
    let history = pushSeries(0, 3);
    const latest = history.present;
    history = undoHistory(history);
    expect(history.present?.meta.title).toBe('doc-2');
    expect(history.past).toHaveLength(2);
    history = redoHistory(history);
    expect(history.present).toBe(latest);
    expect(history.future).toEqual([]);
  });

  it('keeps at most MAX_HISTORY undo steps and drops the oldest', () => {
    const total = MAX_HISTORY + 40;
    let history = pushSeries(0, total);
    expect(history.past).toHaveLength(MAX_HISTORY);

    let steps = 0;
    while (history.past.length) {
      history = undoHistory(history);
      steps += 1;
    }
    expect(steps).toBe(MAX_HISTORY);
    expect(history.present?.meta.title).toBe(`doc-${total - MAX_HISTORY}`);
    expect(undoHistory(history)).toBe(history);
  });

  it('caps the redo stack as well', () => {
    let history = pushSeries(0, MAX_HISTORY + 10);
    for (let i = 0; i < MAX_HISTORY + 10; i += 1) history = undoHistory(history);
    expect(history.future).toHaveLength(MAX_HISTORY);
    history = redoHistory(history);
    expect(history.future).toHaveLength(MAX_HISTORY - 1);
  });

  it('recovers when a document is loaded without any previous state', () => {
    const loaded = pushHistory(emptyHistory(null), makeDoc(7));
    expect(loaded.present?.meta.title).toBe('doc-7');
    expect(loaded.past).toEqual([]);
    expect(undoHistory(loaded)).toBe(loaded);
  });
});
