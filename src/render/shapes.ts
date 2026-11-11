/**
 * Thin facade over the shape registry, kept so the renderer, palette, parser
 * and exporter all size and draw elements through one path.
 */
import type { DiagramNode, NodeShape } from '../core/model';
import { classHeaderHeight, compartmentHeight } from '../shapes/builtin';
import { geometryOf, shapeDef } from '../shapes/registry';
import type { ShapeGeometry } from '../shapes/types';
import { measureStyled } from './text';
import { resolveText } from './typography';

export type { ShapeGeometry };
export { classHeaderHeight, compartmentHeight };

export function shapeGeometry(n: DiagramNode): ShapeGeometry {
  return geometryOf(n);
}

/** The size a node wants in order to hold its text comfortably. */
export function fitNodeSize(n: DiagramNode): { w: number; h: number } {
  const def = shapeDef(n.shape);
  if (def.labelOutside) return { w: n.w, h: n.h };
  if (def.paintsOwnLabel) {
    const rows = [n.label, n.stereotype ?? '', ...(n.attributes ?? []), ...(n.methods ?? [])];
    const width = Math.max(150, ...rows.map((r) => (r ? r.length * 7.4 + 28 : 0)));
    const h = classHeaderHeight(n) + compartmentHeight(n.attributes) + compartmentHeight(n.methods) + 8;
    return { w: Math.min(360, Math.round(width)), h: Math.max(60, Math.round(h)) };
  }

  const style = resolveText(n.text, def);
  const padding = def.textPadding ?? { x: 32, y: 26 };
  const measured = measureStyled(n.label || ' ', 240, style);
  const base = {
    w: Math.round(measured.width + padding.x),
    h: Math.round(measured.height + padding.y),
  };
  if (def.square) {
    const d = Math.max(def.minSize?.w ?? 40, def.defaultSize.w, base.w, base.h);
    return { w: d, h: d };
  }
  return {
    w: Math.max(def.minSize?.w ?? 100, base.w),
    h: Math.max(def.minSize?.h ?? 40, base.h),
  };
}

/** Default label size for a shape, used where a full style is not to hand. */
export function labelFontSize(shape: NodeShape): number {
  return resolveText(undefined, shapeDef(shape)).size;
}
