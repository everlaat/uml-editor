/** Canvas-based text measurement so node auto-sizing matches what SVG renders. */
import { FONT_STACKS, type ResolvedText } from './typography';

export const FONT_STACK = FONT_STACKS.sans;
export const MONO_STACK = FONT_STACKS.mono;

let ctx: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  ctx = canvas.getContext('2d');
  return ctx;
}

const cache = new Map<string, number>();

export function textWidth(text: string, size = 14, weight = 500, mono = false): number {
  return measureWidth(text, { size, weight, family: mono ? MONO_STACK : FONT_STACK });
}

interface FontSpec {
  size: number;
  weight: number;
  family: string;
  italic?: boolean;
  letterSpacing?: number;
}

export function measureWidth(text: string, font: FontSpec): number {
  const key = `${font.size}|${font.weight}|${font.italic ? 'i' : ''}|${font.letterSpacing ?? 0}|${font.family}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const c = measureCtx();
  let width: number;
  if (c) {
    c.font = `${font.italic ? 'italic ' : ''}${font.weight} ${font.size}px ${font.family}`;
    width = c.measureText(text).width;
  } else {
    width = text.length * font.size * 0.58; // headless fallback
  }
  width += (font.letterSpacing ?? 0) * Math.max(0, text.length - 1);
  if (cache.size > 4000) cache.clear();
  cache.set(key, width);
  return width;
}

/** Greedy word wrap, honouring explicit newlines. Long words are hard-split. */
export function wrapText(text: string, maxWidth: number, size = 14, weight = 500): string[] {
  return wrapWith(text, maxWidth, (t) => textWidth(t, size, weight));
}

/** Wrapping against any measuring function, so styled text wraps correctly. */
export function wrapWith(text: string, maxWidth: number, width: (t: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(candidate) <= maxWidth || !line) {
        if (width(candidate) > maxWidth && !line) {
          // Single word too long: hard split.
          let chunk = '';
          for (const ch of word) {
            if (width(chunk + ch) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
          continue;
        }
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

export interface Measured {
  lines: string[];
  width: number;
  height: number;
}

export function measureLabel(text: string, maxWidth: number, size = 14, weight = 500, lineHeight = 1.35): Measured {
  const lines = wrapText(text, maxWidth, size, weight);
  const width = Math.max(0, ...lines.map((l) => textWidth(l, size, weight)));
  return { lines, width, height: lines.length * size * lineHeight };
}

/** Measure and wrap with a fully resolved text style. */
export function measureStyled(text: string, maxWidth: number, style: ResolvedText): Measured {
  const measure = (t: string) =>
    measureWidth(t, {
      size: style.size,
      weight: style.weight,
      family: style.family,
      italic: style.italic,
      letterSpacing: style.letterSpacing,
    });
  const source = style.uppercase ? text.toUpperCase() : text;
  const lines = wrapWith(source, Math.max(8, maxWidth), measure);
  return {
    lines,
    width: Math.max(0, ...lines.map(measure)),
    height: lines.length * style.size * style.lineHeight,
  };
}
