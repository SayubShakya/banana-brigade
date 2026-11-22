// Vite settings for the React client in client/.
// `vite build` writes the finished site to client/dist, which the Express server then serves.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  // Empty client/dist before each build so old files do not linger.
  build: { outDir: 'dist', emptyOutDir: true },
  // Dev mode only (npm run dev): Vite serves the client on 5173 and forwards API calls
  // and Socket.io traffic (ws: true means WebSockets too) to the Express server on 3100.
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3100',
      '/socket.io': { target: 'http://localhost:3100', ws: true },
    },
  },
});
