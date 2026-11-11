import type { StorybookConfig } from '@storybook/html-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts', '../src/**/*.mdx'],
  addons: ['@storybook/addon-themes', '@storybook/addon-docs'],
  framework: { name: '@storybook/html-vite', options: {} },
  core: { disableTelemetry: true },
  // The app's own vite config sets a deploy base path that means nothing here.
  viteFinal: async (config) => ({ ...config, base: './' }),
};

export default config;
