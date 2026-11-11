import type { Diagram, DiagramEdge, DiagramNode, Direction } from './model';

export interface LayoutOptions {
  direction?: Direction;
  /** Gap between layers (along the flow axis). */
  rankGap?: number;
  /** Gap between siblings within a layer. */
  nodeGap?: number;
  originX?: number;
  originY?: number;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * One position in a layer: either a real node, or a dummy standing in for an
 * edge passing through. Dummies are what reserve a lane for long edges, so
 * they no longer run underneath the shapes between their endpoints.
 */
interface Slot {
  key: string;
  rank: number;
  node?: DiagramNode;
  /** Set on dummy slots: the edge this slot carries. */
  edgeId?: string;
  /** Size across the layer (width for a top-down flow). */
  cross: number;
  /** Size along the flow axis. */
  depth: number;
  /** Filled in during placement: the centre, and for dummies the lane entry/exit. */
  pos: Pt;
  /**
   * Dummy slots emit two points — where the edge enters the lane and where it
   * leaves it — both sitting in the gap between layers. Turning there, rather
   * than level with the shapes, is what keeps the edge off its neighbours.
   */
  lane?: [Pt, Pt];
}

/** Width a dummy slot reserves, i.e. how wide an edge lane is. */
const LANE_WIDTH = 26;
const ORDERING_SWEEPS = 6;

/**
 * Layered ("Sugiyama") layout: break cycles, rank by longest path, insert
 * dummy slots for edges that span more than one rank, order each layer by
 * barycentre, then place everything. Edges routed through dummies come back as
 * waypoints on the edge. Deterministic and dependency-free.
 */
export function layoutDiagram(doc: Diagram, options: LayoutOptions = {}): void {
  const direction = options.direction ?? doc.direction ?? 'TB';
  const rankGap = options.rankGap ?? 70;
  const nodeGap = options.nodeGap ?? 40;
  const nodes = doc.nodes;
  doc.direction = direction;
  for (const e of doc.edges) {
    e.waypoints = undefined;
    e.waypointAnchor = undefined;
  }
  if (!nodes.length) return;

  const known = new Set(nodes.map((n) => n.id));
  const edges = doc.edges.filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to);
  const rank = rankNodes(nodes, edges);

  // ---------------------------------------------------------------- layers
  const vertical = direction === 'TB' || direction === 'BT';
  const maxRank = Math.max(...nodes.map((n) => rank.get(n.id)!));
  const layers: Slot[][] = Array.from({ length: maxRank + 1 }, () => []);
  const slotOf = new Map<string, Slot>();

  for (const n of nodes) {
    const slot: Slot = {
      key: n.id,
      rank: rank.get(n.id)!,
      node: n,
      cross: vertical ? n.w : n.h,
      depth: vertical ? n.h : n.w,
      pos: { x: 0, y: 0 },
    };
    slotOf.set(slot.key, slot);
    layers[slot.rank].push(slot);
  }

  // Chains of dummy slots for edges that skip over one or more layers.
  const succ = new Map<string, string[]>();
  const pred = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (succ.get(a) ?? succ.set(a, []).get(a)!).push(b);
    (pred.get(b) ?? pred.set(b, []).get(b)!).push(a);
  };
  /** Dummy chains in layer order (low rank -> high rank) per edge. */
  const chains = new Map<string, Slot[]>();

  for (const edge of edges) {
    const rFrom = rank.get(edge.from)!;
    const rTo = rank.get(edge.to)!;
    const lo = Math.min(rFrom, rTo);
    const hi = Math.max(rFrom, rTo);
    if (hi - lo <= 1) {
      if (hi !== lo) link(edge.from, edge.to);
      continue;
    }
    const chain: Slot[] = [];
    let previous = rFrom < rTo ? edge.from : edge.to; // walk from the low rank up
    for (let r = lo + 1; r < hi; r++) {
      const slot: Slot = {
        key: `${edge.id}@${r}`,
        rank: r,
        edgeId: edge.id,
        cross: LANE_WIDTH,
        depth: 0,
        pos: { x: 0, y: 0 },
      };
      slotOf.set(slot.key, slot);
      layers[r].push(slot);
      chain.push(slot);
      link(previous, slot.key);
      previous = slot.key;
    }
    link(previous, rFrom < rTo ? edge.to : edge.from);
    chains.set(edge.id, chain);
  }

  orderLayers(layers, succ, pred);

  // ----------------------------------------------------------- coordinates
  const originX = options.originX ?? 80;
  const originY = options.originY ?? 80;
  const layerCross = layers.map((layer) =>
    layer.reduce((sum, s, i) => sum + s.cross + (i ? nodeGap : 0), 0),
  );
  const widest = Math.max(...layerCross, 0);

  // Start packed and centred, then straighten.
  const crossPos = new Map<string, number>();
  layers.forEach((layer, li) => {
    let cross = (vertical ? originX : originY) + (widest - layerCross[li]) / 2;
    for (const slot of layer) {
      crossPos.set(slot.key, cross + slot.cross / 2);
      cross += slot.cross + nodeGap;
    }
  });
  straightenLayers(layers, succ, pred, crossPos, nodeGap);
  alignChains(chains, crossPos, layers, nodeGap);

  let along = vertical ? originY : originX;
  for (const layer of layers) {
    const depth = Math.max(0, ...layer.map((s) => s.depth));
    for (const slot of layer) {
      const c = crossPos.get(slot.key)!;
      if (slot.node) {
        if (vertical) {
          slot.node.x = Math.round(c - slot.node.w / 2);
          slot.node.y = Math.round(along + (depth - slot.node.h) / 2);
        } else {
          slot.node.x = Math.round(along + (depth - slot.node.w) / 2);
          slot.node.y = Math.round(c - slot.node.h / 2);
        }
        slot.pos = { x: slot.node.x + slot.node.w / 2, y: slot.node.y + slot.node.h / 2 };
      } else {
        // The dummy owns a lane across this layer. Its entry and exit sit half
        // a rank gap outside the layer, so the sideways turns happen in the
        // empty band between layers.
        const laneCentre = Math.round(c);
        const enter = Math.round(along - rankGap / 2);
        const leave = Math.round(along + depth + rankGap / 2);
        slot.lane = vertical
          ? [
              { x: laneCentre, y: enter },
              { x: laneCentre, y: leave },
            ]
          : [
              { x: enter, y: laneCentre },
              { x: leave, y: laneCentre },
            ];
        slot.pos = vertical
          ? { x: laneCentre, y: Math.round(along + depth / 2) }
          : { x: Math.round(along + depth / 2), y: laneCentre };
      }
    }
    along += depth + rankGap;
  }

  // Reversed directions are a mirror of the same placement.
  if (direction === 'BT' || direction === 'RL') {
    const total = along - rankGap;
    const flip = (p: Pt) => {
      if (direction === 'BT') p.y = Math.round(total + originY - p.y);
      else p.x = Math.round(total + originX - p.x);
    };
    for (const n of nodes) {
      if (direction === 'BT') n.y = Math.round(total + originY - (n.y + n.h));
      else n.x = Math.round(total + originX - (n.x + n.w));
    }
    for (const chain of chains.values()) {
      for (const slot of chain) {
        flip(slot.pos);
        slot.lane?.forEach(flip);
        if (slot.lane) slot.lane.reverse();
      }
    }
  }

  // ------------------------------------------------------------- waypoints
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const chain = chains.get(edge.id);
    if (!chain?.length) continue;
    const forwards = rank.get(edge.from)! < rank.get(edge.to)!;
    const ordered = forwards ? chain : [...chain].reverse();
    edge.waypoints = ordered.flatMap((s) => {
      const lane = s.lane ?? [s.pos, s.pos];
      const pair = forwards ? lane : [lane[1], lane[0]];
      return pair.map((p) => ({ ...p }));
    });
    edge.waypointAnchor = anchorFor(byId.get(edge.from)!, byId.get(edge.to)!);
  }
}

/** Longest-path ranking over the graph with back-edges removed. */
function rankNodes(nodes: DiagramNode[], edges: { from: string; to: string }[]): Map<string, number> {
  const inc = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of removeCycles(nodes, edges)) inc.get(e.to)!.push(e.from);

  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (id: string): number => {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = inc.get(id) ?? [];
    const r = parents.length ? Math.max(...parents.map((p) => rankOf(p) + 1)) : 0;
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };
  for (const n of nodes) rankOf(n.id);
  return rank;
}

/** Barycentre ordering, sweeping down and up a few times. */
function orderLayers(layers: Slot[][], succ: Map<string, string[]>, pred: Map<string, string[]>): void {
  const order = new Map<string, number>();
  layers.forEach((layer) => layer.forEach((s, i) => order.set(s.key, i)));
  for (let sweep = 0; sweep < ORDERING_SWEEPS; sweep++) {
    const down = sweep % 2 === 0;
    const indices = [...layers.keys()];
    for (const li of down ? indices : indices.reverse()) {
      const layer = layers[li];
      const score = new Map<string, number>();
      layer.forEach((slot, i) => {
        const neighbours = (down ? pred.get(slot.key) : succ.get(slot.key)) ?? [];
        const positions = neighbours.map((k) => order.get(k)).filter((v): v is number => v !== undefined);
        score.set(slot.key, positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : i);
      });
      layer.sort((a, b) => (score.get(a.key)! - score.get(b.key)!) || compareSlots(a, b));
      layer.forEach((slot, i) => order.set(slot.key, i));
    }
  }
}

/**
 * Sugiyama's priority method for cross-axis placement. Each slot is pulled
 * toward the median of its neighbours in the previous (or next) layer, and may
 * push slots of lower priority out of the way but never one of equal or higher
 * priority. Dummies outrank real nodes, so an edge lane comes out straight;
 * real nodes then settle under their parents wherever slack remains.
 */
function straightenLayers(
  layers: Slot[][],
  succ: Map<string, string[]>,
  pred: Map<string, string[]>,
  pos: Map<string, number>,
  gap: number,
  sweeps = 6,
): void {
  const priority = (slot: Slot) => (slot.edgeId ? 2 : 1);
  const minSep = (a: Slot, b: Slot) => (a.cross + b.cross) / 2 + gap;

  for (let sweep = 0; sweep < sweeps; sweep++) {
    const down = sweep % 2 === 0;
    const indices = [...layers.keys()];
    for (const li of down ? indices : indices.reverse()) {
      const layer = layers[li];
      const byPriority = layer.map((_, i) => i).sort((a, b) => priority(layer[b]) - priority(layer[a]));
      for (const i of byPriority) {
        const slot = layer[i];
        const neighbours = ((down ? pred.get(slot.key) : succ.get(slot.key)) ?? [])
          .map((key) => pos.get(key))
          .filter((v): v is number => v !== undefined);
        if (!neighbours.length) continue;
        const desired = median(neighbours);
        const delta = desired - pos.get(slot.key)!;
        if (Math.abs(delta) < 0.5) continue;
        const room = freedom(layer, i, Math.sign(delta), priority(slot), pos, minSep);
        const move = Math.sign(delta) * Math.min(Math.abs(delta), room);
        if (Math.abs(move) < 0.5) continue;
        shift(layer, i, Math.sign(delta), move, priority(slot), pos);
      }
    }
  }
}

/**
 * Pull every slot of one edge's dummy chain onto a common column, so a lane
 * reads as a single straight line rather than a staircase of small jogs.
 */
function alignChains(
  chains: Map<string, Slot[]>,
  pos: Map<string, number>,
  layers: Slot[][],
  gap: number,
): void {
  const minSep = (a: Slot, b: Slot) => (a.cross + b.cross) / 2 + gap;
  const indexIn = new Map<string, { layer: Slot[]; i: number }>();
  for (const layer of layers) layer.forEach((slot, i) => indexIn.set(slot.key, { layer, i }));

  for (const chain of chains.values()) {
    if (chain.length < 2) continue;
    const target = median(chain.map((s) => pos.get(s.key)!));
    for (const slot of chain) {
      const at = indexIn.get(slot.key);
      if (!at) continue;
      const delta = target - pos.get(slot.key)!;
      if (Math.abs(delta) < 0.5) continue;
      const dir = Math.sign(delta);
      const room = freedom(at.layer, at.i, dir, 2, pos, minSep);
      const move = dir * Math.min(Math.abs(delta), room);
      if (Math.abs(move) >= 0.5) shift(at.layer, at.i, dir, move, 2, pos);
    }
  }
}

/** How far slot `i` can travel before meeting something it may not push. */
function freedom(
  layer: Slot[],
  i: number,
  dir: number,
  prio: number,
  pos: Map<string, number>,
  minSep: (a: Slot, b: Slot) => number,
): number {
  let j = i + dir;
  let last = i;
  while (j >= 0 && j < layer.length) {
    if ((layer[j].edgeId ? 2 : 1) >= prio) {
      const slack = Math.abs(pos.get(layer[j].key)! - pos.get(layer[last].key)!) - minSep(layer[last], layer[j]);
      return Math.max(0, slack);
    }
    last = j;
    j += dir;
  }
  return Infinity;
}

/** Move slot `i` and every lower-priority slot it leans on. */
function shift(layer: Slot[], i: number, dir: number, amount: number, prio: number, pos: Map<string, number>): void {
  pos.set(layer[i].key, pos.get(layer[i].key)! + amount);
  let j = i + dir;
  while (j >= 0 && j < layer.length && (layer[j].edgeId ? 2 : 1) < prio) {
    pos.set(layer[j].key, pos.get(layer[j].key)! + amount);
    j += dir;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Stable tie-break so the same document always lays out the same way. */
function compareSlots(a: Slot, b: Slot): number {
  const la = a.node?.label ?? a.key;
  const lb = b.node?.label ?? b.key;
  return la.localeCompare(lb) || a.key.localeCompare(b.key);
}

/** Returns the edge list with back-edges dropped (DFS classification). */
function removeCycles(nodes: DiagramNode[], edges: { from: string; to: string }[]) {
  const adj = new Map<string, { from: string; to: string }[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) adj.get(e.from)?.push(e);
  const state = new Map<string, 0 | 1 | 2>();
  const kept: { from: string; to: string }[] = [];
  const walk = (start: string) => {
    // Iterative DFS: deep chains must not blow the call stack.
    const stack: { id: string; i: number }[] = [{ id: start, i: 0 }];
    state.set(start, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const out = adj.get(frame.id) ?? [];
      if (frame.i >= out.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const e = out[frame.i++];
      const s = state.get(e.to) ?? 0;
      if (s === 1) continue; // back edge
      kept.push(e);
      if (s === 0) {
        state.set(e.to, 1);
        stack.push({ id: e.to, i: 0 });
      }
    }
  };
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const roots = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of [...roots, ...nodes.map((n) => n.id)]) if ((state.get(id) ?? 0) === 0) walk(id);
  return kept;
}

export function anchorFor(from: DiagramNode, to: DiagramNode): [number, number, number, number] {
  return [Math.round(from.x), Math.round(from.y), Math.round(to.x), Math.round(to.y)];
}

/** True when an edge's waypoints still describe where its endpoints are. */
export function waypointsValid(edge: DiagramEdge, from: DiagramNode, to: DiagramNode): boolean {
  if (!edge.waypoints?.length || !edge.waypointAnchor) return false;
  const [fx, fy, tx, ty] = edge.waypointAnchor;
  return Math.round(from.x) === fx && Math.round(from.y) === fy && Math.round(to.x) === tx && Math.round(to.y) === ty;
}

/** Re-stamp anchors after small position changes that keep routes usable. */
export function refreshRouteAnchors(doc: Diagram): void {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const e of doc.edges) {
    if (!e.waypoints?.length) continue;
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (from && to) e.waypointAnchor = anchorFor(from, to);
    else {
      e.waypoints = undefined;
      e.waypointAnchor = undefined;
    }
  }
}

/** Drop routes that touch any of these nodes; translate ones fully inside the set. */
export function adjustRoutes(doc: Diagram, movedIds: Set<string>, dx = 0, dy = 0): void {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const e of doc.edges) {
    if (!e.waypoints?.length) continue;
    const fromMoved = movedIds.has(e.from);
    const toMoved = movedIds.has(e.to);
    if (!fromMoved && !toMoved) continue;
    if (fromMoved && toMoved && (dx || dy)) {
      for (const p of e.waypoints) {
        p.x += dx;
        p.y += dy;
      }
      const from = byId.get(e.from);
      const to = byId.get(e.to);
      if (from && to) e.waypointAnchor = anchorFor(from, to);
      continue;
    }
    e.waypoints = undefined;
    e.waypointAnchor = undefined;
  }
}

/** Nudge overlapping nodes apart — used after generating or pasting. */
export function resolveOverlaps(doc: Diagram, gap = 16, iterations = 24): void {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < doc.nodes.length; i++) {
      for (let j = i + 1; j < doc.nodes.length; j++) {
        const a = doc.nodes[i];
        const b = doc.nodes[j];
        const ox = Math.min(a.x + a.w + gap, b.x + b.w + gap) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h + gap, b.y + b.h + gap) - Math.max(a.y, b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const push = ox / 2;
          if (a.x <= b.x) {
            a.x -= push;
            b.x += push;
          } else {
            a.x += push;
            b.x -= push;
          }
        } else {
          const push = oy / 2;
          if (a.y <= b.y) {
            a.y -= push;
            b.y += push;
          } else {
            a.y += push;
            b.y -= push;
          }
        }
      }
    }
    if (!moved) break;
  }
  for (const n of doc.nodes) {
    n.x = Math.round(n.x);
    n.y = Math.round(n.y);
  }
  // Positions shifted slightly; keep the lanes attached to them.
  refreshRouteAnchors(doc);
}
