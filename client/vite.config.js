/**
 * @module client/vite.config
 * @description Tells Vite to transform React JSX and serve the frontend on port 5174.
 * Binding to all network interfaces lets the page be reached from development tools or LAN devices.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
  },
});
