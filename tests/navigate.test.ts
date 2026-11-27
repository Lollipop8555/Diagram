import { describe, expect, it } from 'vitest';
import type { ID, Rect } from '../src/model/types';
import { nextBlockInDirection } from '../src/canvas/navigate';

/** 3x3 grid of 100x40 boxes, 20px apart, origin at (0,0). */
function grid(): Record<ID, Rect> {
  const rects: Record<ID, Rect> = {};
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      rects[`${row}${col}`] = { x: col * 120, y: row * 60, w: 100, h: 40 };
    }
  }
  return rects;
}

describe('arrow-key navigation', () => {
  it('moves to the aligned neighbour', () => {
    const rects = grid();
    expect(nextBlockInDirection(rects, '11', 'right')).toBe('12');
    expect(nextBlockInDirection(rects, '11', 'left')).toBe('10');
    expect(nextBlockInDirection(rects, '11', 'down')).toBe('21');
    expect(nextBlockInDirection(rects, '11', 'up')).toBe('01');
  });

  it('returns null at the edges', () => {
    const rects = grid();
    expect(nextBlockInDirection(rects, '00', 'up')).toBeNull();
    expect(nextBlockInDirection(rects, '00', 'left')).toBeNull();
    expect(nextBlockInDirection(rects, '22', 'down')).toBeNull();
    expect(nextBlockInDirection(rects, '22', 'right')).toBeNull();
  });

  it('prefers the aligned block over a closer diagonal one', () => {
    const rects: Record<ID, Rect> = {
      from: { x: 0, y: 0, w: 100, h: 40 },
      diagonal: { x: 90, y: 130, w: 100, h: 40 },
      aligned: { x: 0, y: 150, w: 100, h: 40 },
    };
    expect(nextBlockInDirection(rects, 'from', 'down')).toBe('aligned');
  });

  it('ignores unknown ids and empty maps', () => {
    expect(nextBlockInDirection({}, 'missing', 'down')).toBeNull();
    expect(nextBlockInDirection(grid(), 'missing', 'down')).toBeNull();
  });

  it('steps out of a container before reaching its siblings', () => {
    const rects: Record<ID, Rect> = {
      parent: { x: 0, y: 0, w: 400, h: 200 },
      child: { x: 10, y: 30, w: 100, h: 40 },
      sibling: { x: 0, y: 240, w: 400, h: 100 },
    };
    // the enclosing block sits below the child, so it is the first hop out
    expect(nextBlockInDirection(rects, 'child', 'down')).toBe('parent');
    expect(nextBlockInDirection(rects, 'child', 'right')).toBe('parent');
    expect(nextBlockInDirection(rects, 'parent', 'down')).toBe('sibling');
  });
});
