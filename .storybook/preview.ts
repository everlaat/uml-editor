import type { Preview } from '@storybook/html-vite';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import '../src/styles.css';
import './storybook.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: { expanded: true, matchers: { color: /(background|colour|color)$/i } },
    backgrounds: { disable: true },
    options: {
      storySort: {
        order: ['Introduction', 'Foundations', 'Canvas', 'Panels', 'Chrome', 'Overlays'],
      },
    },
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { dark: 'dark', light: 'light' },
      defaultTheme: 'dark',
      attributeName: 'data-theme',
      parentSelector: 'html',
    }),
  ],
};

export default preview;
