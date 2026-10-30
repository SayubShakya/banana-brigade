// Builds the React screens and the game engine from client/ into client/dist,
// which the Express server sends to the browser. During development,
// `npm run dev:client` serves client/ with hot reload and forwards /api and the
// WebSocket to the game server on port 3100.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

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
