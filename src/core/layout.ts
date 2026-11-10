import type { Diagram, DiagramNode, Direction } from './model';

export interface LayoutOptions {
  direction?: Direction;
  /** Gap between layers (along the flow axis). */
  rankGap?: number;
  /** Gap between siblings within a layer. */
  nodeGap?: number;
  originX?: number;
  originY?: number;
}

/**
 * Layered ("Sugiyama-lite") layout: break cycles, rank by longest path,
 * order each layer by barycentre, then place along the chosen direction.
 * Deterministic, dependency-free and fast enough to run on every keystroke.
 */
export function layoutDiagram(doc: Diagram, options: LayoutOptions = {}): void {
  const direction = options.direction ?? doc.direction ?? 'TB';
  const rankGap = options.rankGap ?? 70;
  const nodeGap = options.nodeGap ?? 40;
  const nodes = doc.nodes;
  if (!nodes.length) return;

  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const out = new Map<string, string[]>();
  const inc = new Map<string, string[]>();
  for (const n of nodes) {
    out.set(n.id, []);
    inc.set(n.id, []);
  }
  const edges = doc.edges.filter((e) => index.has(e.from) && index.has(e.to) && e.from !== e.to);
  const acyclic = removeCycles(nodes, edges);
  for (const e of acyclic) {
    out.get(e.from)!.push(e.to);
    inc.get(e.to)!.push(e.from);
  }

  // Ranks: longest path from any source.
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

  // Group into layers, keeping disconnected nodes in their own trailing lane.
  const layers: DiagramNode[][] = [];
  for (const n of nodes) {
    const r = rank.get(n.id) ?? 0;
    (layers[r] ??= []).push(n);
  }
  for (let i = 0; i < layers.length; i++) layers[i] ??= [];

  // Barycentre ordering, a few sweeps down and up.
  const order = new Map<string, number>();
  layers.forEach((layer) => layer.forEach((n, i) => order.set(n.id, i)));
  for (let sweep = 0; sweep < 4; sweep++) {
    const down = sweep % 2 === 0;
    const range = down ? [...layers.keys()] : [...layers.keys()].reverse();
    for (const li of range) {
      const layer = layers[li];
      const neighbours = (id: string) => (down ? inc.get(id) ?? [] : out.get(id) ?? []);
      const score = new Map<string, number>();
      layer.forEach((n, i) => {
        const ns = neighbours(n.id).map((m) => order.get(m) ?? 0);
        score.set(n.id, ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : i);
      });
      layer.sort((a, b) => (score.get(a.id)! - score.get(b.id)!) || a.label.localeCompare(b.label));
      layer.forEach((n, i) => order.set(n.id, i));
    }
  }

  const vertical = direction === 'TB' || direction === 'BT';
  const originX = options.originX ?? 80;
  const originY = options.originY ?? 80;

  // Cross-axis extent of each layer, so layers can be centred against each other.
  const layerCross = layers.map((layer) =>
    layer.reduce((sum, n, i) => sum + (vertical ? n.w : n.h) + (i ? nodeGap : 0), 0),
  );
  const maxCross = Math.max(...layerCross, 0);

  let along = vertical ? originY : originX;
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const depth = Math.max(0, ...layer.map((n) => (vertical ? n.h : n.w)));
    let cross = (vertical ? originX : originY) + (maxCross - layerCross[li]) / 2;
    for (const n of layer) {
      if (vertical) {
        n.x = Math.round(cross);
        n.y = Math.round(along + (depth - n.h) / 2);
        cross += n.w + nodeGap;
      } else {
        n.x = Math.round(along + (depth - n.w) / 2);
        n.y = Math.round(cross);
        cross += n.h + nodeGap;
      }
    }
    along += depth + rankGap;
  }

  // Flip for reversed directions.
  if (direction === 'BT' || direction === 'RL') {
    const total = along - rankGap;
    for (const n of nodes) {
      if (direction === 'BT') n.y = Math.round(total + originY - (n.y + n.h));
      else n.x = Math.round(total + originX - (n.x + n.w));
    }
  }
  doc.direction = direction;
}

/** Returns an edge list with back-edges dropped (DFS classification). */
function removeCycles(nodes: DiagramNode[], edges: { from: string; to: string }[]) {
  const adj = new Map<string, { from: string; to: string }[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.from)?.push(e);
  const state = new Map<string, 0 | 1 | 2>();
  const kept: { from: string; to: string }[] = [];
  const walk = (id: string) => {
    state.set(id, 1);
    for (const e of adj.get(id) ?? []) {
      const s = state.get(e.to) ?? 0;
      if (s === 1) continue; // back edge -> drop
      kept.push(e);
      if (s === 0) walk(e.to);
    }
    state.set(id, 2);
  };
  // Prefer true sources as roots so ranks look natural.
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const roots = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of [...roots, ...nodes.map((n) => n.id)]) if ((state.get(id) ?? 0) === 0) walk(id);
  return kept;
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
}
