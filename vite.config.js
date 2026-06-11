import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'info',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the vendor bundle so marketing pages don't pay for app-only
        // dependencies, and core libraries cache independently of app code.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Tiny utils used by every component must live with the core chunk —
          // left unassigned, rollup colocates them into whichever big consumer
          // chunk it likes (clsx landed inside charts, dragging 104KB of
          // recharts onto every page).
          if (id.includes('clsx') || id.includes('tailwind-merge') || id.includes('class-variance-authority')) return 'react';
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('node_modules/appwrite')) return 'appwrite';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor') || id.includes('react-smooth')) return 'charts';
          if (id.includes('@hello-pangea')) return 'dnd';
          if (id.includes('react-router')) return 'router';
          if (
            id.includes('node_modules/react/')
            || id.includes('node_modules/react-dom/')
            || id.includes('node_modules/scheduler/')
          ) return 'react';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/appwrite/v1': {
        target: 'https://nyc.cloud.appwrite.io',
        changeOrigin: true,
        secure: true,
        ws: true,
        rewrite: (requestPath) => requestPath.replace(/^\/appwrite/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
          });
        },
      },
    },
  },
});
