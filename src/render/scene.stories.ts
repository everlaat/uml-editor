import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Direction } from '../core/model';
import { allShapes } from '../shapes/registry';
import { layoutDiagram, resolveOverlaps } from '../core/layout';
import { canvasFrame, diagramFrom, fixture, note, shapeShowcase, stack, storyEditor, FIXTURES } from '../stories/harness';

/**
 * The drawing surface: shapes, edge routing, themes and auto-arrange. Each
 * story builds a real editor, so panning, zooming and selection all work.
 */
const meta: Meta = {
  title: 'Canvas/Scene',
  parameters: {
    layout: 'centered',
    docs: { description: { component: 'The SVG canvas, driven by a real editor instance with a sample document.' } },
  },
};
export default meta;

type Story = StoryObj;

export const Flowchart: Story = {
  name: 'Flowchart',
  render: () => canvasFrame(storyEditor({ doc: fixture('orderFlow') }).host),
};

export const ClassDiagram: Story = {
  render: () => canvasFrame(storyEditor({ doc: fixture('classModel') }).host),
};

export const EdgeLanes: Story = {
  name: 'Edge lanes',
  render: () =>
    stack(
      note(
        'Auto-arrange reserves a lane for every edge that skips a rank. The long "Open pull request → Merge" edge and the "Push a fix" loop each get their own column instead of running under a shape.',
      ),
      canvasFrame(storyEditor({ doc: fixture('lanes') }).host),
    ),
};

export const EveryShape: Story = {
  name: 'Every shape',
  render: () => {
    const doc = shapeShowcase(allShapes().map((s) => s.id));
    return canvasFrame(storyEditor({ doc }).host);
  },
};

export const Colours: Story = {
  render: () => {
    const doc = diagramFrom(`flowchart LR
      a["Default"] --> b["Blue"] --> c["Green"] --> d["Amber"] --> e["Red"]`);
    const palette = [undefined, 'blue', 'green', 'amber', 'red'];
    doc.nodes.forEach((n, i) => (n.color = palette[i]));
    return canvasFrame(storyEditor({ doc }).host);
  },
};

export const WithoutGrid: Story = {
  name: 'Without the grid',
  render: () => canvasFrame(storyEditor({ doc: fixture('tiny'), grid: false }).host),
};

interface DirectionArgs {
  direction: Direction;
}

export const Directions: StoryObj<DirectionArgs> = {
  argTypes: {
    direction: { control: 'inline-radio', options: ['TB', 'LR', 'BT', 'RL'] },
  },
  args: { direction: 'LR' },
  render: ({ direction }) => {
    const doc = diagramFrom(FIXTURES.orderFlow);
    layoutDiagram(doc, { direction });
    resolveOverlaps(doc);
    return canvasFrame(storyEditor({ doc }).host);
  },
};

export const Empty: Story = {
  render: () => {
    const doc = diagramFrom('flowchart TD\n  a["Double-click the canvas to begin"]');
    doc.nodes = [];
    doc.edges = [];
    return stack(note('An empty document — the grid is all there is until something is added.'), canvasFrame(storyEditor({ doc }).host));
  },
};
