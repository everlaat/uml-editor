import { isExpressibleInMermaid } from '../mermaid/serialize';
import type { Diagram } from './model';

export interface MergeOptions {
  /** Keep the geometry and appearance of elements that already existed. */
  preservePositions?: boolean;
  /**
   * Carry over elements the incoming source has no way to describe. Applying
   * Mermaid must not delete free text, annotations or custom shapes simply
   * because the code could never have mentioned them.
   */
  preserveCanvasOnly?: boolean;
}

export interface MergeReport {
  /** Nodes in `next` that were matched to an existing node. */
  matched: number;
  /** Nodes carried over because the incoming source cannot express them. */
  carried: number;
  /** Nodes with no position yet. */
  unplaced: number;
}

/**
 * Fold an incoming document into the one on screen. Mutates `next`, which is
 * about to replace the current document.
 */
export function mergeIncoming(current: Diagram, next: Diagram, options: MergeOptions = {}): MergeReport {
  let matched = 0;
  let carried = 0;

  if (options.preservePositions) {
    const byId = new Map(current.nodes.map((n) => [n.id, n]));
    const byLabel = new Map(current.nodes.map((n) => [`${n.shape}|${n.label}`, n]));
    for (const node of next.nodes) {
      const prev = byId.get(node.id) ?? byLabel.get(`${node.shape}|${node.label}`);
      if (!prev) continue;
      node.x = prev.x;
      node.y = prev.y;
      node.w = Math.max(node.w, prev.w);
      node.h = Math.max(node.h, prev.h);
      // Appearance is not part of the source being applied, so what is already
      // on the canvas wins.
      node.text = prev.text ? { ...prev.text } : node.text;
      node.color = node.color ?? prev.color;
      node.customPath = node.customPath ?? prev.customPath;
      matched++;
    }
  }

  if (options.preserveCanvasOnly) {
    const orphans = current.nodes.filter((n) => !isExpressibleInMermaid(n));
    const present = new Set(next.nodes.map((n) => n.id));
    for (const node of orphans) {
      if (present.has(node.id)) continue;
      next.nodes.push({ ...node });
      present.add(node.id);
      carried++;
    }
    const orphanIds = new Set(orphans.map((n) => n.id));
    const existing = new Set(next.edges.map((e) => e.id));
    for (const edge of current.edges) {
      if (!orphanIds.has(edge.from) && !orphanIds.has(edge.to)) continue;
      if (existing.has(edge.id)) continue;
      // Only keep a connection if both ends survived the edit.
      if (!present.has(edge.from) || !present.has(edge.to)) continue;
      next.edges.push({ ...edge });
    }
  }

  return {
    matched,
    carried,
    unplaced: next.nodes.filter((n) => n.x === 0 && n.y === 0).length,
  };
}
