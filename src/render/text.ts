/** Canvas-based text measurement so node auto-sizing matches what SVG renders. */

export const FONT_STACK =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif';
export const MONO_STACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

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
  const key = `${size}|${weight}|${mono ? 1 : 0}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const c = measureCtx();
  let width: number;
  if (c) {
    c.font = `${weight} ${size}px ${mono ? MONO_STACK : FONT_STACK}`;
    width = c.measureText(text).width;
  } else {
    width = text.length * size * 0.58; // headless fallback
  }
  if (cache.size > 4000) cache.clear();
  cache.set(key, width);
  return width;
}

/** Greedy word wrap, honouring explicit newlines. Long words are hard-split. */
export function wrapText(text: string, maxWidth: number, size = 14, weight = 500): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, weight) <= maxWidth || !line) {
        if (textWidth(candidate, size, weight) > maxWidth && !line) {
          // Single word too long: hard split.
          let chunk = '';
          for (const ch of word) {
            if (textWidth(chunk + ch, size, weight) > maxWidth && chunk) {
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
