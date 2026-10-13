import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  // Cache the database SDK independently as milestone screens grow.
  build: { rollupOptions: { output: { manualChunks: id => id.includes('/node_modules/@supabase/') ? 'supabase' : undefined } } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
