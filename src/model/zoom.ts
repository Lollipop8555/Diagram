import type { Rect } from './types';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

/** Keep zoom inside the supported range and snap to whole percentages. */
export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 100) / 100;
}

/** One button/keyboard step of 20%. */
export function stepZoom(current: number, direction: 1 | -1): number {
  return clampZoom(direction === 1 ? current * 1.2 : current / 1.2);
}

/** Space kept free around a fitted diagram for the hint and zoom controls. */
export const FIT_PADDING = { x: 96, y: 110 };

/**
 * Centre `bounds` inside `box` at the largest zoom that still fits, capped at
 * 100%. Returns the pan offset for a stage translated before being scaled.
 */
export function fitView(
  bounds: Rect,
  box: { width: number; height: number },
  padding = FIT_PADDING,
): { zoom: number; pan: { x: number; y: number } } {
  const scaleX = (box.width - padding.x) / Math.max(1, bounds.w);
  const scaleY = (box.height - padding.y) / Math.max(1, bounds.h);
  const zoom = Math.max(ZOOM_MIN, Math.min(1, Math.min(scaleX, scaleY)));
  return {
    zoom,
    pan: {
      x: (box.width - bounds.w * zoom) / 2 - bounds.x * zoom,
      y: (box.height - bounds.h * zoom) / 2 - bounds.y * zoom,
    },
  };
}
