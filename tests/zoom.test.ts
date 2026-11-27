import { describe, expect, it } from 'vitest';
import { clampZoom, stepZoom, ZOOM_MAX, ZOOM_MIN } from '../src/model/zoom';

describe('zoom helpers', () => {
  it('steps by 20% in both directions', () => {
    expect(stepZoom(1, 1)).toBe(1.2);
    expect(stepZoom(1, -1)).toBe(0.83);
  });

  it('clamps at the supported range', () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
    expect(clampZoom(0.001)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
  });

  it('falls back to 1 for non-finite input', () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('snaps to whole percentages', () => {
    expect(clampZoom(0.333)).toBe(0.33);
    expect(clampZoom(1.007)).toBe(1.01);
    expect(clampZoom(1.004)).toBe(1);
  });
});
