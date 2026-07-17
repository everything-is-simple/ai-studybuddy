import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
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
        manualChunks: {
          katex: ['katex', 'rehype-katex', 'remark-math'],
          markdown: ['react-markdown', 'remark-gfm'],
          markmap: ['markmap-lib', 'markmap-view'],
        },
      },
    },
  },
});
