// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3100',
      '/socket.io': { target: 'http://localhost:3100', ws: true },
    },
  },
});
