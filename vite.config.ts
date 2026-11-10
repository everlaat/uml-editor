import { defineConfig } from 'vite';

// `base` is overridden in CI so the app works from https://<user>.github.io/<repo>/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: { port: 5173, host: true },
});
