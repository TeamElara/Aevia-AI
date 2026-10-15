import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['apps/gateway/**/*.integration.test.ts', 'tests/integration/**/*.test.{ts,js}'], hookTimeout: 120000, testTimeout: 15000, restoreMocks: true } });
