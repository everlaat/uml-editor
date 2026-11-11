import type { Meta, StoryObj } from '@storybook/html-vite';
import { CATEGORY_LABELS, CATEGORY_ORDER, shapesByCategory } from './registry';
import { shapePreview } from '../ui/palette';
import { canvasFrame, label, note, shapeShowcase, stack, storyEditor } from '../stories/harness';

/**
 * The element library. Adding an element means adding one `ShapeDefinition`:
 * the palette, inspector, auto-sizing, Mermaid mapping and fidelity report all
 * read from the registry, so nothing else has to be touched.
 */
const meta: Meta = {
  title: 'Foundations/Shape library',
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj;

export const ByCategory: Story = {
  name: 'Everything, by category',
  render: () => {
    const root = stack(
      note(
        'Each tile is drawn by the definition itself, at its own default proportions. Shapes marked “canvas only” have no Mermaid equivalent, so exports leave them out and say so rather than turning them into rectangles.',
      ),
    );
    for (const category of CATEGORY_ORDER) {
      const shapes = shapesByCategory(category);
      if (!shapes.length) continue;
      const grid = document.createElement('div');
      grid.className = 'sb-grid';
      for (const def of shapes) {
        const tile = document.createElement('div');
        tile.className = 'sb-tile';
        const glyph = document.createElement('div');
        glyph.innerHTML = shapePreview(def.id, 76, 50);
        const name = document.createElement('span');
        name.textContent = def.name;
        const meta2 = document.createElement('code');
        meta2.textContent = def.mermaid ? def.id : `${def.id} · canvas only`;
        meta2.style.fontSize = '9.5px';
        meta2.style.color = def.mermaid ? 'var(--text-faint)' : 'var(--warn)';
        tile.append(glyph, name, meta2);
        grid.append(tile);
      }
      root.append(label(CATEGORY_LABELS[category]), grid);
    }
    return root;
  },
};

export const OnTheCanvas: Story = {
  name: 'Drawn at full size',
  render: () => {
    const doc = shapeShowcase(
      [...shapesByCategory('flow'), ...shapesByCategory('uml')].map((s) => s.id),
      6,
    );
    return canvasFrame(storyEditor({ doc }).host);
  },
};
