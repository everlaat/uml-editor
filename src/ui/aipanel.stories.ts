import type { Meta, StoryObj } from '@storybook/html-vite';
import { createAiPanel } from './aipanel';
import { note, panelFrame, sampleImageFile, stack, storyEditor } from '../stories/harness';

/**
 * The Generate panel: an instant rule-based generator, an optional local
 * model, and reading a diagram out of a picture.
 */
const meta: Meta = {
  title: 'Panels/Generate',
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj;

export const Empty: Story = {
  render: () => panelFrame(createAiPanel(storyEditor().editor).el),
};

export const WithAPrompt: Story = {
  name: 'With a prompt',
  render: () => {
    const panel = createAiPanel(storyEditor().editor);
    const prompt = panel.el.querySelector('textarea') as HTMLTextAreaElement;
    prompt.value =
      'Customer places an order. Check stock. If in stock, charge the card, then pack and ship it. Otherwise notify the customer and cancel.';
    return panelFrame(panel.el);
  },
};

export const ImageAttached: Story = {
  name: 'Picture attached',
  render: () => {
    const panel = createAiPanel(storyEditor().editor);
    const frame = panelFrame(panel.el);
    // Attaching locks the generator to the vision model and renames the action.
    void sampleImageFile().then((file) => panel.attachImage(file));
    return stack(
      note('Attaching a picture switches the generator to the local vision model and renames the button to "Read the image". Without WebGPU the panel says so rather than failing later.'),
      frame,
    );
  },
};

export const LocalModel: Story = {
  name: 'Local model selected',
  render: () => {
    const panel = createAiPanel(storyEditor().editor);
    (panel.el.querySelector('.seg-btn[data-mode="local-model"]') as HTMLButtonElement)?.click();
    return panelFrame(panel.el);
  },
};
