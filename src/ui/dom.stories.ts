import type { Meta, StoryObj } from '@storybook/html-vite';
import { button, h, iconButton, select } from './dom';
import { icons } from './icons';
import { PALETTE_KEYS, themeFor } from '../render/theme';
import { currentTheme, label, note, row, stack } from '../stories/harness';

/**
 * The primitives every panel is built from. They are plain DOM helpers rather
 * than components, so this page doubles as the house style reference.
 */
const meta: Meta = {
  title: 'Foundations/Controls',
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj;

export const Buttons: Story = {
  render: () =>
    stack(
      note('Buttons come in three weights, plus an icon-only form used throughout the toolbar.'),
      label('Default'),
      row(button('Apply', () => undefined), button('Copy', () => undefined), button('Import file…', () => undefined)),
      label('Primary'),
      row(button('Generate', () => undefined, { class: 'primary' })),
      label('Disabled'),
      row(button('Unavailable', () => undefined, { disabled: true })),
      label('Icon'),
      row(
        iconButton(icons.undo, 'Undo', () => undefined),
        iconButton(icons.redo, 'Redo', () => undefined),
        iconButton(icons.layout, 'Auto-arrange', () => undefined),
        iconButton(icons.trash, 'Delete', () => undefined, 'danger'),
      ),
      label('Grouped (toolbar)'),
      row(
        h(
          'div',
          { class: 'group' },
          iconButton(icons.zoomOut, 'Zoom out', () => undefined),
          h('button', { class: 'btn zoom-label', type: 'button', text: '100%' }),
          iconButton(icons.zoomIn, 'Zoom in', () => undefined),
          iconButton(icons.fit, 'Zoom to fit', () => undefined),
        ),
      ),
      label('Toggle'),
      row(
        h('button', { class: 'btn toggle active', type: 'button', html: `${icons.grid}<span>Grid</span>` }),
        h('button', { class: 'btn toggle', type: 'button', html: `${icons.check}<span>Snap</span>` }),
      ),
    ),
};

export const Inputs: Story = {
  render: () => {
    const field = (name: string, control: HTMLElement) =>
      h('div', { class: 'field' }, h('label', { class: 'field-label', text: name }), h('div', { class: 'field-control' }, control));
    const area = h('textarea', { class: 'input', value: 'Charge the card' });
    area.rows = 2;
    const mono = h('textarea', { class: 'input mono', value: '+id: string\n+total: Money' });
    mono.rows = 3;
    return h(
      'div',
      { class: 'sb-panel' },
      field('Text', h('input', { class: 'input', value: 'Order received' })),
      field('Multi-line', area),
      field('Monospace', mono),
      field(
        'Select',
        select(
          [
            { value: 'tb', label: 'Top to bottom' },
            { value: 'lr', label: 'Left to right' },
          ],
          'tb',
          () => undefined,
        ),
      ),
      field(
        'Number',
        h('div', { class: 'btn-row tight' }, ...['X', 'Y', 'W', 'H'].map((n) =>
          h('div', { class: 'num-field' }, h('span', { class: 'num-label', text: n }), h('input', { class: 'input num', type: 'number', value: '120' })),
        )),
      ),
    );
  },
};

export const Swatches: Story = {
  render: () => {
    const theme = themeFor(currentTheme());
    const swatches = h('div', { class: 'swatches' });
    PALETTE_KEYS.forEach((key, i) => {
      const entry = theme.palette[key];
      swatches.append(
        h('button', {
          class: `swatch ${i === 2 ? 'active' : ''}`,
          type: 'button',
          title: entry.name,
          style: { background: entry.fill, borderColor: entry.stroke },
        }),
      );
    });
    return stack(note('Shape colours are palette tokens, so they re-resolve when the theme changes rather than being baked in.'), swatches);
  },
};

export const SegmentedAndChips: Story = {
  name: 'Segmented control and chips',
  render: () => {
    const seg = h(
      'div',
      { class: 'seg' },
      h('button', { class: 'seg-btn active', type: 'button', text: 'Instant' }),
      h('button', { class: 'seg-btn', type: 'button', text: 'Local model' }),
    );
    const chips = h(
      'div',
      { class: 'chips' },
      h('button', { class: 'chip', type: 'button', text: 'Customer places an order. Check stock…' }),
      h('button', { class: 'chip', type: 'button', text: 'CI pipeline: lint, run unit tests…' }),
    );
    const progress = h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: { width: '62%' } }));
    return h('div', { class: 'sb-panel' }, label('Segmented'), seg, label('Chips'), chips, label('Progress'), progress,
      h('div', { class: 'ai-status ok', text: 'Model loaded and ready.' }),
      h('div', { class: 'ai-status warn', text: 'No usable WebGPU device here.' }),
    );
  },
};

export const Dropzone: Story = {
  render: () => {
    const zone = h(
      'button',
      { class: 'dropzone', type: 'button' },
      h('span', { class: 'dropzone-icon', html: icons.upload }),
      h('span', { text: 'Drop a picture of a diagram, or click to choose' }),
    );
    const over = h(
      'button',
      { class: 'dropzone over', type: 'button' },
      h('span', { class: 'dropzone-icon', html: icons.upload }),
      h('span', { text: 'Release to attach' }),
    );
    return h('div', { class: 'sb-panel' }, label('Idle'), zone, label('Drag over'), over);
  },
};

export const Problems: Story = {
  name: 'Inline problems',
  render: () =>
    h(
      'div',
      { class: 'sb-panel' },
      h('div', { class: 'problems' },
        h('div', { class: 'problem error', text: 'Line 1: Unsupported diagram type "sequenceDiagram".' }),
        h('div', { class: 'problem warn', text: 'Line 7: Ignored line: "click a href".' }),
      ),
    ),
};
