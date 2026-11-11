import type { Meta, StoryObj } from '@storybook/html-vite';
import { icons, type IconName } from './icons';
import { note, stack } from '../stories/harness';

/** Every icon in the set, drawn at the size the chrome uses. */
const meta: Meta = {
  title: 'Foundations/Icons',
  parameters: { layout: 'centered' },
};
export default meta;

export const All: StoryObj = {
  name: 'Icon set',
  render: () => {
    const grid = document.createElement('div');
    grid.className = 'sb-grid';
    for (const name of Object.keys(icons) as IconName[]) {
      const tile = document.createElement('div');
      tile.className = 'sb-tile';
      const glyph = document.createElement('span');
      glyph.innerHTML = icons[name];
      glyph.style.color = 'var(--text)';
      const text = document.createElement('code');
      text.textContent = name;
      text.style.fontSize = '10.5px';
      text.style.color = 'var(--text-faint)';
      tile.append(glyph, text);
      grid.append(tile);
    }
    return stack(note('Inline SVG, single stroke weight, sized to 16px and coloured by `currentColor`.'), grid);
  },
};
