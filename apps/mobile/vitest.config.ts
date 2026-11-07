import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Unit tests for pure app logic (no React Native runtime). */
export default defineConfig({
  resolve: {
    alias: {
      '@bitecast/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
