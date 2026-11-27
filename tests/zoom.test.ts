import { describe, expect, it } from 'vitest';
import { clampZoom, fitView, stepZoom, ZOOM_MAX, ZOOM_MIN } from '../src/model/zoom';

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

describe('fitView', () => {
  const box = { width: 637, height: 668 };

  it('scales a large diagram down to the width it has', () => {
    const fit = fitView({ x: 0, y: 0, w: 880, h: 400 }, box);
    expect(fit.zoom).toBeCloseTo(541 / 880, 6);
    expect(fit.pan.x).toBeCloseTo(48, 6);
    expect(fit.pan.y).toBeCloseTo((668 - 400 * (541 / 880)) / 2, 6);
  });

  it('never zooms past 100% and centres the leftovers', () => {
    const fit = fitView({ x: 0, y: 0, w: 200, h: 100 }, box);
    expect(fit.zoom).toBe(1);
    expect(fit.pan).toEqual({ x: 218.5, y: 284 });
  });

  it('accounts for the diagram origin', () => {
    const fit = fitView({ x: 100, y: 50, w: 200, h: 100 }, box);
    expect(fit.pan).toEqual({ x: 118.5, y: 234 });
  });

  it('stays at the minimum zoom instead of going negative', () => {
    expect(fitView({ x: 0, y: 0, w: 4000, h: 4000 }, { width: 120, height: 80 }).zoom).toBe(
      ZOOM_MIN,
    );
  });
});
