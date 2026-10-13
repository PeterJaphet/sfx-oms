import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'SFx Burger OMS',
        short_name: 'SFx Burger',
        description: 'The internal order and money app for SFx Burger.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#D7263D',
        background_color: '#FBF7F4',
        icons: [
          {
            src: '/icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ttf}'],
        cleanupOutdatedCaches: true,
        importScripts: ['/sw-safety.js'],
        navigateFallbackDenylist: [
          /^\/auth\//,
          /^\/rest\//,
          /^\/storage\//,
          /^\/functions\//,
        ],
        runtimeCaching: [],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  // Cache the database SDK independently as milestone screens grow.
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes('/node_modules/@supabase/') ? 'supabase' : undefined,
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
