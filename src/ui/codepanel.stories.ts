import type { Meta, StoryObj } from '@storybook/html-vite';
import { createCodePanel } from './codepanel';
import { fixture, note, panelFrame, stack, storyEditor } from '../stories/harness';

/**
 * The Mermaid panel is two-way: canvas edits rewrite the code, and typing in
 * the code applies to the canvas after a pause.
 */
const meta: Meta = {
  title: 'Panels/Mermaid',
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj;

const panelFor = (kind: 'orderFlow' | 'classModel' | 'tiny', mutate?: (area: HTMLTextAreaElement) => void) => {
  const { editor } = storyEditor({ doc: fixture(kind) });
  const panel = createCodePanel(editor);
  const area = panel.el.querySelector('textarea') as HTMLTextAreaElement;
  mutate?.(area);
  return panelFrame(panel.el, 'wide');
};

export const Flowchart: Story = {
  render: () => panelFor('orderFlow'),
};

export const ClassDiagram: Story = {
  render: () => panelFor('classModel'),
};

export const SyntaxError: Story = {
  name: 'Reporting a syntax error',
  render: () =>
    stack(
      note('A diagram is never half-applied: unparseable code reports the line and leaves the canvas alone.'),
      panelFor('tiny', (area) => {
        area.value = 'sequenceDiagram\n    alice ->> bob: hello';
        area.dispatchEvent(new Event('input', { bubbles: true }));
      }),
    ),
};

export const Empty: Story = {
  render: () =>
    panelFor('tiny', (area) => {
      area.value = '';
    }),
};
