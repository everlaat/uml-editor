import { f } from '../core/geometry';
import type { DiagramNode } from '../core/model';
import { ellipse, inset, line, polygon, rect, roundedRect, wave } from './draw';
import type { ShapeDefinition } from './types';

const pad = (w: number, h: number, p: number) => ({ x: p, y: p, w: w - p * 2, h: h - p * 2 });

export function classHeaderHeight(n: DiagramNode): number {
  return n.stereotype ? 46 : 30;
}

export function compartmentHeight(items?: string[]): number {
  return items?.length ? items.length * 18 + 10 : 0;
}

/**
 * The built-in element library. Each entry is self-contained: geometry, how it
 * sizes itself to text, and whether Mermaid can express it.
 */
export const BUILTIN_SHAPES: ShapeDefinition[] = [
  // ------------------------------------------------------------ flowchart
  {
    id: 'rect',
    name: 'Process',
    category: 'flow',
    hint: 'A step or action',
    defaultSize: { w: 150, h: 60 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => ({ path: rect(0, 0, w, h), textBox: pad(w, h, 10) }),
  },
  {
    id: 'round',
    name: 'Rounded',
    category: 'flow',
    defaultSize: { w: 150, h: 60 },
    mermaid: { open: '(', close: ')' },
    geometry: ({ w, h }) => ({ path: roundedRect(0, 0, w, h, 10), textBox: pad(w, h, 10) }),
  },
  {
    id: 'stadium',
    name: 'Terminal',
    category: 'flow',
    hint: 'Start or end of a flow',
    defaultSize: { w: 150, h: 56 },
    mermaid: { open: '([', close: '])' },
    geometry: ({ w, h }) => ({ path: roundedRect(0, 0, w, h, h / 2), textBox: pad(w, h, h / 4) }),
  },
  {
    id: 'subroutine',
    name: 'Subroutine',
    category: 'flow',
    hint: 'A predefined process',
    defaultSize: { w: 160, h: 60 },
    mermaid: { open: '[[', close: ']]' },
    geometry: ({ w, h }) => ({
      path: rect(0, 0, w, h),
      decorations: [line(10, 0, 10, h), line(w - 10, 0, w - 10, h)],
      textBox: { x: 14, y: 8, w: w - 28, h: h - 16 },
    }),
  },
  {
    id: 'cylinder',
    name: 'Database',
    category: 'flow',
    defaultSize: { w: 140, h: 80 },
    textPadding: { x: 32, y: 52 },
    mermaid: { open: '[(', close: ')]' },
    geometry: ({ w, h }) => {
      const ry = Math.min(14, h / 5);
      return {
        path:
          `M 0 ${f(ry)} A ${f(w / 2)} ${f(ry)} 0 0 1 ${f(w)} ${f(ry)}` +
          ` L ${f(w)} ${f(h - ry)} A ${f(w / 2)} ${f(ry)} 0 0 1 0 ${f(h - ry)} Z`,
        decorations: [`M 0 ${f(ry)} A ${f(w / 2)} ${f(ry)} 0 0 0 ${f(w)} ${f(ry)}`],
        textBox: { x: 8, y: ry + 6, w: w - 16, h: h - ry * 2 - 12 },
      };
    },
  },
  {
    id: 'circle',
    name: 'Connector',
    category: 'flow',
    square: true,
    defaultSize: { w: 80, h: 80 },
    textPadding: { x: 28, y: 28 },
    mermaid: { open: '((', close: '))' },
    geometry: ({ w, h }) => ({
      path: ellipse(w / 2, h / 2, w / 2, h / 2),
      textBox: { x: w * 0.14, y: h * 0.18, w: w * 0.72, h: h * 0.64 },
    }),
  },
  {
    id: 'diamond',
    name: 'Decision',
    category: 'flow',
    defaultSize: { w: 150, h: 90 },
    minSize: { w: 120, h: 80 },
    textPadding: { x: 56, y: 48 },
    mermaid: { open: '{', close: '}' },
    geometry: ({ w, h }) => ({
      path: polygon([
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ]),
      textBox: { x: w * 0.2, y: h * 0.22, w: w * 0.6, h: h * 0.56 },
    }),
  },
  {
    id: 'hexagon',
    name: 'Preparation',
    category: 'flow',
    defaultSize: { w: 160, h: 70 },
    textPadding: { x: 64, y: 26 },
    mermaid: { open: '{{', close: '}}' },
    geometry: ({ w, h }) => {
      const i = inset(w);
      return {
        path: polygon([
          [i, 0],
          [w - i, 0],
          [w, h / 2],
          [w - i, h],
          [i, h],
          [0, h / 2],
        ]),
        textBox: { x: i + 4, y: 8, w: w - (i + 4) * 2, h: h - 16 },
      };
    },
  },
  {
    id: 'parallelogram',
    name: 'Input',
    category: 'flow',
    defaultSize: { w: 170, h: 60 },
    textPadding: { x: 64, y: 26 },
    mermaid: { open: '[/', close: '/]' },
    geometry: ({ w, h }) => {
      const i = inset(w);
      return {
        path: polygon([
          [i, 0],
          [w, 0],
          [w - i, h],
          [0, h],
        ]),
        textBox: { x: i + 2, y: 8, w: w - i * 2 - 4, h: h - 16 },
      };
    },
  },
  {
    id: 'parallelogram-alt',
    name: 'Output',
    category: 'flow',
    defaultSize: { w: 170, h: 60 },
    textPadding: { x: 64, y: 26 },
    mermaid: { open: '[\\', close: '\\]' },
    geometry: ({ w, h }) => {
      const i = inset(w);
      return {
        path: polygon([
          [0, 0],
          [w - i, 0],
          [w, h],
          [i, h],
        ]),
        textBox: { x: i + 2, y: 8, w: w - i * 2 - 4, h: h - 16 },
      };
    },
  },
  {
    id: 'trapezoid',
    name: 'Manual op',
    category: 'flow',
    defaultSize: { w: 170, h: 60 },
    textPadding: { x: 64, y: 26 },
    mermaid: { open: '[/', close: '\\]' },
    geometry: ({ w, h }) => {
      const i = inset(w);
      return {
        path: polygon([
          [i, 0],
          [w - i, 0],
          [w, h],
          [0, h],
        ]),
        textBox: { x: i + 2, y: 8, w: w - i * 2 - 4, h: h - 16 },
      };
    },
  },
  {
    id: 'trapezoid-alt',
    name: 'Manual input',
    category: 'flow',
    defaultSize: { w: 170, h: 60 },
    textPadding: { x: 64, y: 26 },
    mermaid: { open: '[\\', close: '/]' },
    geometry: ({ w, h }) => {
      const i = inset(w);
      return {
        path: polygon([
          [0, 0],
          [w, 0],
          [w - i, h],
          [i, h],
        ]),
        textBox: { x: i + 2, y: 8, w: w - i * 2 - 4, h: h - 16 },
      };
    },
  },
  {
    id: 'document',
    name: 'Document',
    category: 'flow',
    hint: 'A printed or written document',
    defaultSize: { w: 160, h: 80 },
    textPadding: { x: 32, y: 44 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => ({
      path: `M 0 0 H ${f(w)} V ${f(h - 12)} ${wave(0, h - 12, w, 10)} Z`,
      textBox: { x: 10, y: 8, w: w - 20, h: h - 30 },
    }),
  },
  {
    id: 'documents',
    name: 'Documents',
    category: 'flow',
    hint: 'Several documents',
    defaultSize: { w: 160, h: 86 },
    textPadding: { x: 36, y: 50 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => ({
      path: `M 0 8 H ${f(w - 8)} V ${f(h - 12)} ${wave(0, h - 12, w - 8, 9)} Z`,
      decorations: [`M 5 8 V 3 H ${f(w - 3)} V ${f(h - 20)}`, `M 10 3 V 0 H ${f(w)} V ${f(h - 26)}`],
      textBox: { x: 12, y: 14, w: w - 28, h: h - 36 },
    }),
  },
  {
    id: 'delay',
    name: 'Delay',
    category: 'flow',
    hint: 'A wait or pause',
    defaultSize: { w: 150, h: 64 },
    textPadding: { x: 56, y: 26 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => ({
      path: `M 0 0 H ${f(w - h / 2)} A ${f(h / 2)} ${f(h / 2)} 0 0 1 ${f(w - h / 2)} ${f(h)} H 0 Z`,
      textBox: { x: 10, y: 8, w: w - 34, h: h - 16 },
    }),
  },
  {
    id: 'display',
    name: 'Display',
    category: 'flow',
    hint: 'Shown to a person',
    defaultSize: { w: 170, h: 70 },
    textPadding: { x: 64, y: 26 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => ({
      path:
        `M 0 ${f(h / 2)} L ${f(w * 0.16)} 0 H ${f(w - h * 0.4)}` +
        ` A ${f(h * 0.55)} ${f(h / 2)} 0 0 1 ${f(w - h * 0.4)} ${f(h)} H ${f(w * 0.16)} Z`,
      textBox: { x: w * 0.18, y: 8, w: w * 0.62, h: h - 16 },
    }),
  },
  {
    id: 'stored-data',
    name: 'Stored data',
    category: 'flow',
    defaultSize: { w: 160, h: 70 },
    textPadding: { x: 56, y: 26 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => ({
      path:
        `M ${f(w * 0.14)} 0 H ${f(w)} C ${f(w - w * 0.1)} ${f(h * 0.25)} ${f(w - w * 0.1)} ${f(h * 0.75)} ${f(w)} ${f(h)}` +
        ` H ${f(w * 0.14)} C ${f(w * 0.04)} ${f(h * 0.75)} ${f(w * 0.04)} ${f(h * 0.25)} ${f(w * 0.14)} 0 Z`,
      textBox: { x: w * 0.18, y: 8, w: w * 0.68, h: h - 16 },
    }),
  },
  {
    id: 'internal-storage',
    name: 'Internal storage',
    category: 'flow',
    defaultSize: { w: 160, h: 80 },
    textPadding: { x: 48, y: 44 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => ({
      path: rect(0, 0, w, h),
      decorations: [line(0, 18, w, 18), line(20, 0, 20, h)],
      textBox: { x: 26, y: 24, w: w - 36, h: h - 32 },
    }),
  },
  {
    id: 'off-page',
    name: 'Off-page link',
    category: 'flow',
    defaultSize: { w: 120, h: 70 },
    textPadding: { x: 34, y: 34 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => ({
      path: polygon([
        [0, 0],
        [w, 0],
        [w, h * 0.6],
        [w / 2, h],
        [0, h * 0.6],
      ]),
      textBox: { x: 8, y: 6, w: w - 16, h: h * 0.58 },
    }),
  },
  {
    id: 'manual-loop',
    name: 'Manual loop',
    category: 'flow',
    defaultSize: { w: 170, h: 66 },
    textPadding: { x: 60, y: 26 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => {
      const i = inset(w, 0.12, 22);
      return {
        path: polygon([
          [0, 0],
          [w, 0],
          [w - i, h],
          [i, h],
        ]),
        textBox: { x: i + 4, y: 8, w: w - (i + 4) * 2, h: h - 16 },
      };
    },
  },
  {
    id: 'junction',
    name: 'Junction',
    category: 'flow',
    hint: 'Summing junction or logical or',
    square: true,
    defaultSize: { w: 54, h: 54 },
    minSize: { w: 36, h: 36 },
    mermaid: { open: '((', close: '))' },
    geometry: ({ w, h }) => ({
      path: ellipse(w / 2, h / 2, w / 2, h / 2),
      decorations: [line(w * 0.15, h * 0.15, w * 0.85, h * 0.85), line(w * 0.85, h * 0.15, w * 0.15, h * 0.85)],
      textBox: { x: 0, y: h + 4, w, h: 18 },
    }),
  },

  // ------------------------------------------------------------------ UML
  {
    id: 'class',
    name: 'UML class',
    category: 'uml',
    defaultSize: { w: 190, h: 110 },
    paintsOwnLabel: true,
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h, node }) => {
      const header = classHeaderHeight(node);
      const attrH = compartmentHeight(node.attributes);
      const decorations = [line(0, header, w, header)];
      if (node.attributes?.length || node.methods?.length) {
        decorations.push(line(0, header + attrH, w, header + attrH));
      }
      return { path: roundedRect(0, 0, w, h, 4), decorations, textBox: { x: 10, y: 6, w: w - 20, h: header - 12 } };
    },
  },
  {
    id: 'actor',
    name: 'Actor',
    category: 'uml',
    defaultSize: { w: 70, h: 100 },
    labelOutside: true,
    mermaid: { open: '([', close: '])' },
    geometry: ({ w, h }) => {
      const headR = Math.min(14, w / 3);
      const cx = w / 2;
      const headY = headR + 2;
      const bodyTop = headY + headR;
      const bodyBottom = h * 0.62;
      return {
        path: ellipse(cx, headY, headR, headR),
        noFill: true,
        decorations: [
          line(cx, bodyTop, cx, bodyBottom),
          line(cx - w * 0.32, bodyTop + 10, cx + w * 0.32, bodyTop + 10),
          line(cx, bodyBottom, cx - w * 0.3, h * 0.88),
          line(cx, bodyBottom, cx + w * 0.3, h * 0.88),
        ],
        textBox: { x: -20, y: h * 0.9, w: w + 40, h: 20 },
      };
    },
  },
  {
    id: 'use-case',
    name: 'Use case',
    category: 'uml',
    defaultSize: { w: 170, h: 80 },
    textPadding: { x: 56, y: 36 },
    mermaid: { open: '([', close: '])' },
    geometry: ({ w, h }) => ({
      path: ellipse(w / 2, h / 2, w / 2, h / 2),
      textBox: { x: w * 0.12, y: h * 0.18, w: w * 0.76, h: h * 0.64 },
    }),
  },
  {
    id: 'package',
    name: 'Package',
    category: 'uml',
    hint: 'A namespace or folder',
    defaultSize: { w: 180, h: 110 },
    textPadding: { x: 36, y: 60 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => {
      const tabW = Math.min(70, w * 0.42);
      return {
        path: `M 0 14 H ${f(tabW)} L ${f(tabW + 10)} 0 H ${f(w)} V ${f(h)} H 0 Z`,
        decorations: [line(0, 14, w, 14)],
        textBox: { x: 10, y: 22, w: w - 20, h: h - 32 },
      };
    },
  },
  {
    id: 'component',
    name: 'Component',
    category: 'uml',
    defaultSize: { w: 180, h: 80 },
    textPadding: { x: 56, y: 28 },
    mermaid: { open: '[[', close: ']]' },
    geometry: ({ w, h }) => ({
      path: rect(0, 0, w, h),
      decorations: [
        rect(-8, h * 0.22, 20, 14),
        rect(-8, h * 0.58, 20, 14),
      ],
      textBox: { x: 20, y: 8, w: w - 30, h: h - 16 },
    }),
  },
  {
    id: 'interface',
    name: 'Interface',
    category: 'uml',
    hint: 'Provided interface (lollipop)',
    defaultSize: { w: 120, h: 50 },
    labelOutside: true,
    mermaid: { open: '((', close: '))' },
    geometry: ({ w, h }) => ({
      path: ellipse(14, h / 2, 12, 12),
      decorations: [line(26, h / 2, w, h / 2)],
      textBox: { x: 32, y: h / 2 - 22, w: w - 36, h: 20 },
    }),
  },
  {
    id: 'deployment',
    name: 'Node',
    category: 'uml',
    hint: 'A deployment node (3D box)',
    defaultSize: { w: 170, h: 90 },
    textPadding: { x: 44, y: 44 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => {
      const d = 14;
      return {
        path: rect(0, d, w - d, h - d),
        decorations: [
          `M 0 ${f(d)} L ${f(d)} 0 H ${f(w)} V ${f(h - d)} L ${f(w - d)} ${f(h)}`,
          line(w - d, d, w, 0),
        ],
        textBox: { x: 10, y: d + 8, w: w - d - 20, h: h - d - 16 },
      };
    },
  },
  {
    id: 'state-start',
    name: 'Initial state',
    category: 'uml',
    square: true,
    defaultSize: { w: 28, h: 28 },
    minSize: { w: 16, h: 16 },
    labelOutside: true,
    mermaid: { open: '((', close: '))' },
    geometry: ({ w, h }) => ({
      path: ellipse(w / 2, h / 2, w / 2, h / 2),
      textBox: { x: -40, y: h + 4, w: w + 80, h: 18 },
    }),
  },
  {
    id: 'state-end',
    name: 'Final state',
    category: 'uml',
    square: true,
    defaultSize: { w: 32, h: 32 },
    minSize: { w: 18, h: 18 },
    labelOutside: true,
    mermaid: { open: '((', close: '))' },
    geometry: ({ w, h }) => ({
      path: ellipse(w / 2, h / 2, w / 2, h / 2),
      noFill: true,
      decorations: [ellipse(w / 2, h / 2, w * 0.3, h * 0.3)],
      textBox: { x: -40, y: h + 4, w: w + 80, h: 18 },
    }),
  },
  {
    id: 'fork',
    name: 'Fork / join',
    category: 'uml',
    defaultSize: { w: 150, h: 10 },
    minSize: { w: 40, h: 6 },
    labelOutside: true,
    mermaid: null,
    geometry: ({ w, h }) => ({
      path: rect(0, 0, w, h),
      textBox: { x: 0, y: h + 4, w, h: 18 },
    }),
  },

  // ----------------------------------------------------------- annotation
  {
    id: 'note',
    name: 'Note',
    category: 'annotation',
    defaultSize: { w: 160, h: 70 },
    text: { size: 13, align: 'left' },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => {
      const fold = 16;
      return {
        path: polygon([
          [0, 0],
          [w - fold, 0],
          [w, fold],
          [w, h],
          [0, h],
        ]),
        decorations: [`M ${f(w - fold)} 0 L ${f(w - fold)} ${f(fold)} L ${f(w)} ${f(fold)}`],
        textBox: { x: 10, y: 10, w: w - 20 - fold / 2, h: h - 20 },
      };
    },
  },
  {
    id: 'text',
    name: 'Text',
    category: 'annotation',
    hint: 'Free text anywhere on the canvas',
    defaultSize: { w: 180, h: 44 },
    minSize: { w: 40, h: 24 },
    textPadding: { x: 8, y: 8 },
    text: { size: 15, align: 'left', valign: 'middle' },
    mermaid: null,
    geometry: ({ w, h }) => ({ path: rect(0, 0, w, h), noFill: true, noStroke: true, textBox: pad(w, h, 4) }),
  },
  {
    id: 'heading',
    name: 'Heading',
    category: 'annotation',
    hint: 'A title for part of the canvas',
    defaultSize: { w: 260, h: 46 },
    minSize: { w: 60, h: 28 },
    textPadding: { x: 8, y: 8 },
    text: { size: 22, bold: true, align: 'left', valign: 'middle' },
    mermaid: null,
    geometry: ({ w, h }) => ({ path: rect(0, 0, w, h), noFill: true, noStroke: true, textBox: pad(w, h, 4) }),
  },
  {
    id: 'callout',
    name: 'Callout',
    category: 'annotation',
    defaultSize: { w: 170, h: 80 },
    textPadding: { x: 32, y: 44 },
    text: { size: 13 },
    mermaid: null,
    geometry: ({ w, h }) => {
      const body = h - 16;
      return {
        path:
          `${roundedRect(0, 0, w, body, 10).slice(0, -2)} Z` +
          ` M ${f(w * 0.22)} ${f(body)} L ${f(w * 0.3)} ${f(h)} L ${f(w * 0.42)} ${f(body)} Z`,
        textBox: { x: 10, y: 8, w: w - 20, h: body - 16 },
      };
    },
  },
  {
    id: 'frame',
    name: 'Frame',
    category: 'annotation',
    hint: 'A labelled box to group things visually',
    defaultSize: { w: 280, h: 180 },
    text: { size: 12, align: 'left', valign: 'top' },
    mermaid: null,
    geometry: ({ w, h }) => ({
      path: rect(0, 0, w, h),
      noFill: true,
      decorations: [`M 0 22 H 86 L 98 10 V 0`],
      textBox: { x: 8, y: 2, w: 80, h: 18 },
    }),
  },
];
