import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['apps/gateway/**/*.test.ts', 'apps/web/**/*.test.tsx', 'packages/detectors/test/**/*.test.ts', 'tests/security/**/*.test.js'], exclude: ['**/*.integration.test.ts'], hookTimeout: 120000, testTimeout: 15000, restoreMocks: true },
});
