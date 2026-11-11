import {
  anchorToward,
  center,
  curvedPath,
  dist,
  f,
  orthogonalPath,
  roundedPolyline,
  type Pt,
  type Side,
} from '../core/geometry';
import { waypointsValid } from '../core/layout';
import type { Diagram, DiagramEdge, DiagramNode, RouteStyle } from '../core/model';

export interface Route {
  d: string;
  points: Pt[];
}

export function defaultRouteStyle(doc: Diagram): RouteStyle {
  return doc.kind === 'class' ? 'straight' : 'orthogonal';
}

/**
 * Work out the path for one edge. Pure geometry so it can be unit-tested and
 * reused by the canvas and the SVG export.
 *
 * When auto-layout has reserved a lane for the edge (`waypoints`), the route
 * travels through it; otherwise it is a direct anchor-to-anchor route.
 */
export function routeEdge(
  doc: Diagram,
  edge: DiagramEdge,
  from: DiagramNode,
  to: DiagramNode,
  offset = 0,
): Route {
  if (from.id === to.id) return selfLoop(from);
  const style = edge.route ?? defaultRouteStyle(doc);
  const vertical = doc.direction === 'TB' || doc.direction === 'BT';

  if (waypointsValid(edge, from, to)) {
    const via = edge.waypoints!;
    const a = anchorToward(from, via[0], 2);
    const b = anchorToward(to, via[via.length - 1], 2);
    const through = [a.p, ...via.map((p) => ({ ...p })), b.p];
    if (style === 'straight') return { d: polyline(through), points: through };
    if (style === 'curved') return { d: roundedPolyline(through, 24), points: through };
    const points = squareUp(through, vertical);
    return { d: roundedPolyline(points, 12), points };
  }

  const ca = center(from);
  const cb = center(to);
  const target = offset ? perpOffset(ca, cb, offset) : cb;
  const source = offset ? perpOffset(cb, ca, -offset) : ca;
  const a = anchorToward(from, target, 2);
  const b = anchorToward(to, source, 2);
  if (style === 'curved') {
    return { d: curvedPath(a.p, a.side, b.p, b.side), points: [a.p, midOf(a.p, b.p), b.p] };
  }
  if (style === 'straight') {
    return { d: `M ${f(a.p.x)} ${f(a.p.y)} L ${f(b.p.x)} ${f(b.p.y)}`, points: [a.p, b.p] };
  }
  const points = orthogonalPath(a.p, a.side, b.p, b.side);
  return { d: roundedPolyline(points, 12), points };
}

/** Insert corners so every segment is axis-aligned. */
export function squareUp(points: Pt[], vertical: boolean): Pt[] {
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    const dx = Math.abs(cur.x - prev.x);
    const dy = Math.abs(cur.y - prev.y);
    if (dx > 0.5 && dy > 0.5) {
      // Turn along the flow axis first, so an edge leaves a shape the way the
      // diagram reads before it slides across into its lane.
      out.push(vertical ? { x: prev.x, y: cur.y } : { x: cur.x, y: prev.y });
    }
    out.push(cur);
  }
  return dedupe(out);
}

function dedupe(points: Pt[]): Pt[] {
  return points.filter((p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) > 0.5 || Math.abs(p.y - points[i - 1].y) > 0.5);
}

function polyline(points: Pt[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${f(p.x)} ${f(p.y)}`).join(' ');
}

function midOf(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function perpOffset(from: Pt, to: Pt, amount: number): Pt {
  const d = dist(from, to) || 1;
  const nx = -(to.y - from.y) / d;
  const ny = (to.x - from.x) / d;
  return { x: to.x + nx * amount, y: to.y + ny * amount };
}

function selfLoop(n: DiagramNode): Route {
  const a = { x: n.x + n.w, y: n.y + n.h * 0.3 };
  const b = { x: n.x + n.w, y: n.y + n.h * 0.7 };
  const r = 34;
  const d = `M ${f(a.x)} ${f(a.y)} C ${f(a.x + r)} ${f(a.y - r * 0.4)} ${f(b.x + r)} ${f(b.y + r * 0.4)} ${f(b.x)} ${f(b.y)}`;
  return { d, points: [a, { x: a.x + r, y: (a.y + b.y) / 2 }, b] };
}

/** Fan out edges that share the same pair of nodes so they stay distinguishable. */
export function parallelOffsets(edges: DiagramEdge[]): Map<string, number> {
  const buckets = new Map<string, DiagramEdge[]>();
  for (const e of edges) {
    const key = [e.from, e.to].sort().join('->');
    const list = buckets.get(key) ?? [];
    list.push(e);
    buckets.set(key, list);
  }
  const offsets = new Map<string, number>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    list.forEach((e, i) => offsets.set(e.id, (i - (list.length - 1) / 2) * 26));
  }
  return offsets;
}

export type { Side };
