import { f } from '../core/geometry';
import type { DiagramNode, NodeShape } from '../core/model';
import { measureLabel } from './text';

export interface ShapeGeometry {
  /** Main outline path (in absolute diagram coordinates). */
  path: string;
  /** Extra strokes drawn on top of the outline (class compartments etc.). */
  decorations?: string[];
  /** Area available for the label. */
  textBox: { x: number; y: number; w: number; h: number };
}

const R = 10;

export function shapeGeometry(n: DiagramNode): ShapeGeometry {
  const { x, y, w, h } = n;
  const inset = Math.min(18, w * 0.16);
  switch (n.shape) {
    case 'round':
      return { path: roundedRect(x, y, w, h, R), textBox: pad(n, 10) };
    case 'stadium':
      return { path: roundedRect(x, y, w, h, h / 2), textBox: pad(n, h / 4) };
    case 'subroutine':
      return {
        path: rect(x, y, w, h),
        decorations: [line(x + 10, y, x + 10, y + h), line(x + w - 10, y, x + w - 10, y + h)],
        textBox: { x: x + 14, y: y + 8, w: w - 28, h: h - 16 },
      };
    case 'cylinder': {
      const ry = Math.min(14, h / 5);
      return {
        path:
          `M ${f(x)} ${f(y + ry)} A ${f(w / 2)} ${f(ry)} 0 0 1 ${f(x + w)} ${f(y + ry)}` +
          ` L ${f(x + w)} ${f(y + h - ry)} A ${f(w / 2)} ${f(ry)} 0 0 1 ${f(x)} ${f(y + h - ry)} Z`,
        decorations: [`M ${f(x)} ${f(y + ry)} A ${f(w / 2)} ${f(ry)} 0 0 0 ${f(x + w)} ${f(y + ry)}`],
        textBox: { x: x + 8, y: y + ry + 6, w: w - 16, h: h - ry * 2 - 12 },
      };
    }
    case 'circle':
      return {
        path: `M ${f(x + w / 2)} ${f(y)} A ${f(w / 2)} ${f(h / 2)} 0 1 1 ${f(x + w / 2 - 0.01)} ${f(y)} Z`,
        textBox: { x: x + w * 0.14, y: y + h * 0.18, w: w * 0.72, h: h * 0.64 },
      };
    case 'diamond':
      return {
        path:
          `M ${f(x + w / 2)} ${f(y)} L ${f(x + w)} ${f(y + h / 2)}` +
          ` L ${f(x + w / 2)} ${f(y + h)} L ${f(x)} ${f(y + h / 2)} Z`,
        textBox: { x: x + w * 0.2, y: y + h * 0.22, w: w * 0.6, h: h * 0.56 },
      };
    case 'hexagon':
      return {
        path:
          `M ${f(x + inset)} ${f(y)} L ${f(x + w - inset)} ${f(y)} L ${f(x + w)} ${f(y + h / 2)}` +
          ` L ${f(x + w - inset)} ${f(y + h)} L ${f(x + inset)} ${f(y + h)} L ${f(x)} ${f(y + h / 2)} Z`,
        textBox: { x: x + inset + 4, y: y + 8, w: w - (inset + 4) * 2, h: h - 16 },
      };
    case 'parallelogram':
      return {
        path: `M ${f(x + inset)} ${f(y)} L ${f(x + w)} ${f(y)} L ${f(x + w - inset)} ${f(y + h)} L ${f(x)} ${f(y + h)} Z`,
        textBox: { x: x + inset + 2, y: y + 8, w: w - inset * 2 - 4, h: h - 16 },
      };
    case 'parallelogram-alt':
      return {
        path: `M ${f(x)} ${f(y)} L ${f(x + w - inset)} ${f(y)} L ${f(x + w)} ${f(y + h)} L ${f(x + inset)} ${f(y + h)} Z`,
        textBox: { x: x + inset + 2, y: y + 8, w: w - inset * 2 - 4, h: h - 16 },
      };
    case 'trapezoid':
      return {
        path: `M ${f(x + inset)} ${f(y)} L ${f(x + w - inset)} ${f(y)} L ${f(x + w)} ${f(y + h)} L ${f(x)} ${f(y + h)} Z`,
        textBox: { x: x + inset + 2, y: y + 8, w: w - inset * 2 - 4, h: h - 16 },
      };
    case 'trapezoid-alt':
      return {
        path: `M ${f(x)} ${f(y)} L ${f(x + w)} ${f(y)} L ${f(x + w - inset)} ${f(y + h)} L ${f(x + inset)} ${f(y + h)} Z`,
        textBox: { x: x + inset + 2, y: y + 8, w: w - inset * 2 - 4, h: h - 16 },
      };
    case 'note': {
      const fold = 16;
      return {
        path:
          `M ${f(x)} ${f(y)} L ${f(x + w - fold)} ${f(y)} L ${f(x + w)} ${f(y + fold)}` +
          ` L ${f(x + w)} ${f(y + h)} L ${f(x)} ${f(y + h)} Z`,
        decorations: [`M ${f(x + w - fold)} ${f(y)} L ${f(x + w - fold)} ${f(y + fold)} L ${f(x + w)} ${f(y + fold)}`],
        textBox: { x: x + 10, y: y + 10, w: w - 20 - fold / 2, h: h - 20 },
      };
    }
    case 'actor': {
      const headR = Math.min(14, w / 3);
      const cx = x + w / 2;
      const headY = y + headR + 2;
      const bodyTop = headY + headR;
      const bodyBottom = y + h * 0.62;
      return {
        path:
          `M ${f(cx)} ${f(headY - headR)} A ${f(headR)} ${f(headR)} 0 1 1 ${f(cx - 0.01)} ${f(headY - headR)} Z`,
        decorations: [
          line(cx, bodyTop, cx, bodyBottom),
          line(cx - w * 0.32, bodyTop + 10, cx + w * 0.32, bodyTop + 10),
          line(cx, bodyBottom, cx - w * 0.3, y + h * 0.88),
          line(cx, bodyBottom, cx + w * 0.3, y + h * 0.88),
        ],
        textBox: { x: x - 20, y: y + h * 0.9, w: w + 40, h: 20 },
      };
    }
    case 'class': {
      const header = classHeaderHeight(n);
      const attrH = compartmentHeight(n.attributes);
      const decorations: string[] = [line(x, y + header, x + w, y + header)];
      if (n.attributes?.length || n.methods?.length) {
        decorations.push(line(x, y + header + attrH, x + w, y + header + attrH));
      }
      return {
        path: roundedRect(x, y, w, h, 4),
        decorations,
        textBox: { x: x + 10, y: y + 6, w: w - 20, h: header - 12 },
      };
    }
    case 'rect':
    default:
      return { path: rect(x, y, w, h), textBox: pad(n, 10) };
  }
}

export function classHeaderHeight(n: DiagramNode): number {
  return n.stereotype ? 46 : 30;
}

export function compartmentHeight(items?: string[]): number {
  if (!items?.length) return 0;
  return items.length * 18 + 10;
}

function pad(n: DiagramNode, p: number) {
  return { x: n.x + p, y: n.y + p, w: n.w - p * 2, h: n.h - p * 2 };
}

const rect = (x: number, y: number, w: number, h: number) =>
  `M ${f(x)} ${f(y)} H ${f(x + w)} V ${f(y + h)} H ${f(x)} Z`;

const line = (x1: number, y1: number, x2: number, y2: number) =>
  `M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}`;

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M ${f(x + rr)} ${f(y)} H ${f(x + w - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x + w)} ${f(y + rr)}` +
    ` V ${f(y + h - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x + w - rr)} ${f(y + h)}` +
    ` H ${f(x + rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x)} ${f(y + h - rr)}` +
    ` V ${f(y + rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x + rr)} ${f(y)} Z`
  );
}

/** Text sizing used both for auto-grow on edit and for first placement. */
export function fitNodeSize(n: DiagramNode): { w: number; h: number } {
  if (n.shape === 'actor') return { w: n.w, h: n.h };
  if (n.shape === 'class') {
    const rows = [n.label, n.stereotype ?? '', ...(n.attributes ?? []), ...(n.methods ?? [])];
    const width = Math.max(150, ...rows.map((r) => (r ? r.length * 7.4 + 28 : 0)));
    const h = classHeaderHeight(n) + compartmentHeight(n.attributes) + compartmentHeight(n.methods) + 8;
    return { w: Math.min(360, Math.round(width)), h: Math.max(60, Math.round(h)) };
  }
  const maxText = 200;
  const m = measureLabel(n.label || ' ', maxText, labelFontSize(n.shape));
  const slanted =
    n.shape === 'parallelogram' ||
    n.shape === 'parallelogram-alt' ||
    n.shape === 'trapezoid' ||
    n.shape === 'trapezoid-alt' ||
    n.shape === 'hexagon';
  const padX = n.shape === 'diamond' ? 56 : n.shape === 'circle' ? 28 : slanted ? 64 : 32;
  const padY =
    n.shape === 'diamond' ? 48 : n.shape === 'circle' ? 28 : n.shape === 'cylinder' ? 52 : 26;
  const base = { w: Math.round(m.width + padX), h: Math.round(m.height + padY) };
  if (n.shape === 'circle') {
    const d = Math.max(72, base.w, base.h);
    return { w: d, h: d };
  }
  return {
    w: Math.max(minWidth(n.shape), base.w),
    h: Math.max(minHeight(n.shape), base.h),
  };
}

export function labelFontSize(shape: NodeShape): number {
  return shape === 'note' ? 13 : 14;
}

function minWidth(shape: NodeShape): number {
  return shape === 'diamond' ? 120 : 100;
}
function minHeight(shape: NodeShape): number {
  return shape === 'diamond' ? 80 : 48;
}
