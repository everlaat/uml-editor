import type { Editor } from '../editor';
import { saveCustomShape } from '../shapes/custom';
import { fitPathToUnitBox, isValidPath } from '../shapes/path';
import { button, h } from './dom';
import { openModal } from './modal';
import { toast } from './toast';

const EXAMPLES: { name: string; path: string }[] = [
  { name: 'Cloud', path: 'M 25 60 A 20 20 0 0 1 30 25 A 25 25 0 0 1 75 20 A 20 20 0 0 1 80 60 Z' },
  { name: 'Shield', path: 'M 50 0 L 95 18 V 55 C 95 80 72 95 50 100 C 28 95 5 80 5 55 V 18 Z' },
  { name: 'Arrow block', path: 'M 0 25 H 60 V 0 L 100 45 L 60 90 V 65 H 0 Z' },
];

/**
 * Add a shape of your own from SVG path data. Only path data is accepted and
 * it is parsed before it is stored, so nothing executable can enter the shape
 * library — which matters because libraries are shared between diagrams.
 */
export function openCustomShapeDialog(editor: Editor): void {
  openModal('Add your own shape', (modal) => {
    const name = h('input', { class: 'input', placeholder: 'Cloud' });
    const path = h('textarea', { class: 'input mono', placeholder: 'M 0 0 H 100 V 60 H 0 Z' });
    path.rows = 5;
    const preview = h('div', { class: 'shape-preview' });
    const problem = h('div', { class: 'problem error' });
    problem.style.display = 'none';

    const refresh = () => {
      const data = path.value.trim();
      problem.style.display = 'none';
      preview.innerHTML = '';
      if (!data) return;
      if (!isValidPath(data)) {
        problem.textContent = 'That is not usable SVG path data. Paste the contents of a “d” attribute.';
        problem.style.display = '';
        return;
      }
      const unit = fitPathToUnitBox(data);
      const scaled = unit.replace(/-?\d*\.?\d+/g, (n) => String(Math.round(Number(n) * 120 * 100) / 100));
      preview.innerHTML = `<svg viewBox="-10 -10 140 140" width="140" height="140" aria-hidden="true">
        <path d="${scaled}" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>`;
    };
    path.addEventListener('input', refresh);

    const examples = h('div', { class: 'chips' });
    for (const example of EXAMPLES) {
      examples.append(
        h('button', {
          class: 'chip',
          type: 'button',
          text: example.name,
          on: {
            click: () => {
              if (!name.value.trim()) name.value = example.name;
              path.value = example.path;
              refresh();
            },
          },
        }),
      );
    }

    const save = () => {
      const result = saveCustomShape(name.value, path.value);
      if (result.error) {
        problem.textContent = result.error;
        problem.style.display = '';
        return;
      }
      toast(`“${result.shape!.name}” added to your shapes`);
      modal.close();
      // Drop one on the canvas so it is obvious where it went.
      const rect = editor.scene.svg.getBoundingClientRect();
      const centre = editor.scene.screenToDiagram(rect.left + rect.width / 2, rect.top + rect.height / 2);
      editor.addNode(centre, `custom:${result.shape!.id}`);
    };

    modal.body.append(
      h('p', {
        class: 'modal-lede',
        text: 'Paste the “d” attribute of an SVG path. It is scaled into a square box, saved in this browser, and appears in the palette for every diagram. Shapes you use are copied into the document, so sharing a diagram still works.',
      }),
      h('div', { class: 'field' }, h('label', { class: 'field-label', text: 'Name' }), h('div', { class: 'field-control' }, name)),
      h('div', { class: 'field' }, h('label', { class: 'field-label', text: 'Path data' }), h('div', { class: 'field-control' }, path)),
      h('div', { class: 'field' }, h('label', { class: 'field-label', text: 'Start from' }), h('div', { class: 'field-control' }, examples)),
      h('div', { class: 'shape-preview-wrap' }, preview),
      problem,
      h('div', { class: 'btn-row' }, button('Add shape', save, { class: 'primary' }), button('Cancel', () => modal.close())),
    );
    name.focus();
  }, 560);
}
