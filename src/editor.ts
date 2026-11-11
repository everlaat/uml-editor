import { distToSegment, pointInRect, snap, type Pt, type Rect } from './core/geometry';
import { adjustRoutes, anchorFor, layoutDiagram, resolveOverlaps } from './core/layout';
import {
  DEFAULT_NODE_SIZE,
  makeEdge,
  makeNode,
  uid,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type Direction,
  type NodeShape,
} from './core/model';
import { Store } from './core/store';
import { Scene, portPoints, resizeHandles } from './render/scene';
import { fitNodeSize } from './render/shapes';
import { themeFor } from './render/theme';

type DragKind = 'none' | 'move' | 'resize' | 'edge' | 'marquee' | 'pan';

interface DragState {
  kind: DragKind;
  startScreen: Pt;
  startDiagram: Pt;
  moved: boolean;
  nodeId?: string;
  handle?: string;
  origin?: Map<string, Rect>;
  /** Waypoints as they were when the drag began, so frames do not compound. */
  routeOrigin?: Map<string, Pt[]>;
  additive?: boolean;
  viewStart?: Pt;
  pointerId?: number;
}

const GRID = 10;

export interface EditorEvents {
  onChange?: (reason: string) => void;
}

/**
 * Owns the canvas interactions and all document commands. UI panels call these
 * methods; nothing else mutates the store directly.
 */
export class Editor {
  readonly store: Store;
  readonly scene: Scene;
  readonly host: HTMLElement;
  readonly overlay: HTMLDivElement;

  private drag: DragState = { kind: 'none', startScreen: { x: 0, y: 0 }, startDiagram: { x: 0, y: 0 }, moved: false };
  private spaceDown = false;
  private rafPending = false;
  private clipboard: { nodes: DiagramNode[]; edges: DiagramEdge[] } | null = null;
  private editing: { el: HTMLTextAreaElement; nodeId?: string; edgeId?: string } | null = null;
  private events: EditorEvents;

  constructor(host: HTMLElement, store: Store, events: EditorEvents = {}) {
    this.host = host;
    this.store = store;
    this.events = events;
    this.scene = new Scene(host, themeFor(store.prefs.theme));
    this.scene.showGrid = store.prefs.grid;
    this.overlay = document.createElement('div');
    this.overlay.className = 'canvas-overlay';
    host.append(this.overlay);

    if (store.doc.view) this.scene.setView(store.doc.view);
    else this.scene.fit(store.doc);

    this.bindPointer();
    this.bindKeys();
    this.bindWheel();
    store.subscribe(() => this.scheduleRender());
    let lastSize = this.scene.size();
    const ro = new ResizeObserver(() => {
      // Hold the centre of the canvas steady as panels open or the window changes.
      const next = this.scene.size();
      if (lastSize.w && lastSize.h && (next.w !== lastSize.w || next.h !== lastSize.h)) {
        this.scene.setView({
          x: this.scene.view.x + (next.w - lastSize.w) / 2,
          y: this.scene.view.y + (next.h - lastSize.h) / 2,
        });
      }
      lastSize = next;
      this.scheduleRender();
    });
    ro.observe(host);
    this.render();
  }

  // ------------------------------------------------------------- rendering

  scheduleRender(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.render();
    });
  }

  render(): void {
    this.scene.showGrid = this.store.prefs.grid;
    this.scene.render(this.store.doc, this.store.selection);
    this.positionEditor();
  }

  setTheme(mode: 'light' | 'dark'): void {
    this.scene.setTheme(themeFor(mode));
    this.render();
  }

  // ------------------------------------------------------------- hit tests

  private nodeAt(p: Pt): DiagramNode | undefined {
    const nodes = this.store.doc.nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (pointInRect(p, { x: n.x, y: n.y, w: n.w, h: n.h })) return n;
    }
    return undefined;
  }

  private edgeAt(p: Pt): DiagramEdge | undefined {
    const tolerance = 8 / this.scene.view.zoom;
    for (const edge of this.store.doc.edges) {
      const route = this.scene.routeOf(edge.id);
      if (!route) continue;
      for (let i = 1; i < route.length; i++) {
        if (distToSegment(p, route[i - 1], route[i]) <= tolerance) return edge;
      }
    }
    return undefined;
  }

  // ------------------------------------------------------------ interaction

  private bindWheel(): void {
    this.scene.svg.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          const factor = Math.exp(-e.deltaY * 0.01);
          this.scene.zoomAt(e.clientX, e.clientY, factor);
        } else {
          const k = e.deltaMode === 1 ? 16 : 1;
          this.scene.setView({
            x: this.scene.view.x - e.deltaX * k,
            y: this.scene.view.y - e.deltaY * k,
          });
        }
        this.persistView();
        this.scheduleRender();
      },
      { passive: false },
    );
  }

  private bindPointer(): void {
    const svg = this.scene.svg;
    svg.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    svg.addEventListener('pointermove', (e) => this.onPointerMove(e));
    svg.addEventListener('pointerup', (e) => this.onPointerUp(e));
    svg.addEventListener('pointercancel', () => this.endDrag());
    svg.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.editing) this.commitLabel();
    const target = e.target as Element;
    const p = this.scene.screenToDiagram(e.clientX, e.clientY);
    const base: DragState = {
      kind: 'none',
      startScreen: { x: e.clientX, y: e.clientY },
      startDiagram: p,
      moved: false,
      additive: e.shiftKey,
      pointerId: e.pointerId,
    };
    this.scene.svg.setPointerCapture(e.pointerId);

    const panRequested = e.button === 1 || this.spaceDown || (e.button === 0 && e.altKey);
    if (panRequested) {
      this.drag = { ...base, kind: 'pan', viewStart: { x: this.scene.view.x, y: this.scene.view.y } };
      this.host.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;

    const handleEl = target.closest('[data-handle]');
    if (handleEl) {
      const nodeId = handleEl.getAttribute('data-owner')!;
      const node = this.store.doc.nodes.find((n) => n.id === nodeId);
      if (node) {
        this.drag = {
          ...base,
          kind: 'resize',
          nodeId,
          handle: handleEl.getAttribute('data-handle')!,
          origin: new Map([[nodeId, { x: node.x, y: node.y, w: node.w, h: node.h }]]),
        };
        return;
      }
    }

    const portEl = target.closest('[data-port]');
    if (portEl) {
      const nodeId = portEl.getAttribute('data-owner')!;
      this.drag = { ...base, kind: 'edge', nodeId };
      this.scene.ghost.edge = { from: p, to: p };
      this.scheduleRender();
      return;
    }

    const nodeEl = target.closest('[data-node-id]');
    const node = nodeEl ? this.store.doc.nodes.find((n) => n.id === nodeEl.getAttribute('data-node-id')) : this.nodeAt(p);
    if (node) {
      if (e.shiftKey) this.store.toggleSelect(node.id);
      else if (!this.store.selection.nodes.has(node.id)) this.store.select([node.id]);
      const origin = new Map<string, Rect>();
      for (const n of this.store.selectedNodes()) origin.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });
      const routeOrigin = new Map<string, Pt[]>();
      for (const e of this.store.doc.edges) {
        if (e.waypoints?.length && origin.has(e.from) && origin.has(e.to)) {
          routeOrigin.set(e.id, e.waypoints.map((p) => ({ ...p })));
        }
      }
      this.drag = { ...base, kind: 'move', nodeId: node.id, origin, routeOrigin };
      return;
    }

    const edgeEl = target.closest('[data-edge-id]');
    const edge = edgeEl
      ? this.store.doc.edges.find((x) => x.id === edgeEl.getAttribute('data-edge-id'))
      : this.edgeAt(p);
    if (edge) {
      if (e.shiftKey) this.store.toggleSelect(undefined, edge.id);
      else this.store.select([], [edge.id]);
      this.drag = { ...base, kind: 'none' };
      return;
    }

    this.drag = { ...base, kind: 'marquee' };
    if (!e.shiftKey) this.store.clearSelection();
  }

  private onPointerMove(e: PointerEvent): void {
    const drag = this.drag;
    if (drag.kind === 'none') {
      return;
    }
    const p = this.scene.screenToDiagram(e.clientX, e.clientY);
    const dx = p.x - drag.startDiagram.x;
    const dy = p.y - drag.startDiagram.y;
    if (Math.abs(e.clientX - drag.startScreen.x) > 2 || Math.abs(e.clientY - drag.startScreen.y) > 2) {
      drag.moved = true;
    }

    switch (drag.kind) {
      case 'pan': {
        const vs = drag.viewStart!;
        this.scene.setView({
          x: vs.x + (e.clientX - drag.startScreen.x),
          y: vs.y + (e.clientY - drag.startScreen.y),
        });
        break;
      }
      case 'move': {
        if (!drag.moved) break;
        const useSnap = this.store.prefs.snap !== e.altKey;
        this.store.patch(
          (doc) => {
            let appliedX = 0;
            let appliedY = 0;
            for (const [id, start] of drag.origin!) {
              const n = doc.nodes.find((x) => x.id === id);
              if (!n) continue;
              n.x = useSnap ? snap(start.x + dx, GRID) : Math.round(start.x + dx);
              n.y = useSnap ? snap(start.y + dy, GRID) : Math.round(start.y + dy);
              appliedX = n.x - start.x;
              appliedY = n.y - start.y;
            }
            this.moveRoutes(doc, drag, appliedX, appliedY);
          },
          { label: 'move', coalesce: `move:${[...drag.origin!.keys()].join(',')}` },
        );
        break;
      }
      case 'resize': {
        const start = drag.origin!.get(drag.nodeId!)!;
        const useSnap = this.store.prefs.snap !== e.altKey;
        const next = resizeRect(start, drag.handle!, dx, dy, useSnap ? GRID : 1);
        this.store.patch(
          (doc) => {
            const n = doc.nodes.find((x) => x.id === drag.nodeId);
            if (!n) return;
            n.x = next.x;
            n.y = next.y;
            n.w = next.w;
            n.h = next.h;
            adjustRoutes(doc, new Set([n.id]));
          },
          { label: 'resize', coalesce: `resize:${drag.nodeId}` },
        );
        break;
      }
      case 'edge': {
        const from = this.store.doc.nodes.find((n) => n.id === drag.nodeId);
        if (!from) break;
        const target = this.nodeAt(p);
        this.scene.ghost.edge = { from: closestPort(from, p), to: p };
        this.scene.ghost.targetNode = target && target.id !== from.id ? target.id : undefined;
        this.scheduleRender();
        break;
      }
      case 'marquee': {
        this.scene.ghost.marquee = {
          x: Math.min(drag.startDiagram.x, p.x),
          y: Math.min(drag.startDiagram.y, p.y),
          w: Math.abs(dx),
          h: Math.abs(dy),
        };
        this.scheduleRender();
        break;
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const drag = this.drag;
    const p = this.scene.screenToDiagram(e.clientX, e.clientY);
    if (drag.kind === 'edge' && drag.nodeId) {
      const target = this.nodeAt(p);
      if (target && target.id !== drag.nodeId) {
        this.connect(drag.nodeId, target.id);
      } else if (drag.moved) {
        this.createConnectedNode(drag.nodeId, p);
      }
    }
    if (drag.kind === 'marquee' && this.scene.ghost.marquee) {
      const box = this.scene.ghost.marquee;
      if (box.w > 3 || box.h > 3) {
        const nodes = this.store.doc.nodes
          .filter((n) => rectsOverlap(box, { x: n.x, y: n.y, w: n.w, h: n.h }))
          .map((n) => n.id);
        this.store.select(nodes, [], drag.additive);
      }
    }
    this.endDrag();
  }

  private endDrag(): void {
    this.host.classList.remove('panning');
    this.scene.ghost = {};
    this.drag = { kind: 'none', startScreen: { x: 0, y: 0 }, startDiagram: { x: 0, y: 0 }, moved: false };
    this.persistView();
    this.scheduleRender();
    this.events.onChange?.('drag-end');
  }

  private onDoubleClick(e: MouseEvent): void {
    const p = this.scene.screenToDiagram(e.clientX, e.clientY);
    const node = this.nodeAt(p);
    if (node) {
      this.editLabel(node.id);
      return;
    }
    const edge = this.edgeAt(p);
    if (edge) {
      this.editEdgeLabel(edge.id);
      return;
    }
    const created = this.addNode({ x: p.x, y: p.y }, 'rect');
    this.editLabel(created.id);
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        this.spaceDown = true;
        this.host.classList.add('pan-ready');
        e.preventDefault();
      }
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.store.redo();
        else this.store.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        this.store.redo();
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        this.store.select(
          this.store.doc.nodes.map((n) => n.id),
          this.store.doc.edges.map((x) => x.id),
        );
        return;
      }
      if (mod && key === 'c') {
        this.copy();
        return;
      }
      if (mod && key === 'x') {
        this.copy();
        this.deleteSelection();
        return;
      }
      if (mod && key === 'v') {
        this.paste();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        this.duplicate();
        return;
      }
      if (mod && e.shiftKey && key === 'l') {
        e.preventDefault();
        this.autoLayout();
        return;
      }
      if (mod && key === '0') {
        e.preventDefault();
        this.scene.setView({ zoom: 1 });
        this.scheduleRender();
        return;
      }
      if (mod && (key === '1' || key === '9')) {
        e.preventDefault();
        this.fit();
        return;
      }
      if (mod && (key === '=' || key === '+')) {
        e.preventDefault();
        this.zoomBy(1.2);
        return;
      }
      if (mod && key === '-') {
        e.preventDefault();
        this.zoomBy(1 / 1.2);
        return;
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          this.deleteSelection();
          break;
        case 'Escape':
          this.store.clearSelection();
          break;
        case 'Enter': {
          const sel = [...this.store.selection.nodes];
          const selEdge = [...this.store.selection.edges];
          if (sel.length === 1) {
            e.preventDefault();
            this.editLabel(sel[0]);
          } else if (selEdge.length === 1) {
            e.preventDefault();
            this.editEdgeLabel(selEdge[0]);
          }
          break;
        }
        case 'Tab': {
          const sel = [...this.store.selection.nodes];
          if (sel.length === 1) {
            e.preventDefault();
            const node = this.store.doc.nodes.find((n) => n.id === sel[0])!;
            const vertical = this.store.doc.direction === 'TB' || this.store.doc.direction === 'BT';
            const p = vertical
              ? { x: node.x + node.w / 2, y: node.y + node.h + 90 }
              : { x: node.x + node.w + 110, y: node.y + node.h / 2 };
            const created = this.createConnectedNode(node.id, p);
            if (created) this.editLabel(created.id);
          }
          break;
        }
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!this.store.selection.nodes.size) break;
          e.preventDefault();
          const step = e.shiftKey ? GRID * 5 : GRID;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          this.nudge(dx, dy);
          break;
        }
        case 'g':
          this.store.setPrefs({ grid: !this.store.prefs.grid });
          this.scheduleRender();
          break;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        this.host.classList.remove('pan-ready');
      }
    });
  }

  // --------------------------------------------------------------- commands

  addNode(at: Pt, shape: NodeShape = 'rect', label = ''): DiagramNode {
    const size = DEFAULT_NODE_SIZE[shape];
    const node = makeNode({
      x: snap(at.x - size.w / 2, this.store.prefs.snap ? GRID : 1),
      y: snap(at.y - size.h / 2, this.store.prefs.snap ? GRID : 1),
      shape,
      label,
      attributes: shape === 'class' ? [] : undefined,
      methods: shape === 'class' ? [] : undefined,
    });
    this.store.patch((doc) => {
      doc.nodes.push(node);
      if (shape === 'class') doc.kind = 'class';
    }, { label: 'add node' });
    this.store.select([node.id]);
    return node;
  }

  connect(from: string, to: string, partial: Partial<DiagramEdge> = {}): DiagramEdge | null {
    if (from === to && !partial.label) {
      // self-loops are allowed but only when asked for explicitly
    }
    const exists = this.store.doc.edges.some((e) => e.from === from && e.to === to);
    if (exists) return null;
    const edge = makeEdge(from, to, {
      ...partial,
      endArrow: partial.endArrow ?? (this.store.doc.kind === 'class' ? 'open' : 'arrow'),
    });
    this.store.patch((doc) => doc.edges.push(edge), { label: 'connect' });
    this.store.select([], [edge.id]);
    return edge;
  }

  private createConnectedNode(fromId: string, at: Pt): DiagramNode | null {
    const from = this.store.doc.nodes.find((n) => n.id === fromId);
    if (!from) return null;
    const shape: NodeShape = from.shape === 'class' ? 'class' : 'rect';
    const size = DEFAULT_NODE_SIZE[shape];
    const node = makeNode({
      x: snap(at.x - size.w / 2, GRID),
      y: snap(at.y - size.h / 2, GRID),
      shape,
      attributes: shape === 'class' ? [] : undefined,
      methods: shape === 'class' ? [] : undefined,
    });
    const edge = makeEdge(from.id, node.id, {
      endArrow: this.store.doc.kind === 'class' ? 'open' : 'arrow',
    });
    this.store.patch(
      (doc) => {
        doc.nodes.push(node);
        doc.edges.push(edge);
      },
      { label: 'add connected node' },
    );
    this.store.select([node.id]);
    return node;
  }

  deleteSelection(): void {
    const nodes = new Set(this.store.selection.nodes);
    const edges = new Set(this.store.selection.edges);
    if (!nodes.size && !edges.size) return;
    this.store.patch(
      (doc) => {
        doc.nodes = doc.nodes.filter((n) => !nodes.has(n.id));
        doc.edges = doc.edges.filter((e) => !edges.has(e.id) && !nodes.has(e.from) && !nodes.has(e.to));
      },
      { label: 'delete' },
    );
    this.store.clearSelection();
  }

  nudge(dx: number, dy: number): void {
    const ids = new Set(this.store.selection.nodes);
    if (!ids.size) return;
    this.store.patch(
      (doc) => {
        for (const n of doc.nodes) {
          if (!ids.has(n.id)) continue;
          n.x += dx;
          n.y += dy;
        }
        adjustRoutes(doc, ids, dx, dy);
      },
      { label: 'nudge', coalesce: 'nudge' },
    );
  }

  copy(): void {
    const nodes = this.store.selectedNodes();
    if (!nodes.length) return;
    const ids = new Set(nodes.map((n) => n.id));
    const edges = this.store.doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    this.clipboard = JSON.parse(JSON.stringify({ nodes, edges }));
  }

  paste(offset = 24): void {
    if (!this.clipboard?.nodes.length) return;
    const map = new Map<string, string>();
    const nodes = this.clipboard.nodes.map((n) => {
      const id = uid();
      map.set(n.id, id);
      return { ...n, id, x: n.x + offset, y: n.y + offset };
    });
    const edges = this.clipboard.edges.map((e) => ({
      ...e,
      id: uid('e'),
      from: map.get(e.from)!,
      to: map.get(e.to)!,
      waypoints: undefined,
      waypointAnchor: undefined,
    }));
    this.store.patch(
      (doc) => {
        doc.nodes.push(...nodes);
        doc.edges.push(...edges);
      },
      { label: 'paste' },
    );
    this.store.select(nodes.map((n) => n.id));
  }

  duplicate(): void {
    this.copy();
    this.paste(24);
  }

  selectAll(): void {
    this.store.select(
      this.store.doc.nodes.map((n) => n.id),
      this.store.doc.edges.map((e) => e.id),
    );
  }

  updateSelectedNodes(mutate: (node: DiagramNode) => void, label = 'style'): void {
    const ids = new Set(this.store.selection.nodes);
    if (!ids.size) return;
    this.store.patch(
      (doc) => {
        for (const n of doc.nodes) if (ids.has(n.id)) mutate(n);
        adjustRoutes(doc, ids);
      },
      { label },
    );
  }

  updateSelectedEdges(mutate: (edge: DiagramEdge) => void, label = 'style'): void {
    const ids = new Set(this.store.selection.edges);
    if (!ids.size) return;
    this.store.patch(
      (doc) => {
        for (const e of doc.edges) if (ids.has(e.id)) mutate(e);
      },
      { label },
    );
  }

  setShape(shape: NodeShape): void {
    this.updateSelectedNodes((n) => {
      n.shape = shape;
      if (shape === 'class') {
        n.attributes ??= [];
        n.methods ??= [];
      }
      const fit = fitNodeSize(n);
      n.w = Math.max(n.w, fit.w);
      n.h = Math.max(n.h, fit.h);
    }, 'shape');
    if (shape === 'class') this.store.patch((doc) => void (doc.kind = 'class'), { label: 'kind' });
  }

  fitSelectedSize(): void {
    this.updateSelectedNodes((n) => {
      const fit = fitNodeSize(n);
      n.w = fit.w;
      n.h = fit.h;
    }, 'fit size');
  }

  align(mode: 'left' | 'right' | 'top' | 'bottom' | 'hcenter' | 'vcenter' | 'hspace' | 'vspace'): void {
    const nodes = this.store.selectedNodes();
    if (nodes.length < 2) return;
    const left = Math.min(...nodes.map((n) => n.x));
    const right = Math.max(...nodes.map((n) => n.x + n.w));
    const top = Math.min(...nodes.map((n) => n.y));
    const bottom = Math.max(...nodes.map((n) => n.y + n.h));
    const ids = new Set(nodes.map((n) => n.id));
    this.store.patch(
      (doc) => {
        const list = doc.nodes.filter((n) => ids.has(n.id));
        switch (mode) {
          case 'left':
            list.forEach((n) => (n.x = left));
            break;
          case 'right':
            list.forEach((n) => (n.x = right - n.w));
            break;
          case 'top':
            list.forEach((n) => (n.y = top));
            break;
          case 'bottom':
            list.forEach((n) => (n.y = bottom - n.h));
            break;
          case 'hcenter': {
            const cx = (left + right) / 2;
            list.forEach((n) => (n.x = Math.round(cx - n.w / 2)));
            break;
          }
          case 'vcenter': {
            const cy = (top + bottom) / 2;
            list.forEach((n) => (n.y = Math.round(cy - n.h / 2)));
            break;
          }
          case 'hspace': {
            const sorted = [...list].sort((a, b) => a.x - b.x);
            const totalW = sorted.reduce((s, n) => s + n.w, 0);
            const gap = (right - left - totalW) / (sorted.length - 1);
            let x = left;
            sorted.forEach((n) => {
              n.x = Math.round(x);
              x += n.w + gap;
            });
            break;
          }
          case 'vspace': {
            const sorted = [...list].sort((a, b) => a.y - b.y);
            const totalH = sorted.reduce((s, n) => s + n.h, 0);
            const gap = (bottom - top - totalH) / (sorted.length - 1);
            let y = top;
            sorted.forEach((n) => {
              n.y = Math.round(y);
              y += n.h + gap;
            });
            break;
          }
        }
        adjustRoutes(doc, ids);
      },
      { label: `align ${mode}` },
    );
  }

  autoLayout(direction?: Direction): void {
    this.store.patch(
      (doc) => {
        layoutDiagram(doc, { direction: direction ?? doc.direction });
        resolveOverlaps(doc);
      },
      { label: 'auto layout' },
    );
    this.fit();
  }

  setDirection(direction: Direction): void {
    this.store.patch((doc) => void (doc.direction = direction), { label: 'direction' });
  }

  zoomBy(factor: number): void {
    const r = this.scene.svg.getBoundingClientRect();
    this.scene.zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
    this.persistView();
    this.scheduleRender();
  }

  fit(): void {
    this.scene.fit(this.store.doc);
    this.persistView();
    this.scheduleRender();
  }

  /** Replace the document contents, keeping positions of nodes that still exist. */
  applyDiagram(next: Diagram, opts: { preservePositions?: boolean; relayout?: boolean; label?: string } = {}): void {
    const current = this.store.doc;
    let fresh = opts.preservePositions === false;
    if (opts.preservePositions !== false) {
      const byId = new Map(current.nodes.map((n) => [n.id, n]));
      const byLabel = new Map(current.nodes.map((n) => [`${n.shape}|${n.label}`, n]));
      let matched = 0;
      for (const n of next.nodes) {
        const prev = byId.get(n.id) ?? byLabel.get(`${n.shape}|${n.label}`);
        if (prev) {
          n.x = prev.x;
          n.y = prev.y;
          n.w = Math.max(n.w, prev.w);
          n.h = Math.max(n.h, prev.h);
          matched++;
        }
      }
      if (matched < next.nodes.length) {
        const unplaced = next.nodes.filter((n) => n.x === 0 && n.y === 0);
        if (unplaced.length === next.nodes.length) {
          layoutDiagram(next);
          // Nothing carried over, so the old viewport means nothing either.
          fresh = true;
        } else if (unplaced.length) {
          // Place newcomers below existing content, then relax overlaps.
          const maxY = Math.max(0, ...next.nodes.filter((n) => !unplaced.includes(n)).map((n) => n.y + n.h));
          unplaced.forEach((n, i) => {
            n.x = 80 + (i % 4) * (n.w + 40);
            n.y = maxY + 80 + Math.floor(i / 4) * (n.h + 50);
          });
          resolveOverlaps(next);
        }
      }
    }
    if (opts.relayout) {
      layoutDiagram(next);
      resolveOverlaps(next);
    }
    next.id = current.id;
    next.name = next.name || current.name;
    next.view = this.scene.view;
    this.store.replaceDoc(next, opts.label ?? 'apply');
    if (fresh || opts.relayout) this.fit();
    this.scheduleRender();
  }

  /** Merge generated content into the current diagram, placed clear of it. */
  mergeDiagram(incoming: Diagram, label = 'generate'): void {
    const current = this.store.doc;
    const offsetY = current.nodes.length
      ? Math.max(...current.nodes.map((n) => n.y + n.h)) + 100
      : 0;
    const idMap = new Map<string, string>();
    const nodes = incoming.nodes.map((n) => {
      const id = current.nodes.some((x) => x.id === n.id) ? uid() : n.id;
      idMap.set(n.id, id);
      return { ...n, id, y: n.y + offsetY };
    });
    const edges = incoming.edges.map((e) => ({
      ...e,
      id: uid('e'),
      from: idMap.get(e.from)!,
      to: idMap.get(e.to)!,
      waypoints: e.waypoints?.map((p) => ({ x: p.x, y: p.y + offsetY })),
    }));
    this.store.patch(
      (doc) => {
        doc.nodes.push(...nodes);
        doc.edges.push(...edges);
        if (incoming.kind === 'class') doc.kind = 'class';
      },
      { label },
    );
    this.store.select(nodes.map((n) => n.id));
    this.fit();
  }

  /** Keep lanes attached while a whole sub-graph is dragged; drop the rest. */
  private moveRoutes(doc: Diagram, drag: DragState, dx: number, dy: number): void {
    const ids = new Set(drag.origin!.keys());
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    for (const e of doc.edges) {
      const fromMoved = ids.has(e.from);
      const toMoved = ids.has(e.to);
      if (!fromMoved && !toMoved) continue;
      const base = drag.routeOrigin?.get(e.id);
      if (fromMoved && toMoved && base) {
        e.waypoints = base.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        if (from && to) e.waypointAnchor = anchorFor(from, to);
      } else if (e.waypoints?.length) {
        e.waypoints = undefined;
        e.waypointAnchor = undefined;
      }
    }
  }

  private persistView(): void {
    this.store.doc.view = { ...this.scene.view };
  }

  // ----------------------------------------------------------- label editing

  editLabel(nodeId: string): void {
    const node = this.store.doc.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    this.store.select([nodeId]);
    this.openEditor(node.label, { nodeId });
  }

  editEdgeLabel(edgeId: string): void {
    const edge = this.store.doc.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    this.store.select([], [edgeId]);
    this.openEditor(edge.label ?? '', { edgeId });
  }

  private openEditor(value: string, target: { nodeId?: string; edgeId?: string }): void {
    this.commitLabel();
    const el = document.createElement('textarea');
    el.className = 'label-editor';
    el.value = value;
    el.spellcheck = false;
    this.overlay.append(el);
    this.editing = { el, ...target };
    this.positionEditor();
    el.focus();
    el.select();
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.commitLabel();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelLabel();
      }
      e.stopPropagation();
    });
    el.addEventListener('blur', () => this.commitLabel());
    el.addEventListener('input', () => this.positionEditor());
  }

  private positionEditor(): void {
    const editing = this.editing;
    if (!editing) return;
    const zoom = this.scene.view.zoom;
    const hostRect = this.host.getBoundingClientRect();
    if (editing.nodeId) {
      const node = this.store.doc.nodes.find((n) => n.id === editing.nodeId);
      if (!node) return this.cancelLabel();
      const topLeft = this.scene.diagramToScreen({ x: node.x, y: node.y });
      Object.assign(editing.el.style, {
        left: `${topLeft.x - hostRect.left}px`,
        top: `${topLeft.y - hostRect.top}px`,
        width: `${node.w * zoom}px`,
        height: `${node.h * zoom}px`,
        fontSize: `${14 * zoom}px`,
      });
    } else if (editing.edgeId) {
      const route = this.scene.routeOf(editing.edgeId);
      const mid = route ? route[Math.floor(route.length / 2)] : { x: 0, y: 0 };
      const screen = this.scene.diagramToScreen(mid);
      Object.assign(editing.el.style, {
        left: `${screen.x - hostRect.left - 60 * zoom}px`,
        top: `${screen.y - hostRect.top - 14 * zoom}px`,
        width: `${120 * zoom}px`,
        height: `${28 * zoom}px`,
        fontSize: `${12 * zoom}px`,
      });
    }
  }

  commitLabel(): void {
    const editing = this.editing;
    if (!editing) return;
    this.editing = null;
    const value = editing.el.value.trim();
    editing.el.remove();
    if (editing.nodeId) {
      this.store.patch(
        (doc) => {
          const n = doc.nodes.find((x) => x.id === editing.nodeId);
          if (!n) return;
          n.label = value;
          const fit = fitNodeSize(n);
          n.w = Math.max(n.w, fit.w);
          n.h = Math.max(n.h, fit.h);
        },
        { label: 'label' },
      );
    } else if (editing.edgeId) {
      this.store.patch(
        (doc) => {
          const e = doc.edges.find((x) => x.id === editing.edgeId);
          if (e) e.label = value || undefined;
        },
        { label: 'edge label' },
      );
    }
  }

  private cancelLabel(): void {
    if (!this.editing) return;
    this.editing.el.remove();
    this.editing = null;
    this.scheduleRender();
  }

  isEditingLabel(): boolean {
    return !!this.editing;
  }
}

function resizeRect(start: Rect, handle: string, dx: number, dy: number, grid: number): Rect {
  let { x, y, w, h } = start;
  const minW = 60;
  const minH = 40;
  if (handle.includes('w')) {
    const nx = snap(start.x + dx, grid);
    w = Math.max(minW, start.x + start.w - nx);
    x = start.x + start.w - w;
  }
  if (handle.includes('e')) w = Math.max(minW, snap(start.w + dx, grid));
  if (handle.includes('n')) {
    const ny = snap(start.y + dy, grid);
    h = Math.max(minH, start.y + start.h - ny);
    y = start.y + start.h - h;
  }
  if (handle.includes('s')) h = Math.max(minH, snap(start.h + dy, grid));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function closestPort(node: DiagramNode, p: Pt): Pt {
  const ports = portPoints(node);
  let best = ports[0];
  let bestD = Infinity;
  for (const port of ports) {
    const d = (port.x - p.x) ** 2 + (port.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = port;
    }
  }
  return { x: best.x, y: best.y };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export { resizeHandles };
