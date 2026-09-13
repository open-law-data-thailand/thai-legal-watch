/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { productionHeaders } from './scripts/headers.js'

export default defineConfig({
  // the preview server sends what Cloudflare will send, so the e2e runs under the real
  // Content-Security-Policy rather than under no policy at all
  plugins: [preact(), productionHeaders()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // the charting code is only reached from two routes; keeping it in its own chunk means
        // the other seven pages never download it
        manualChunks: (id: string) =>
          id.includes('node_modules/echarts') || id.includes('node_modules/zrender') ? 'charts' : undefined,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    coverage: { provider: 'v8', include: ['src/lib/**', 'src/data/**'], thresholds: { lines: 85 } },
  },
})
