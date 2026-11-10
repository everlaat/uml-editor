import { h } from './dom';
import { openModal } from './modal';

const SHORTCUTS: [string, string][] = [
  ['Double-click canvas', 'New shape, ready to type'],
  ['Drag a shape’s dot', 'Connect to another shape, or drop on empty space for a new one'],
  ['Tab', 'Add the next step, connected'],
  ['Enter', 'Rename the selected shape or connection'],
  ['⌫ / Delete', 'Delete the selection'],
  ['Shift-click / drag', 'Multi-select'],
  ['Space-drag · middle-drag · ⌥-drag', 'Pan'],
  ['⌘/Ctrl + scroll · pinch', 'Zoom'],
  ['⌘/Ctrl + 1', 'Zoom to fit'],
  ['⌘/Ctrl + 0', 'Reset zoom'],
  ['⌘/Ctrl + Z · ⇧⌘Z', 'Undo · redo'],
  ['⌘/Ctrl + C / V / X / D', 'Copy · paste · cut · duplicate'],
  ['⌘/Ctrl + A', 'Select everything'],
  ['⇧⌘/Ctrl + L', 'Auto-arrange'],
  ['Arrow keys (⇧ for 5×)', 'Nudge'],
  ['G', 'Toggle the grid'],
  ['⌘/Ctrl + ↵ in a text box', 'Apply Mermaid code / generate'],
];

export function openHelp(): void {
  openModal('How it works', (modal) => {
    const table = h('div', { class: 'shortcuts' });
    for (const [keys, what] of SHORTCUTS) {
      table.append(h('div', { class: 'shortcut' }, h('kbd', { text: keys }), h('span', { text: what })));
    }
    modal.body.append(
      h('p', {
        class: 'modal-lede',
        text: 'Everything is local: diagrams live in this browser’s storage, and the optional language model runs in this tab. There is no server and no account.',
      }),
      table,
      h('p', {
        class: 'palette-hint',
        text: 'Mermaid code round-trips through the panel on the right, so you can paste a diagram from a README, edit it visually, and copy it back.',
      }),
    );
  }, 560);
}
