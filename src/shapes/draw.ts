import { f } from '../core/geometry';

/** Small path builders shared by the shape definitions. */

export const rect = (x: number, y: number, w: number, h: number): string =>
  `M ${f(x)} ${f(y)} H ${f(x + w)} V ${f(y + h)} H ${f(x)} Z`;

export const line = (x1: number, y1: number, x2: number, y2: number): string =>
  `M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}`;

export function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M ${f(x + rr)} ${f(y)} H ${f(x + w - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x + w)} ${f(y + rr)}` +
    ` V ${f(y + h - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x + w - rr)} ${f(y + h)}` +
    ` H ${f(x + rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x)} ${f(y + h - rr)}` +
    ` V ${f(y + rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x + rr)} ${f(y)} Z`
  );
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M ${f(cx - rx)} ${f(cy)} A ${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}` +
    ` A ${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)} Z`
  );
}

export const polygon = (points: [number, number][]): string =>
  `${points.map(([x, y], i) => `${i ? 'L' : 'M'} ${f(x)} ${f(y)}`).join(' ')} Z`;

/** A wavy "document" edge running left to right at height `y`. */
export function wave(x: number, y: number, w: number, amplitude = 8, flip = false): string {
  const dir = flip ? -1 : 1;
  return (
    `L ${f(x + w)} ${f(y)} C ${f(x + w * 0.72)} ${f(y + amplitude * dir)}` +
    ` ${f(x + w * 0.28)} ${f(y - amplitude * dir)} ${f(x)} ${f(y)}`
  );
}

export function inset(w: number, fraction = 0.16, max = 20): number {
  return Math.min(max, w * fraction);
}
