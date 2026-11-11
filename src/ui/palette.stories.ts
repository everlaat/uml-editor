import type { Meta, StoryObj } from '@storybook/html-vite';
import { allShapes, shapeDef } from '../shapes/registry';
import { createPalette, shapePreview } from './palette';
import { note, panelFrame, stack, storyEditor } from '../stories/harness';

/** The left-hand shape library, and the thumbnails it is built from. */
const meta: Meta = {
  title: 'Panels/Shape palette',
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj;

export const Palette: Story = {
  render: () => panelFrame(createPalette(storyEditor().editor), 'narrow'),
};

export const Thumbnails: Story = {
  name: 'Thumbnails',
  render: () => {
    const grid = document.createElement('div');
    grid.className = 'sb-grid';
    for (const shape of allShapes().map((s) => s.id)) {
      const tile = document.createElement('div');
      tile.className = 'sb-tile';
      const glyph = document.createElement('div');
      glyph.innerHTML = shapePreview(shape, 70, 46);
      const name = document.createElement('span');
      name.textContent = shapeDef(shape).name;
      const id = document.createElement('code');
      id.textContent = shape;
      id.style.color = 'var(--text-faint)';
      id.style.fontSize = '10px';
      tile.append(glyph, name, id);
      grid.append(tile);
    }
    return stack(
      note('Palette thumbnails come from the same geometry the canvas draws with, so a shape can never look different in the two places.'),
      grid,
    );
  },
};
