import type { Meta, StoryObj } from '@storybook/html-vite';
import { button, h } from './dom';
import { openDocsModal } from './docspanel';
import { openHelp } from './help';
import { attachMenu } from './menu';
import { openCustomShapeDialog } from './customshape';
import { openModal } from './modal';
import { toast } from './toast';
import { note, stack, storyEditor } from '../stories/harness';

/**
 * Things that appear over the editor: modals, the export menu and toasts.
 * They attach to `document.body`, so each story offers a button to open one.
 */
const meta: Meta = {
  title: 'Overlays/Modals, menus and toasts',
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj;

export const Help: Story = {
  name: 'Help and shortcuts',
  render: () => {
    const open = button('Open the help modal', () => openHelp(), { class: 'primary' });
    queueMicrotask(() => openHelp());
    return stack(note('Opens automatically; press Escape or click the backdrop to dismiss, then use the button to reopen.'), open);
  },
};

export const Documents: Story = {
  name: 'Saved diagrams',
  render: () => {
    const { editor } = storyEditor();
    return stack(
      note('Lists what is in this browser. In Storybook the list is whatever your own browser happens to hold — stories never write to it.'),
      button('Open the document list', () => openDocsModal(editor), { class: 'primary' }),
    );
  },
};

export const Confirmation: Story = {
  name: 'Generic modal',
  render: () =>
    button(
      'Open a modal',
      () =>
        openModal('A modal', (modal) => {
          modal.body.append(
            h('p', { class: 'modal-lede', text: 'Modals trap Escape, close on a backdrop click, and scroll their body when the content is long.' }),
            h('div', { class: 'btn-row' }, button('Close', () => modal.close(), { class: 'primary' })),
          );
        }),
      { class: 'primary' },
    ),
};

export const Menu: Story = {
  name: 'Popover menu',
  render: () => {
    const trigger = h('button', { class: 'btn', type: 'button', text: 'Export ▾' });
    attachMenu(trigger, () => [
      { label: 'Copy Mermaid', hint: 'clipboard', onSelect: () => toast('Mermaid copied') },
      { label: 'Mermaid file', hint: '.mmd', onSelect: () => undefined },
      { label: 'SVG', hint: 'vector', onSelect: () => undefined },
      { label: 'PNG', hint: '2×', onSelect: () => undefined },
      { label: 'Diagram JSON', hint: 'full fidelity', onSelect: () => undefined },
    ]);
    return stack(note('Anchored under its trigger, closes on outside click, scroll or resize.'), trigger);
  },
};

export const CustomShape: Story = {
  name: 'Add your own shape',
  render: () => {
    const { editor } = storyEditor();
    return stack(
      note('Only SVG path data is accepted, and it is parsed before being stored, so nothing executable can enter a shape library that other documents reach.'),
      button('Add a shape', () => openCustomShapeDialog(editor), { class: 'primary' }),
    );
  },
};

export const Toasts: Story = {
  render: () =>
    stack(
      note('Transient confirmations, bottom centre. They stack and never block the canvas.'),
      h(
        'div',
        { class: 'sb-row' },
        button('Info toast', () => toast('Mermaid copied')),
        button('Error toast', () => toast('That file is not a diagram JSON', 'error')),
        button('A long one', () =>
          toast('The model did not return usable Mermaid (no diagram found). Showing the offline draft instead.', 'error', 5000),
        ),
      ),
    ),
};
