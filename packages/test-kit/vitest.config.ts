import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@synova/sog-core': path.resolve(__dirname, '../sog-core/src/index.ts'),
      '@synova/logger': path.resolve(__dirname, '../logger/src/index.ts'),
      '@synova/error-types': path.resolve(__dirname, '../error-types/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    include: ['./tests/**/*.test.ts'],
    hookTimeout: 15_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    env: {
      DEV_MODE: 'true',
      LOG_LEVEL: 'silent',
    },
  },
});
