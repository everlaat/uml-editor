import type { Meta, StoryObj } from '@storybook/html-vite';
import { createInspector } from './inspector';
import { fixture, note, panelFrame, stack, storyEditor } from '../stories/harness';

/**
 * The right-hand properties panel. What it shows depends entirely on the
 * selection, so there is one story per selection state.
 */
const meta: Meta = {
  title: 'Panels/Inspector',
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj;

function inspectorWith(select: (editor: ReturnType<typeof storyEditor>['editor']) => void, kind: 'orderFlow' | 'classModel' = 'orderFlow') {
  const { editor } = storyEditor({ doc: fixture(kind) });
  select(editor);
  return panelFrame(createInspector(editor).el);
}

export const NothingSelected: Story = {
  name: 'Nothing selected — diagram settings',
  render: () => inspectorWith(() => undefined),
};

export const OneShape: Story = {
  name: 'One shape',
  render: () =>
    inspectorWith((editor) => {
      const node = editor.store.doc.nodes.find((n) => n.shape === 'rect') ?? editor.store.doc.nodes[0];
      editor.store.select([node.id]);
    }),
};

export const Decision: Story = {
  render: () =>
    inspectorWith((editor) => {
      const node = editor.store.doc.nodes.find((n) => n.shape === 'diamond')!;
      editor.store.select([node.id]);
    }),
};

export const SeveralShapes: Story = {
  name: 'Several shapes — alignment tools',
  render: () =>
    stack(
      note('With more than one shape selected the panel swaps the geometry fields for align and distribute.'),
      inspectorWith((editor) => editor.store.select(editor.store.doc.nodes.slice(0, 3).map((n) => n.id))),
    ),
};

export const Connection: Story = {
  render: () =>
    inspectorWith((editor) => {
      const edge = editor.store.doc.edges.find((e) => e.label) ?? editor.store.doc.edges[0];
      editor.store.select([], [edge.id]);
    }),
};

export const TextElement: Story = {
  name: 'Free text — type settings',
  render: () =>
    stack(
      note('Font, size, weight, slant, case, colour and both alignments apply to any label: a shape\u2019s text, an edge\u2019s text, or free text on the canvas.'),
      inspectorWith((editor) => {
        const node = editor.addNode({ x: 200, y: 120 }, 'text', 'Owned by the data team');
        editor.store.select([node.id]);
      }),
    ),
};

export const UmlClass: Story = {
  name: 'UML class — compartments',
  render: () =>
    inspectorWith((editor) => {
      const node = editor.store.doc.nodes.find((n) => n.label === 'Order')!;
      editor.store.select([node.id]);
    }, 'classModel'),
};
