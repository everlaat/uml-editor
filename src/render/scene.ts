import {
  anchorToward,
  boundsOf,
  center,
  curvedPath,
  dist,
  f,
  orthogonalPath,
  pointAlong,
  roundedPolyline,
  type Pt,
  type Rect,
  type Side,
} from '../core/geometry';
import type { ArrowHead, Diagram, DiagramEdge, DiagramNode } from '../core/model';
import type { Selection } from '../core/store';
import { classHeaderHeight, compartmentHeight, labelFontSize, shapeGeometry } from './shapes';
import { clear, setAttrs, svgEl } from './svg';
import { FONT_STACK, MONO_STACK, measureLabel } from './text';
import { resolveColor, type ThemeTokens } from './theme';

export interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

export interface Ghost {
  /** Edge being drawn. */
  edge?: { from: Pt; to: Pt };
  /** Marquee rectangle in diagram space. */
  marquee?: Rect;
  /** Node drop preview while dragging from the palette. */
  drop?: Rect;
  /** Highlight a node as a connect target. */
  targetNode?: string;
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 4;

interface NodeEls {
  g: SVGGElement;
  signature: string;
}

/**
 * Keyed SVG renderer. Node content is rebuilt only when its signature changes;
 * position updates are a single transform write, which keeps dragging at 60fps.
 */
export class Scene {
  readonly svg: SVGSVGElement;
  readonly host: HTMLElement;
  view: ViewState = { x: 0, y: 0, zoom: 1 };
  theme: ThemeTokens;
  showGrid = true;
  ghost: Ghost = {};

  private defs: SVGDefsElement;
  private gridRect: SVGRectElement;
  private root: SVGGElement;
  private gGroups: SVGGElement;
  private gEdges: SVGGElement;
  private gNodes: SVGGElement;
  private gOverlay: SVGGElement;
  private nodeEls = new Map<string, NodeEls>();
  private edgeEls = new Map<string, SVGGElement>();
  private lastRoutes = new Map<string, Pt[]>();

  constructor(host: HTMLElement, theme: ThemeTokens) {
    this.host = host;
    this.theme = theme;
    this.svg = svgEl('svg', { class: 'scene', width: '100%', height: '100%' });
    this.defs = svgEl('defs');
    const pattern = svgEl('pattern', {
      id: 'umlx-grid',
      width: 20,
      height: 20,
      patternUnits: 'userSpaceOnUse',
    });
    pattern.append(
      svgEl('path', { d: 'M 20 0 L 0 0 0 20', fill: 'none', 'stroke-width': 1, stroke: theme.grid }),
    );
    this.defs.append(pattern);
    this.gridRect = svgEl('rect', { width: '100%', height: '100%', fill: 'url(#umlx-grid)' });
    this.root = svgEl('g', { class: 'scene-root' });
    this.gGroups = svgEl('g', { class: 'layer-groups' });
    this.gEdges = svgEl('g', { class: 'layer-edges' });
    this.gNodes = svgEl('g', { class: 'layer-nodes' });
    this.gOverlay = svgEl('g', { class: 'layer-overlay' });
    this.root.append(this.gGroups, this.gEdges, this.gNodes, this.gOverlay);
    this.svg.append(this.defs, this.gridRect, this.root);
    host.append(this.svg);
  }

  setTheme(theme: ThemeTokens): void {
    this.theme = theme;
    const path = this.defs.querySelector('pattern path');
    if (path) setAttrs(path, { stroke: theme.grid });
    this.nodeEls.clear();
    clear(this.gNodes);
  }

  size(): { w: number; h: number } {
    const r = this.host.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  screenToDiagram(clientX: number, clientY: number): Pt {
    const r = this.svg.getBoundingClientRect();
    return {
      x: (clientX - r.left - this.view.x) / this.view.zoom,
      y: (clientY - r.top - this.view.y) / this.view.zoom,
    };
  }

  diagramToScreen(p: Pt): Pt {
    const r = this.svg.getBoundingClientRect();
    return { x: p.x * this.view.zoom + this.view.x + r.left, y: p.y * this.view.zoom + this.view.y + r.top };
  }

  setView(next: Partial<ViewState>): void {
    this.view = { ...this.view, ...next };
    this.view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.zoom));
    this.applyTransform();
  }

  zoomAt(clientX: number, clientY: number, factor: number): void {
    const before = this.screenToDiagram(clientX, clientY);
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.zoom * factor));
    const r = this.svg.getBoundingClientRect();
    this.view.zoom = zoom;
    this.view.x = clientX - r.left - before.x * zoom;
    this.view.y = clientY - r.top - before.y * zoom;
    this.applyTransform();
  }

  contentBounds(doc: Diagram, pad = 40): Rect | null {
    const rects: Rect[] = doc.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
    return boundsOf(rects, pad);
  }

  fit(doc: Diagram, maxZoom = 1.2): void {
    const bounds = this.contentBounds(doc, 60);
    const { w, h } = this.size();
    if (!bounds || w === 0 || h === 0) {
      this.setView({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const zoom = Math.min(maxZoom, w / bounds.w, h / bounds.h);
    this.view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.view.x = (w - bounds.w * this.view.zoom) / 2 - bounds.x * this.view.zoom;
    this.view.y = (h - bounds.h * this.view.zoom) / 2 - bounds.y * this.view.zoom;
    this.applyTransform();
  }

  centerOn(p: Pt): void {
    const { w, h } = this.size();
    this.view.x = w / 2 - p.x * this.view.zoom;
    this.view.y = h / 2 - p.y * this.view.zoom;
    this.applyTransform();
  }

  private applyTransform(): void {
    const { x, y, zoom } = this.view;
    setAttrs(this.root, { transform: `translate(${f(x)} ${f(y)}) scale(${f(zoom)})` });
    setAttrs(this.gridRect, {
      fill: this.showGrid ? 'url(#umlx-grid)' : 'none',
    });
    const pattern = this.defs.querySelector('pattern');
    if (pattern) setAttrs(pattern, { patternTransform: `translate(${f(x)} ${f(y)}) scale(${f(zoom)})` });
  }

  /** Full render pass. Cheap enough to call on every change and drag frame. */
  render(doc: Diagram, selection: Selection): void {
    this.applyTransform();
    this.renderGroups(doc);
    this.renderNodes(doc);
    this.renderEdges(doc, selection);
    this.renderOverlay(doc, selection);
  }

  routeOf(edgeId: string): Pt[] | undefined {
    return this.lastRoutes.get(edgeId);
  }

  private renderGroups(doc: Diagram): void {
    clear(this.gGroups);
    for (const group of doc.groups) {
      const members = doc.nodes.filter((n) => n.parent === group.id);
      if (!members.length) continue;
      const b = boundsOf(
        members.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h })),
        26,
      );
      if (!b) continue;
      group.x = b.x;
      group.y = b.y - 22;
      group.w = b.w;
      group.h = b.h + 22;
      const g = svgEl('g');
      g.append(
        svgEl('rect', {
          x: f(group.x),
          y: f(group.y),
          width: f(group.w),
          height: f(group.h),
          rx: 12,
          fill: this.theme.group,
          stroke: this.theme.groupStroke,
          'stroke-dasharray': '6 4',
        }),
      );
      const label = svgEl('text', {
        x: f(group.x + 14),
        y: f(group.y + 16),
        fill: this.theme.textMuted,
        'font-family': FONT_STACK,
        'font-size': 12,
        'font-weight': 600,
      });
      label.textContent = group.label;
      g.append(label);
      this.gGroups.append(g);
    }
  }

  private renderNodes(doc: Diagram): void {
    const seen = new Set<string>();
    for (const node of doc.nodes) {
      seen.add(node.id);
      const sig = nodeSignature(node);
      let entry = this.nodeEls.get(node.id);
      if (!entry) {
        const g = svgEl('g', { class: 'node', 'data-node-id': node.id });
        this.gNodes.append(g);
        entry = { g, signature: '' };
        this.nodeEls.set(node.id, entry);
      }
      if (entry.signature !== sig) {
        clear(entry.g);
        this.paintNode(entry.g, node);
        entry.signature = sig;
      }
      setAttrs(entry.g, { transform: `translate(${f(node.x)} ${f(node.y)})` });
    }
    for (const [id, entry] of this.nodeEls) {
      if (!seen.has(id)) {
        entry.g.remove();
        this.nodeEls.delete(id);
      }
    }
    // Keep DOM order aligned with document order (z-order).
    doc.nodes.forEach((n) => {
      const entry = this.nodeEls.get(n.id);
      if (entry) this.gNodes.append(entry.g);
    });
  }

  private paintNode(g: SVGGElement, node: DiagramNode): void {
    const color = resolveColor(this.theme, node.color);
    const local: DiagramNode = { ...node, x: 0, y: 0 };
    const geo = shapeGeometry(local);
    const filled = node.shape !== 'actor';
    g.append(
      svgEl('path', {
        d: geo.path,
        fill: filled ? color.fill : 'none',
        stroke: color.stroke,
        'stroke-width': 1.75,
        'stroke-linejoin': 'round',
        class: 'node-shape',
      }),
    );
    for (const d of geo.decorations ?? []) {
      g.append(
        svgEl('path', {
          d,
          fill: 'none',
          stroke: color.stroke,
          'stroke-width': 1.5,
          'stroke-linecap': 'round',
          class: 'node-deco',
        }),
      );
    }
    if (node.shape === 'class') this.paintClassBody(g, local, color.text, color.stroke);
    else this.paintLabel(g, node, geo.textBox, color.text);
  }

  private paintLabel(
    g: SVGGElement,
    node: DiagramNode,
    box: { x: number; y: number; w: number; h: number },
    fill: string,
  ): void {
    if (!node.label) return;
    const size = labelFontSize(node.shape);
    const weight = node.shape === 'note' ? 400 : 500;
    const m = measureLabel(node.label, Math.max(30, box.w), size, weight);
    const lineHeight = size * 1.35;
    const startY = box.y + box.h / 2 - m.height / 2 + lineHeight * 0.72;
    const text = svgEl('text', {
      x: f(box.x + box.w / 2),
      y: f(startY),
      fill,
      'font-family': FONT_STACK,
      'font-size': size,
      'font-weight': weight,
      'text-anchor': 'middle',
      class: 'node-label',
    });
    m.lines.forEach((line, i) => {
      const tspan = svgEl('tspan', { x: f(box.x + box.w / 2), dy: i === 0 ? 0 : f(lineHeight) });
      tspan.textContent = line;
      text.append(tspan);
    });
    g.append(text);
  }

  private paintClassBody(g: SVGGElement, node: DiagramNode, fill: string, stroke: string): void {
    const header = classHeaderHeight(node);
    let y = node.stereotype ? 18 : 20;
    if (node.stereotype) {
      const st = svgEl('text', {
        x: f(node.w / 2),
        y: f(y),
        fill,
        'font-family': FONT_STACK,
        'font-size': 11,
        'font-style': 'italic',
        'text-anchor': 'middle',
        opacity: 0.85,
      });
      st.textContent = `«${node.stereotype}»`;
      g.append(st);
      y += 17;
    }
    const title = svgEl('text', {
      x: f(node.w / 2),
      y: f(y),
      fill,
      'font-family': FONT_STACK,
      'font-size': 14,
      'font-weight': 700,
      'text-anchor': 'middle',
    });
    title.textContent = node.label;
    g.append(title);

    let cursor = header + 16;
    const addRows = (rows: string[] | undefined) => {
      for (const row of rows ?? []) {
        const t = svgEl('text', {
          x: 10,
          y: f(cursor),
          fill,
          'font-family': MONO_STACK,
          'font-size': 11.5,
        });
        t.textContent = row;
        g.append(t);
        cursor += 18;
      }
      if (rows?.length) cursor += 10;
    };
    addRows(node.attributes);
    if (!node.attributes?.length && node.methods?.length) cursor = header + compartmentHeight(node.attributes) + 16;
    addRows(node.methods);
    void stroke;
  }

  private renderEdges(doc: Diagram, selection: Selection): void {
    const seen = new Set<string>();
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    const parallel = groupParallel(doc.edges);
    for (const edge of doc.edges) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) continue;
      seen.add(edge.id);
      let g = this.edgeEls.get(edge.id);
      if (!g) {
        g = svgEl('g', { class: 'edge', 'data-edge-id': edge.id });
        this.gEdges.append(g);
        this.edgeEls.set(edge.id, g);
      }
      clear(g);
      const offset = parallel.get(edge.id) ?? 0;
      const route = this.routeEdge(doc, edge, from, to, offset);
      this.lastRoutes.set(edge.id, route.points);
      const selected = selection.edges.has(edge.id);
      const color = edge.color ?? (selected ? this.theme.accent : this.theme.edge);
      const width = edge.line === 'thick' ? 3.2 : 1.8;
      // Invisible fat line for easy hit testing.
      g.append(svgEl('path', { d: route.d, fill: 'none', stroke: 'transparent', 'stroke-width': 14, class: 'edge-hit' }));
      g.append(
        svgEl('path', {
          d: route.d,
          fill: 'none',
          stroke: color,
          'stroke-width': selected ? width + 1 : width,
          'stroke-dasharray': edge.line === 'dashed' ? '7 5' : undefined,
          'stroke-linecap': 'round',
          class: 'edge-line',
        }),
      );
      const pts = route.points;
      if (edge.endArrow !== 'none') {
        g.append(...arrowHead(pts[pts.length - 1], pts[pts.length - 2] ?? pts[0], edge.endArrow, color, this.theme));
      }
      if (edge.startArrow !== 'none') {
        g.append(...arrowHead(pts[0], pts[1] ?? pts[pts.length - 1], edge.startArrow, color, this.theme));
      }
      if (edge.label) {
        const mid = pointAlong(pts, 0.5);
        const m = measureLabel(edge.label, 180, 12, 500);
        const padX = 6;
        g.append(
          svgEl('rect', {
            x: f(mid.x - m.width / 2 - padX),
            y: f(mid.y - m.height / 2 - 3),
            width: f(m.width + padX * 2),
            height: f(m.height + 6),
            rx: 4,
            fill: this.theme.edgeLabelBg,
            opacity: 0.92,
          }),
        );
        const text = svgEl('text', {
          x: f(mid.x),
          y: f(mid.y - m.height / 2 + 12),
          fill: selected ? this.theme.accent : this.theme.textMuted,
          'font-family': FONT_STACK,
          'font-size': 12,
          'font-weight': 500,
          'text-anchor': 'middle',
          class: 'edge-label',
        });
        m.lines.forEach((line, i) => {
          const tspan = svgEl('tspan', { x: f(mid.x), dy: i === 0 ? 0 : f(16) });
          tspan.textContent = line;
          text.append(tspan);
        });
        g.append(text);
      }
    }
    for (const [id, g] of this.edgeEls) {
      if (!seen.has(id)) {
        g.remove();
        this.edgeEls.delete(id);
        this.lastRoutes.delete(id);
      }
    }
  }

  private routeEdge(
    doc: Diagram,
    edge: DiagramEdge,
    from: DiagramNode,
    to: DiagramNode,
    offset: number,
  ): { d: string; points: Pt[] } {
    if (from.id === to.id) return selfLoop(from);
    const style = edge.route ?? defaultRoute(doc);
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
    const pts = orthogonalPath(a.p, a.side, b.p, b.side);
    return { d: roundedPolyline(pts, 12), points: pts };
  }

  private renderOverlay(doc: Diagram, selection: Selection): void {
    clear(this.gOverlay);
    const z = this.view.zoom;
    const handle = 4.5 / z;
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));

    for (const id of selection.nodes) {
      const n = byId.get(id);
      if (!n) continue;
      this.gOverlay.append(
        svgEl('rect', {
          x: f(n.x - 4 / z),
          y: f(n.y - 4 / z),
          width: f(n.w + 8 / z),
          height: f(n.h + 8 / z),
          rx: 6 / z,
          fill: 'none',
          stroke: this.theme.accent,
          'stroke-width': 1.5 / z,
          'stroke-dasharray': `${4 / z} ${3 / z}`,
          class: 'sel-ring',
        }),
      );
    }

    // Resize handles + ports for a single selected node.
    if (selection.nodes.size === 1 && !this.ghost.edge && !this.ghost.marquee) {
      const n = byId.get([...selection.nodes][0]);
      if (n) {
        for (const h of resizeHandles(n)) {
          this.gOverlay.append(
            svgEl('rect', {
              x: f(h.x - handle),
              y: f(h.y - handle),
              width: f(handle * 2),
              height: f(handle * 2),
              rx: 1.5 / z,
              fill: this.theme.surface,
              stroke: this.theme.accent,
              'stroke-width': 1.5 / z,
              class: 'handle',
              'data-handle': h.dir,
              'data-owner': n.id,
            }),
          );
        }
        for (const p of portPoints(n)) {
          this.gOverlay.append(
            svgEl('circle', {
              cx: f(p.x),
              cy: f(p.y),
              r: f(5 / z),
              fill: this.theme.accent,
              stroke: this.theme.surface,
              'stroke-width': 1.5 / z,
              class: 'port',
              'data-port': p.side,
              'data-owner': n.id,
            }),
          );
        }
      }
    }

    if (this.ghost.targetNode) {
      const n = byId.get(this.ghost.targetNode);
      if (n) {
        this.gOverlay.append(
          svgEl('rect', {
            x: f(n.x - 3 / z),
            y: f(n.y - 3 / z),
            width: f(n.w + 6 / z),
            height: f(n.h + 6 / z),
            rx: 6 / z,
            fill: 'none',
            stroke: this.theme.accent,
            'stroke-width': 2.5 / z,
          }),
        );
      }
    }

    if (this.ghost.edge) {
      const { from, to } = this.ghost.edge;
      this.gOverlay.append(
        svgEl('path', {
          d: `M ${f(from.x)} ${f(from.y)} L ${f(to.x)} ${f(to.y)}`,
          stroke: this.theme.accent,
          'stroke-width': 2 / z,
          'stroke-dasharray': `${6 / z} ${4 / z}`,
          fill: 'none',
        }),
      );
      this.gOverlay.append(
        svgEl('circle', { cx: f(to.x), cy: f(to.y), r: f(4 / z), fill: this.theme.accent }),
      );
    }

    if (this.ghost.marquee) {
      const m = this.ghost.marquee;
      this.gOverlay.append(
        svgEl('rect', {
          x: f(m.x),
          y: f(m.y),
          width: f(m.w),
          height: f(m.h),
          fill: this.theme.accent,
          'fill-opacity': 0.12,
          stroke: this.theme.accent,
          'stroke-width': 1 / z,
        }),
      );
    }

    if (this.ghost.drop) {
      const d = this.ghost.drop;
      this.gOverlay.append(
        svgEl('rect', {
          x: f(d.x),
          y: f(d.y),
          width: f(d.w),
          height: f(d.h),
          rx: 8 / z,
          fill: this.theme.accent,
          'fill-opacity': 0.14,
          stroke: this.theme.accent,
          'stroke-width': 1.5 / z,
          'stroke-dasharray': `${6 / z} ${4 / z}`,
        }),
      );
    }
  }
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

/** Fan out edges that share the same node pair. */
function groupParallel(edges: DiagramEdge[]): Map<string, number> {
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
    const step = 26;
    list.forEach((e, i) => offsets.set(e.id, (i - (list.length - 1) / 2) * step));
  }
  return offsets;
}

function defaultRoute(doc: Diagram): 'orthogonal' | 'straight' | 'curved' {
  return doc.kind === 'class' ? 'straight' : 'orthogonal';
}

function selfLoop(n: DiagramNode): { d: string; points: Pt[] } {
  const a = { x: n.x + n.w, y: n.y + n.h * 0.3 };
  const b = { x: n.x + n.w, y: n.y + n.h * 0.7 };
  const r = 34;
  const d =
    `M ${f(a.x)} ${f(a.y)} C ${f(a.x + r)} ${f(a.y - r * 0.4)} ${f(b.x + r)} ${f(b.y + r * 0.4)} ${f(b.x)} ${f(b.y)}`;
  return { d, points: [a, { x: a.x + r, y: (a.y + b.y) / 2 }, b] };
}

export function resizeHandles(n: DiagramNode): { x: number; y: number; dir: string }[] {
  return [
    { x: n.x, y: n.y, dir: 'nw' },
    { x: n.x + n.w / 2, y: n.y, dir: 'n' },
    { x: n.x + n.w, y: n.y, dir: 'ne' },
    { x: n.x + n.w, y: n.y + n.h / 2, dir: 'e' },
    { x: n.x + n.w, y: n.y + n.h, dir: 'se' },
    { x: n.x + n.w / 2, y: n.y + n.h, dir: 's' },
    { x: n.x, y: n.y + n.h, dir: 'sw' },
    { x: n.x, y: n.y + n.h / 2, dir: 'w' },
  ];
}

export function portPoints(n: DiagramNode): { x: number; y: number; side: Side }[] {
  return [
    { x: n.x + n.w / 2, y: n.y - 10, side: 'top' },
    { x: n.x + n.w + 10, y: n.y + n.h / 2, side: 'right' },
    { x: n.x + n.w / 2, y: n.y + n.h + 10, side: 'bottom' },
    { x: n.x - 10, y: n.y + n.h / 2, side: 'left' },
  ];
}

function arrowHead(tip: Pt, tail: Pt, kind: ArrowHead, color: string, theme: ThemeTokens): SVGElement[] {
  const angle = Math.atan2(tip.y - tail.y, tip.x - tail.x);
  const rotate = `rotate(${f((angle * 180) / Math.PI)} ${f(tip.x)} ${f(tip.y)})`;
  const size = 10;
  switch (kind) {
    case 'arrow':
      return [
        svgEl('path', {
          d: `M ${f(tip.x)} ${f(tip.y)} L ${f(tip.x - size)} ${f(tip.y - size * 0.45)} L ${f(tip.x - size * 0.75)} ${f(tip.y)} L ${f(tip.x - size)} ${f(tip.y + size * 0.45)} Z`,
          fill: color,
          stroke: 'none',
          transform: rotate,
        }),
      ];
    case 'open':
      return [
        svgEl('path', {
          d: `M ${f(tip.x - size)} ${f(tip.y - size * 0.55)} L ${f(tip.x)} ${f(tip.y)} L ${f(tip.x - size)} ${f(tip.y + size * 0.55)}`,
          fill: 'none',
          stroke: color,
          'stroke-width': 1.8,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          transform: rotate,
        }),
      ];
    case 'triangle':
      return [
        svgEl('path', {
          d: `M ${f(tip.x)} ${f(tip.y)} L ${f(tip.x - size * 1.2)} ${f(tip.y - size * 0.7)} L ${f(tip.x - size * 1.2)} ${f(tip.y + size * 0.7)} Z`,
          fill: theme.surface,
          stroke: color,
          'stroke-width': 1.6,
          transform: rotate,
        }),
      ];
    case 'diamond':
    case 'odiamond':
      return [
        svgEl('path', {
          d: `M ${f(tip.x)} ${f(tip.y)} L ${f(tip.x - size)} ${f(tip.y - size * 0.6)} L ${f(tip.x - size * 2)} ${f(tip.y)} L ${f(tip.x - size)} ${f(tip.y + size * 0.6)} Z`,
          fill: kind === 'diamond' ? color : theme.surface,
          stroke: color,
          'stroke-width': 1.6,
          transform: rotate,
        }),
      ];
    case 'circle':
      return [
        svgEl('circle', {
          cx: f(tip.x - size * 0.5),
          cy: f(tip.y),
          r: f(size * 0.45),
          fill: theme.surface,
          stroke: color,
          'stroke-width': 1.6,
          transform: rotate,
        }),
      ];
    case 'cross':
      return [
        svgEl('path', {
          d:
            `M ${f(tip.x - size)} ${f(tip.y - size * 0.5)} L ${f(tip.x)} ${f(tip.y + size * 0.5)}` +
            ` M ${f(tip.x - size)} ${f(tip.y + size * 0.5)} L ${f(tip.x)} ${f(tip.y - size * 0.5)}`,
          fill: 'none',
          stroke: color,
          'stroke-width': 2,
          'stroke-linecap': 'round',
          transform: rotate,
        }),
      ];
    default:
      return [];
  }
}

function nodeSignature(n: DiagramNode): string {
  return [
    n.shape,
    n.w,
    n.h,
    n.label,
    n.color ?? '',
    n.stereotype ?? '',
    (n.attributes ?? []).join('\u0001'),
    (n.methods ?? []).join('\u0001'),
  ].join('\u0000');
}
