import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Standalone Vitest config (no PWA/react plugins needed for pure-logic tests).
// Mirrors the @findstoop/shared alias from vite.config.ts so tests resolve the
// shared workspace source the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      '@findstoop/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
