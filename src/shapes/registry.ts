import type { DiagramNode, NodeShape } from '../core/model';
import { BUILTIN_SHAPES } from './builtin';
import { rect } from './draw';
import { scaleUnitPath } from './path';
import type { ShapeCategory, ShapeDefinition, ShapeGeometry, Size } from './types';

export { scaleUnitPath } from './path';

const registry = new Map<string, ShapeDefinition>();
const listeners = new Set<() => void>();

/**
 * Stands in for a shape this browser does not know about — a custom element
 * from someone else's library. The id is kept, so the node draws properly the
 * moment that definition arrives.
 */
function placeholder(id: string): ShapeDefinition {
  return {
    id,
    name: `Unknown (${id})`,
    category: 'custom',
    defaultSize: { w: 150, h: 60 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => ({ path: rect(0, 0, w, h), textBox: { x: 10, y: 10, w: w - 20, h: h - 20 } }),
  };
}

export function registerShape(def: ShapeDefinition): void {
  registry.set(def.id, def);
  notify();
}

export function registerShapes(defs: ShapeDefinition[]): void {
  for (const def of defs) registry.set(def.id, def);
  notify();
}

export function unregisterShape(id: string): void {
  if (registry.delete(id)) notify();
}

/** Subscribe to library changes (the palette and inspector redraw on these). */
export function onShapesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

export function hasShape(id: string): boolean {
  return registry.has(id);
}

/** Always returns something drawable, even for an id we have never seen. */
export function shapeDef(id: NodeShape): ShapeDefinition {
  return registry.get(id) ?? placeholder(id);
}

export function allShapes(): ShapeDefinition[] {
  return [...registry.values()];
}

export function shapesByCategory(category: ShapeCategory): ShapeDefinition[] {
  return allShapes().filter((s) => s.category === category);
}

export const CATEGORY_LABELS: Record<ShapeCategory, string> = {
  flow: 'Flowchart',
  uml: 'UML',
  annotation: 'Text & annotation',
  custom: 'Your shapes',
};

export const CATEGORY_ORDER: ShapeCategory[] = ['flow', 'uml', 'annotation', 'custom'];

export function shapeName(id: NodeShape): string {
  return shapeDef(id).name;
}

export function defaultSizeOf(id: NodeShape): Size {
  return { ...shapeDef(id).defaultSize };
}

/**
 * A node's outline, in local coordinates. Custom shapes carry their own path
 * on the node, so a document is readable without the library that made it.
 */
export function geometryOf(node: DiagramNode): ShapeGeometry {
  const def = shapeDef(node.shape);
  if (node.customPath) {
    return {
      path: scaleUnitPath(node.customPath, node.w, node.h),
      textBox: { x: node.w * 0.12, y: node.h * 0.12, w: node.w * 0.76, h: node.h * 0.76 },
    };
  }
  return def.geometry({ w: node.w, h: node.h, node });
}

registerShapes(BUILTIN_SHAPES);
