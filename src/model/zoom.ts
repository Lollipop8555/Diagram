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
