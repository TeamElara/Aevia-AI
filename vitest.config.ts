import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['apps/gateway/**/*.test.ts', 'tests/**/*.test.{js,ts}', 'packages/detectors/test/**/*.test.ts'], exclude: ['**/*.integration.test.ts'], testTimeout: 10000, restoreMocks: true },
});
