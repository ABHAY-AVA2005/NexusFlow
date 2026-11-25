/**
 * @module client/vite.config
 * @description Configures the Vite development server and production build.
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
