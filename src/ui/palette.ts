import type { Editor } from '../editor';
import { makeNode, type NodeShape } from '../core/model';
import { listCustomShapes, deleteCustomShape } from '../shapes/custom';
import { CATEGORY_LABELS, CATEGORY_ORDER, onShapesChanged, shapeDef, shapesByCategory } from '../shapes/registry';
import { shapeGeometry } from '../render/shapes';
import { clearChildren, h, iconButton } from './dom';
import { icons } from './icons';
import { openCustomShapeDialog } from './customshape';

export const DRAG_MIME = 'application/x-umlx-shape';

/** Renders a shape thumbnail using the same geometry code as the canvas. */
export function shapePreview(shape: NodeShape, w = 44, hh = 30): string {
  const def = shapeDef(shape);
  const aspect = def.defaultSize.w / def.defaultSize.h;
  // Keep the thumbnail in proportion so a bar or a dot still reads correctly.
  let boxW = w - 4;
  let boxH = hh - 4;
  if (aspect > boxW / boxH) boxH = Math.max(4, boxW / aspect);
  else boxW = Math.max(4, boxH * aspect);
  const node = makeNode({ x: (w - boxW) / 2, y: (hh - boxH) / 2, w: boxW, h: boxH, shape, label: '' });
  const geo = shapeGeometry({ ...node, x: 0, y: 0 });
  const extra = (geo.decorations ?? [])
    .map((d) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1" opacity="0.65"/>`)
    .join('');
  const body = geo.noStroke
    ? `<text x="${boxW / 2}" y="${boxH / 2 + 5}" text-anchor="middle" font-size="13" font-family="inherit" fill="currentColor">Aa</text>`
    : `<path d="${geo.path}" fill="currentColor" fill-opacity="${geo.noFill ? 0 : 0.14}" stroke="currentColor" stroke-width="1.3"/>${extra}`;
  return `<svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" aria-hidden="true">
    <g transform="translate(${(w - boxW) / 2} ${(hh - boxH) / 2})">${body}</g>
  </svg>`;
}

export function createPalette(editor: Editor): HTMLElement {
  const root = h('div', { class: 'palette' });

  const render = () => {
    clearChildren(root);
    for (const category of CATEGORY_ORDER) {
      const shapes = shapesByCategory(category);
      const isCustom = category === 'custom';
      if (!shapes.length && !isCustom) continue;

      const header = h(
        'div',
        { class: 'panel-label row-label' },
        h('span', { text: CATEGORY_LABELS[category] }),
        isCustom
          ? iconButton(icons.plus, 'Add a shape of your own', () => openCustomShapeDialog(editor))
          : undefined,
      );
      root.append(header);

      if (isCustom && !shapes.length) {
        root.append(
          h('p', {
            class: 'palette-hint',
            text: 'Paste SVG path data to add a shape you can reuse in any diagram.',
          }),
        );
        continue;
      }

      const grid = h('div', { class: 'palette-grid' });
      for (const def of shapes) {
        const item = h(
          'button',
          {
            class: 'palette-item',
            title: `${def.name}${def.hint ? ` — ${def.hint}` : ''}. Click to add, or drag onto the canvas.`,
            type: 'button',
            attrs: { draggable: 'true', 'data-shape': def.id },
            on: {
              click: () => {
                const rect = editor.scene.svg.getBoundingClientRect();
                const centre = editor.scene.screenToDiagram(rect.left + rect.width / 2, rect.top + rect.height / 2);
                const node = editor.addNode(centre, def.id);
                editor.editLabel(node.id);
              },
              dragstart: (e) => {
                const ev = e as DragEvent;
                ev.dataTransfer?.setData(DRAG_MIME, def.id);
                ev.dataTransfer?.setData('text/plain', def.name);
                if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
              },
            },
          },
          h('span', { class: 'palette-glyph', html: shapePreview(def.id) }),
          h('span', { class: 'palette-name', text: def.name }),
        );
        if (isCustom) {
          const stored = listCustomShapes().find((s) => `custom:${s.id}` === def.id);
          if (stored) {
            item.append(
              h('button', {
                class: 'palette-remove',
                type: 'button',
                title: `Delete “${stored.name}” from your shapes`,
                html: icons.close,
                on: {
                  click: (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete the shape “${stored.name}”? Diagrams already using it keep their copy.`)) {
                      deleteCustomShape(stored.id);
                    }
                  },
                },
              }),
            );
          }
        }
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
  };

  render();
  onShapesChanged(render);
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
