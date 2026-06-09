import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'info',
  plugins: [react()],
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
