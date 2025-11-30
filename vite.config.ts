import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Polyfill for process.env in browser if needed, though mostly handled by Vite's import.meta.env
    'process.env': process.env
  },
  server: {
    port: 3000,
    open: true
  }
});