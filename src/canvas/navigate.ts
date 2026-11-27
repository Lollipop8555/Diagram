import type { ID, Rect } from '../model/types';

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Arrow keys mapped to a spatial direction; anything else is ignored. */
export const ARROW_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** How much an off-axis detour costs compared to a straight step. */
const CROSS_WEIGHT = 4;

/**
 * Nearest block in the given direction, measured between rect centres.
 * Off-axis distance is weighted so aligned neighbours win over diagonal ones.
 */
export function nextBlockInDirection(
  rects: Record<ID, Rect>,
  fromId: ID,
  direction: Direction,
): ID | null {
  const from = rects[fromId];
  if (!from) return null;
  const fx = from.x + from.w / 2;
  const fy = from.y + from.h / 2;

  let bestId: ID | null = null;
  let bestCost = Number.POSITIVE_INFINITY;

  for (const id of Object.keys(rects)) {
    if (id === fromId) continue;
    const rect = rects[id];
    const dx = rect.x + rect.w / 2 - fx;
    const dy = rect.y + rect.h / 2 - fy;

    let along: number;
    let cross: number;
    if (direction === 'right') {
      if (dx <= 1) continue;
      along = dx;
      cross = Math.abs(dy);
    } else if (direction === 'left') {
      if (dx >= -1) continue;
      along = -dx;
      cross = Math.abs(dy);
    } else if (direction === 'down') {
      if (dy <= 1) continue;
      along = dy;
      cross = Math.abs(dx);
    } else {
      if (dy >= -1) continue;
      along = -dy;
      cross = Math.abs(dx);
    }

    const cost = along + cross * CROSS_WEIGHT;
    if (cost < bestCost) {
      bestCost = cost;
      bestId = id;
    }
  }

  return bestId;
}
