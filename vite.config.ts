import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import path from 'node:path';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@popup': path.resolve(__dirname, 'src/popup'),
      '@content': path.resolve(__dirname, 'src/content'),
      '@background': path.resolve(__dirname, 'src/background'),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    minify: true,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/chunk-[hash].js',
      },
    },
  },
});
