/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes('node_modules/echarts') || id.includes('node_modules/zrender') ? 'echarts' : undefined,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    coverage: { provider: 'v8', include: ['src/lib/**', 'src/data/**'], thresholds: { lines: 85 } },
  },
})
