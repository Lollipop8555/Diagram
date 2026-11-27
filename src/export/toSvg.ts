import type { DiagramDoc } from '../model/types';
import type { EdgeGeom } from '../layout/edges';
import type { LayoutResult } from '../layout/dispatch';
import { expandBounds } from '../layout/edges';
import { skinDefOf, toneColors } from '../skins/palette';
import { textWidth, wrapText } from '../model/measure';
import { countBlocks } from '../model/tree';

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif';
const STACK = '-apple-system, "PingFang SC", "Segoe UI", sans-serif';

/** Font shorthands mirroring the canvas CSS declarations. */
const CHIP_TITLE = `600 14px ${STACK}`;
const CHIP_SUB = `400 11px ${STACK}`;
const SMALL = `600 11px ${STACK}`;
const NOTE_FONT = `italic 400 11px ${STACK}`;
const BADGE_FONT = `600 9px ${STACK}`;
const COUNT_FONT = `600 12px ${STACK}`;
const BAND_TITLE = `600 11.5px ${STACK}`;
const BAND_SUB = `400 10px ${STACK}`;

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Ellipsis-truncate the way CSS `text-overflow: ellipsis` does. */
function fit(text: string, font: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (textWidth(text, font) <= maxWidth) return text;
  let out = '';
  for (const ch of text) {
    if (textWidth(`${out}${ch}…`, font) > maxWidth) break;
    out += ch;
  }
  return `${out}…`;
}

function line(
  x: number,
  y: number,
  text: string,
  size: number,
  color: string,
  weight = 400,
  anchor: 'start' | 'middle' | 'end' = 'start',
  extra = '',
): string {
  const anchorAttr = anchor === 'start' ? '' : ` text-anchor="${anchor}"`;
  const weightAttr = weight === 400 ? '' : ` font-weight="${weight}"`;
  return `<text x="${x}" y="${y}"${anchorAttr} font-size="${size}"${weightAttr} fill="${color}"${extra}>${esc(text)}</text>`;
}

export interface SvgOptions {
  background?: boolean;
  relations?: boolean;
  margin?: number;
}

export function docToSvg(
  doc: DiagramDoc,
  layout: LayoutResult,
  edges: EdgeGeom[],
  options: SvgOptions = {},
): string {
  const { background = true, relations = true, margin = 28 } = options;
  const bounds = expandBounds(layout.bounds, edges);
  const width = Math.ceil(bounds.w + margin * 2);
  const height = Math.ceil(bounds.h + margin * 2);
  const dx = margin - bounds.x;
  const dy = margin - bounds.y;

  const parts: string[] = [];
  const docTitle = doc.meta.title || 'pop_diagram';
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family='${FONT_FAMILY}' role="img" aria-label="${esc(docTitle)}">`,
  );
  parts.push(`<title>${esc(docTitle)}</title>`);
  parts.push('<defs>');
  parts.push(
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7F2E9"/><stop offset="1" stop-color="#EDE4D8"/></linearGradient>`,
  );
  parts.push(
    '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6B6478"/></marker>',
  );
  parts.push('</defs>');

  if (background) parts.push(`<rect width="${width}" height="${height}" fill="url(#bg)"/>`);

  parts.push(`<g transform="translate(${dx} ${dy})">`);

  layout.entries.forEach(({ block, rect }) => {
    const def = skinDefOf(block.skin);
    const colors = toneColors(block.skin.tone);
    const kind = block.skin.kind;
    const outline = block.skin.outline ?? def.outline;
    const radius = block.skin.radius ?? def.radius;
    const chrome = kind !== 'plain' && block.layout.kind !== 'spacer';

    if (chrome) {
      const dash = outline === 'dashed' ? ' stroke-dasharray="5 4"' : '';
      const stroke = outline === 'none' ? 'none' : colors.stroke;
      parts.push(
        `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="${radius}" fill="${colors.fill}" stroke="${stroke}" stroke-width="1"${dash}/>`,
      );
    }

    if (block.collapsed) {
      const count = String(Math.max(0, countBlocks(block) - 1));
      const cy = rect.y + rect.h / 2;
      const countW = textWidth(count, BADGE_FONT) + 10;
      parts.push(
        line(rect.x + 10, cy + 4, fit(block.title ?? '', COUNT_FONT, rect.w - 30 - countW), 12, colors.ink, 600),
      );
      parts.push(
        `<rect x="${rect.x + rect.w - 10 - countW}" y="${cy - 7}" width="${countW}" height="14" rx="7" fill="#FFFFFF" opacity="0.7"/>`,
      );
      parts.push(line(rect.x + rect.w - 10 - countW / 2, cy + 3.5, count, 9, '#6B6478', 600, 'middle'));
      return;
    }

    if (block.badge) {
      const badgeW = textWidth(block.badge, BADGE_FONT) + 12;
      const badgeX = rect.x + rect.w - 8 - badgeW;
      parts.push(
        `<rect x="${badgeX}" y="${rect.y + 6}" width="${badgeW}" height="13" rx="6.5" fill="#FFFFFF" opacity="0.65"/>`,
      );
      parts.push(line(badgeX + badgeW / 2, rect.y + 15.5, block.badge, 9, '#6B6478', 600, 'middle'));
    }

    if (kind === 'band') {
      if (!block.title) return;
      // Thin caption strip at the top-left, mirroring the canvas stylesheet.
      const hasSub = Boolean(block.subtitle);
      const titleWidth = rect.w - 24 - (hasSub ? rect.w * 0.4 : 0);
      parts.push(
        line(rect.x + 12, rect.y + 18, fit(block.title, BAND_TITLE, titleWidth), 11.5, colors.ink, 600),
      );
      if (block.subtitle) {
        parts.push(
          line(
            rect.x + rect.w - 12,
            rect.y + 18,
            fit(block.subtitle, BAND_SUB, rect.w * 0.4),
            10,
            '#6B6478',
            400,
            'end',
          ),
        );
      }
      return;
    }

    if (kind === 'boundary') {
      if (!block.title) return;
      const text = fit(block.title, SMALL, rect.w - 40);
      const chipW = Math.min(rect.w - 20, textWidth(text, SMALL) + 20);
      parts.push(
        `<rect x="${rect.x + 10}" y="${rect.y - 11}" width="${chipW}" height="22" rx="11" fill="${colors.solid}" stroke="${colors.stroke}" stroke-width="1"/>`,
      );
      parts.push(line(rect.x + 20, rect.y + 4, text, 11, colors.ink, 600));
      return;
    }

    if (kind === 'chip') {
      const maxW = Math.max(40, rect.w - 20);
      const titleLines = block.title ? wrapText(block.title, CHIP_TITLE, maxW) : [];
      const sub = block.subtitle ? fit(block.subtitle, CHIP_SUB, maxW) : '';
      const totalH = titleLines.length * 20 + (sub ? 16 : 0);
      const cx = rect.x + rect.w / 2;
      let y = rect.y + (rect.h - totalH) / 2;
      titleLines.forEach((text) => {
        parts.push(line(cx, y + 15, text, 14, colors.ink, 600, 'middle'));
        y += 20;
      });
      if (sub) parts.push(line(cx, y + 12, sub, 11, '#6B6478', 400, 'middle'));
      return;
    }

    if (kind === 'segment') {
      if (block.title) {
        parts.push(line(rect.x + rect.w / 2, rect.y + 16, block.title, 11, colors.ink, 600, 'middle'));
      }
      if (block.subtitle) {
        parts.push(
          line(rect.x + rect.w / 2, rect.y + rect.h - 7, block.subtitle, 10, '#6B6478', 400, 'middle'),
        );
      }
      return;
    }

    if (kind === 'note') {
      const lines = block.title ? wrapText(block.title, NOTE_FONT, Math.max(40, rect.w - 16)) : [];
      lines.forEach((text, i) => {
        parts.push(
          line(rect.x + 8, rect.y + 19 + i * 15, text, 11, colors.ink, 400, 'start', ' opacity="0.8" font-style="italic"'),
        );
      });
      return;
    }

    if (kind === 'container') {
      if (!block.title) return;
      const text = fit(block.title, SMALL, rect.w - 20);
      parts.push(line(rect.x + 10, rect.y + 17, text, 11, colors.ink, 600, 'start', ' opacity="0.7"'));
      return;
    }

    if (!block.title) return;
    parts.push(
      line(rect.x + 4, rect.y + 13, fit(block.title, SMALL, rect.w - 8), 11, colors.ink, 600, 'start', ' opacity="0.55"'),
    );
  });

  if (relations) {
    edges.forEach((edge) => {
      parts.push(
        `<path d="${edge.d}" fill="none" stroke="#6B6478" stroke-width="1.4"${edge.dashed ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#arrow)" opacity="0.8"/>`,
      );
      if (edge.label) {
        const w = edge.label.text.length * 7 + 12;
        parts.push(
          `<rect x="${edge.label.x - w / 2}" y="${edge.label.y - 9}" width="${w}" height="18" rx="9" fill="#F7F2E9" opacity="0.94"/>`,
        );
        parts.push(
          `<text x="${edge.label.x}" y="${edge.label.y + 4}" text-anchor="middle" font-size="10" fill="#4A4456">${esc(edge.label.text)}</text>`,
        );
      }
    });
  }

  parts.push('</g>');
  parts.push('</svg>');
  return parts.join('\n');
}

export function svgToPngBlob(svg: string, scale = 3): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = img.width || 1200;
      const h = img.height || 800;
      const limit = 8000;
      const safeScale = Math.min(scale, limit / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * safeScale);
      canvas.height = Math.round(h * safeScale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas unavailable'));
        return;
      }
      ctx.scale(safeScale, safeScale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((out) => {
        URL.revokeObjectURL(url);
        if (out) resolve(out);
        else reject(new Error('toBlob failed'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('svg load failed'));
    };
    img.src = url;
  });
}
