export const FONT_TITLE = '600 14px -apple-system, "PingFang SC", "Segoe UI", Inter, sans-serif';
export const FONT_BODY = '500 13px -apple-system, "PingFang SC", "Segoe UI", Inter, sans-serif';
export const FONT_SUB = '400 11px -apple-system, "PingFang SC", "Segoe UI", Inter, sans-serif';
export const FONT_BADGE = '600 10px -apple-system, "PingFang SC", "Segoe UI", Inter, sans-serif';
export const FONT_DOC = '600 20px ui-serif, "Songti SC", Georgia, serif';

export const LINE_TITLE = 20;
export const LINE_BODY = 18;
export const LINE_SUB = 15;

let ctx: CanvasRenderingContext2D | null = null;
function context(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  ctx = c.getContext('2d');
  return ctx;
}

const cache = new Map<string, number>();

export function textWidth(text: string, font: string): number {
  const key = font + '\u0000' + text;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const c = context();
  let w = 0;
  if (c) {
    c.font = font;
    w = c.measureText(text).width;
  } else {
    // Fallback estimate for non-DOM (tests): CJK ~1em, latin ~0.55em.
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '13');
    for (const ch of text) w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? size : size * 0.55;
  }
  cache.set(key, w);
  return w;
}

const CJK = /[\u3000-\u9fff\uff00-\uffef]/;

/** Split text into tokens: CJK chars individually, latin runs as words. */
function tokens(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const ch of text) {
    if (CJK.test(ch) || ch === ' ') {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      out.push(ch);
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** Greedy wrap by measured width. */
export function wrapText(text: string, font: string, maxWidth: number): string[] {
  if (!text) return [];
  const max = Math.max(24, maxWidth);
  if (textWidth(text, font) <= max) return [text];
  const lines: string[] = [];
  let line = '';
  for (const tok of tokens(text)) {
    const next = line + tok;
    if (line && textWidth(next.trimEnd(), font) > max) {
      lines.push(line.trimEnd());
      line = tok === ' ' ? '' : tok;
    } else {
      line = next;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.length ? lines : [text];
}

export function clearMeasureCache(): void {
  cache.clear();
}
