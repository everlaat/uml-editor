import type { Meta, StoryObj } from '@storybook/html-vite';
import type { TextAlign, TextFont, TextStyle } from '../core/model';
import { emptyDiagram, makeNode } from '../core/model';
import { fitNodeSize } from './shapes';
import { FONT_LABELS } from './typography';
import { canvasFrame, note, stack, storyEditor } from '../stories/harness';

/** Type settings for labels, and the free-text elements built on them. */
const meta: Meta = {
  title: 'Canvas/Text',
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj;

function sized(shape: string, label: string, text: TextStyle, x: number, y: number, w?: number) {
  const node = makeNode({ x, y, shape, label, text });
  const fit = fitNodeSize(node);
  node.w = w ?? Math.max(node.w, fit.w);
  node.h = Math.max(node.h, fit.h);
  return node;
}

export const Fonts: Story = {
  render: () => {
    const doc = emptyDiagram('Fonts');
    (Object.keys(FONT_LABELS) as TextFont[]).forEach((font, i) => {
      doc.nodes.push(sized('rect', `${FONT_LABELS[font]} 123`, { font }, 40 + i * 180, 40));
    });
    return stack(note('Only system fonts, so nothing is fetched at render time and exports stay faithful.'), canvasFrame(storyEditor({ doc }).host));
  },
};

export const SizesAndWeights: Story = {
  name: 'Sizes and weights',
  render: () => {
    const doc = emptyDiagram('Sizes');
    [12, 16, 22, 30].forEach((size, i) => {
      doc.nodes.push(sized('rect', `${size}px`, { size }, 40, 40 + i * 110));
      doc.nodes.push(sized('rect', `${size}px bold`, { size, bold: true }, 260, 40 + i * 110));
      doc.nodes.push(sized('rect', `${size}px italic`, { size, italic: true }, 520, 40 + i * 110));
    });
    return canvasFrame(storyEditor({ doc }).host);
  },
};

export const Alignment: Story = {
  render: () => {
    const doc = emptyDiagram('Alignment');
    const aligns: TextAlign[] = ['left', 'center', 'right'];
    aligns.forEach((align, i) => {
      (['top', 'middle', 'bottom'] as const).forEach((valign, j) => {
        const node = makeNode({
          x: 40 + i * 230,
          y: 40 + j * 130,
          w: 200,
          h: 110,
          shape: 'rect',
          label: `${align} / ${valign}`,
          text: { align, valign, size: 13 },
        });
        doc.nodes.push(node);
      });
    });
    return canvasFrame(storyEditor({ doc }).host);
  },
};

export const FreeText: Story = {
  name: 'Text on the canvas',
  render: () => {
    const doc = emptyDiagram('Annotation');
    doc.nodes.push(
      sized('heading', 'Checkout service', {}, 40, 30, 320),
      sized('text', 'Everything below the line runs in the payments cluster. Text elements are ordinary canvas objects — select, move, restyle.', { size: 13 }, 40, 90, 360),
      sized('rect', 'Take payment', {}, 40, 220),
      sized('callout', 'Retries three times', { size: 12 }, 240, 210),
      sized('note', 'A sticky note, for contrast', { size: 12 }, 450, 215),
    );
    return stack(
      note('Free text, headings, callouts and frames have no Mermaid equivalent. The editor keeps them when you edit the Mermaid code rather than deleting what the code never mentioned.'),
      canvasFrame(storyEditor({ doc }).host),
    );
  },
};

export const Colours: Story = {
  name: 'Text colour',
  render: () => {
    const doc = emptyDiagram('Text colour');
    ['blue', 'green', 'amber', 'red', 'violet'].forEach((color, i) => {
      doc.nodes.push(sized('rect', color, { color, bold: true }, 40 + i * 150, 40));
    });
    doc.nodes.push(sized('text', 'Coloured free text', { color: 'teal', size: 20 }, 40, 150, 300));
    return canvasFrame(storyEditor({ doc }).host);
  },
};
