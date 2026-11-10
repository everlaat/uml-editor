import type { DiagramNode } from './model';

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const center = (n: Rect): Pt => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

export function expand(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function boundsOf(rects: Rect[], pad = 0): Rect | null {
  if (!rects.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * Pick the border point of `node` on the side facing `target`, biased so that
 * near-aligned nodes connect straight down/across instead of diagonally.
 */
export function anchorToward(node: DiagramNode, target: Pt, pad = 0): { p: Pt; side: Side } {
  const c = center(node);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  const horizontal = Math.abs(dx) * node.h > Math.abs(dy) * node.w;
  if (horizontal) {
    const side: Side = dx >= 0 ? 'right' : 'left';
    const x = dx >= 0 ? node.x + node.w + pad : node.x - pad;
    const t = Math.abs(dx) < 1 ? 0 : dy / Math.abs(dx);
    const y = clamp(c.y + (t * node.w) / 2, node.y + 6, node.y + node.h - 6);
    return { p: { x, y }, side };
  }
  const side: Side = dy >= 0 ? 'bottom' : 'top';
  const y = dy >= 0 ? node.y + node.h + pad : node.y - pad;
  const t = Math.abs(dy) < 1 ? 0 : dx / Math.abs(dy);
  const x = clamp(c.x + (t * node.h) / 2, node.x + 6, node.x + node.w - 6);
  return { p: { x, y }, side };
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Orthogonal elbow between two anchored points. */
export function orthogonalPath(a: Pt, aSide: Side, b: Pt, bSide: Side): Pt[] {
  const vertical = aSide === 'top' || aSide === 'bottom';
  const bVertical = bSide === 'top' || bSide === 'bottom';
  if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) return [a, b];
  if (vertical && bVertical) {
    const my = (a.y + b.y) / 2;
    return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
  }
  if (!vertical && !bVertical) {
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  // One vertical, one horizontal: single corner.
  return vertical ? [a, { x: a.x, y: b.y }, b] : [a, { x: b.x, y: a.y }, b];
}

/** Polyline -> SVG path with rounded corners. */
export function roundedPolyline(points: Pt[], radius = 10): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${f(points[0].x)} ${f(points[0].y)} L ${f(points[1].x)} ${f(points[1].y)}`;
  let d = `M ${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const r1 = Math.min(radius, dist(prev, cur) / 2);
    const r2 = Math.min(radius, dist(cur, next) / 2);
    const r = Math.min(r1, r2);
    const p1 = lerpTo(cur, prev, r);
    const p2 = lerpTo(cur, next, r);
    d += ` L ${f(p1.x)} ${f(p1.y)} Q ${f(cur.x)} ${f(cur.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${f(last.x)} ${f(last.y)}`;
  return d;
}

export function curvedPath(a: Pt, aSide: Side, b: Pt, bSide: Side): string {
  const k = Math.max(40, dist(a, b) * 0.35);
  const c1 = offsetBySide(a, aSide, k);
  const c2 = offsetBySide(b, bSide, k);
  return `M ${f(a.x)} ${f(a.y)} C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.x)} ${f(b.y)}`;
}

function offsetBySide(p: Pt, side: Side, k: number): Pt {
  switch (side) {
    case 'top':
      return { x: p.x, y: p.y - k };
    case 'bottom':
      return { x: p.x, y: p.y + k };
    case 'left':
      return { x: p.x - k, y: p.y };
    default:
      return { x: p.x + k, y: p.y };
  }
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

function lerpTo(from: Pt, toward: Pt, d: number): Pt {
  const l = dist(from, toward) || 1;
  return { x: from.x + ((toward.x - from.x) / l) * d, y: from.y + ((toward.y - from.y) / l) * d };
}

/** Point at a fraction along a polyline, used for edge label placement. */
export function pointAlong(points: Pt[], t = 0.5): Pt {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const total = points.slice(1).reduce((sum, p, i) => sum + dist(points[i], p), 0);
  let target = total * t;
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1], points[i]);
    if (target <= seg) {
      const r = seg === 0 ? 0 : target / seg;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * r,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * r,
      };
    }
    target -= seg;
  }
  return points[points.length - 1];
}

/** Rounds to 2dp and strips trailing zeroes — keeps generated SVG small. */
export function f(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

export function snap(v: number, grid: number): number {
  return grid <= 1 ? Math.round(v) : Math.round(v / grid) * grid;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = clamp(t, 0, 1);
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}
