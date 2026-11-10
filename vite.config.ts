import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { proxy: { '/api/fire-safety': { target: 'http://127.0.0.1:5088', changeOrigin: true } } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'FireSafety',
        short_name: 'FireSafety',
        description: 'Kiểm tra an toàn PCCC',
        theme_color: '#c2410c',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: []
      }
    })
  ]
});
