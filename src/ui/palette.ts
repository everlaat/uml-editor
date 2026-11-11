import type { Editor } from '../editor';
import { SHAPE_LABELS, makeNode, type NodeShape } from '../core/model';
import { shapeGeometry } from '../render/shapes';
import { h } from './dom';

const GROUPS: { title: string; shapes: NodeShape[] }[] = [
  {
    title: 'Flowchart',
    shapes: [
      'rect',
      'round',
      'stadium',
      'diamond',
      'parallelogram',
      'parallelogram-alt',
      'hexagon',
      'subroutine',
      'cylinder',
      'circle',
      'trapezoid',
      'trapezoid-alt',
    ],
  },
  { title: 'UML', shapes: ['class', 'actor', 'note'] },
];

export const DRAG_MIME = 'application/x-umlx-shape';

/** Renders a shape thumbnail using the same geometry code as the canvas. */
export function shapePreview(shape: NodeShape, w = 44, hh = 30): string {
  const node = makeNode({ x: 2, y: 2, w: w - 4, h: hh - 4, shape, label: '' });
  const geo = shapeGeometry(node);
  const extra = (geo.decorations ?? [])
    .map((d) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1" opacity="0.65"/>`)
    .join('');
  return `<svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" aria-hidden="true">
    <path d="${geo.path}" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="1.3"/>
    ${extra}
  </svg>`;
}

export function createPalette(editor: Editor): HTMLElement {
  const root = h('div', { class: 'palette' });
  for (const group of GROUPS) {
    root.append(h('div', { class: 'panel-label', text: group.title }));
    const grid = h('div', { class: 'palette-grid' });
    for (const shape of group.shapes) {
      const item = h(
        'button',
        {
          class: 'palette-item',
          title: `${SHAPE_LABELS[shape]} — click to add, or drag onto the canvas`,
          type: 'button',
          attrs: { draggable: 'true', 'data-shape': shape },
          on: {
            click: () => {
              const { w, h: hh } = editor.scene.size();
              const center = editor.scene.screenToDiagram(
                editor.scene.svg.getBoundingClientRect().left + w / 2,
                editor.scene.svg.getBoundingClientRect().top + hh / 2,
              );
              const node = editor.addNode(center, shape);
              editor.editLabel(node.id);
            },
            dragstart: (e) => {
              const ev = e as DragEvent;
              ev.dataTransfer?.setData(DRAG_MIME, shape);
              ev.dataTransfer?.setData('text/plain', SHAPE_LABELS[shape]);
              if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
            },
          },
        },
        h('span', { class: 'palette-glyph', html: shapePreview(shape) }),
        h('span', { class: 'palette-name', text: SHAPE_LABELS[shape] }),
      );
      grid.append(item);
    }
    root.append(grid);
  }
  root.append(
    h('p', {
      class: 'palette-hint',
      text: 'Double-click the canvas to add a box. Drag from a selected box’s dot to connect. Tab adds the next step.',
    }),
  );
  return root;
}

/**
 * Wires drops onto the canvas: a shape from the palette, or an image file to
 * read a diagram out of.
 */
export function enableShapeDrop(editor: Editor, host: HTMLElement, onImage?: (file: File) => void): void {
  host.addEventListener('dragover', (e) => {
    const types = e.dataTransfer?.types ?? [];
    if (!types.includes(DRAG_MIME) && !(onImage && types.includes('Files'))) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  host.addEventListener('drop', (e) => {
    const shape = e.dataTransfer?.getData(DRAG_MIME) as NodeShape | undefined;
    if (shape) {
      e.preventDefault();
      const p = editor.scene.screenToDiagram(e.clientX, e.clientY);
      const node = editor.addNode(p, shape);
      editor.editLabel(node.id);
      return;
    }
    const file = e.dataTransfer?.files?.[0];
    if (onImage && file?.type.startsWith('image/')) {
      e.preventDefault();
      onImage(file);
    }
  });
}
