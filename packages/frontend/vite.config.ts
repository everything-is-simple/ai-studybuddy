import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');

          if (
            normalizedId.includes('/node_modules/katex/') ||
            normalizedId.includes('/node_modules/rehype-katex/') ||
            normalizedId.includes('/node_modules/remark-math/')
          ) {
            return 'katex';
          }
          if (
            normalizedId.includes('/node_modules/react-markdown/') ||
            normalizedId.includes('/node_modules/remark-gfm/')
          ) {
            return 'markdown';
          }
          if (
            normalizedId.includes('/node_modules/markmap-lib/') ||
            normalizedId.includes('/node_modules/markmap-html-parser/') ||
            normalizedId.includes('/node_modules/markmap-common/')
          ) {
            return 'markmap-transformer';
          }
          if (
            normalizedId.includes('/node_modules/markmap-view/') ||
            /\/node_modules\/d3(?:-|\/)/.test(normalizedId)
          ) {
            return 'markmap-runtime';
          }
          return undefined;
        },
      },
    },
  },
});
