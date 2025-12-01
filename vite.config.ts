import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5000,
        host: '0.0.0.0',
        strictPort: true,

        // 🔥 Add this:
        allowedHosts: [
          'bc329d2b-04ee-4904-84f1-c35f19ba3310-00-38khtap9kgxmu.pike.replit.dev'
        ]
        // If you want to allow ALL hosts, replace the array with: allowedHosts: true
      },

      plugins: [react()],

      css: {
        postcss: {
          plugins: [tailwindcss],
        },
      },

      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },

      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
