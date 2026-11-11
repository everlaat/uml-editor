import type { Meta, StoryObj } from '@storybook/html-vite';
import { createToolbar } from './toolbar';
import { fixture, note, stack, storyEditor } from '../stories/harness';

/** The top bar: document name, history, zoom, theme and export. */
const meta: Meta = {
  title: 'Chrome/Toolbar',
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj;

const chrome = (el: HTMLElement, width = 'min(1100px, 92vw)') => {
  const frame = document.createElement('div');
  frame.className = 'sb-chrome';
  frame.style.width = width;
  frame.append(el);
  return frame;
};

export const Default: Story = {
  render: () => {
    const { editor } = storyEditor({ doc: fixture('orderFlow') });
    return chrome(createToolbar(editor, () => undefined));
  },
};

export const WithHistory: Story = {
  name: 'Undo available',
  render: () => {
    const { editor } = storyEditor({ doc: fixture('orderFlow') });
    editor.store.patch((doc) => void (doc.nodes[0].label = 'Edited'), { label: 'edit' });
    return stack(note('Undo and redo enable themselves from the history stack.'), chrome(createToolbar(editor, () => undefined)));
  },
};

export const Narrow: Story = {
  name: 'Narrow window',
  render: () => {
    const { editor } = storyEditor({ doc: fixture('tiny') });
    return stack(
      note('Below 880px the toolbar drops its labels and keeps the icons; it scrolls horizontally rather than widening the page.'),
      chrome(createToolbar(editor, () => undefined), '420px'),
    );
  },
};
