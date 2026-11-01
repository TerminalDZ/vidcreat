import path from 'node:path';
import { defineConfig } from 'vitest/config';

const r = (p: string) => path.resolve(__dirname, p);
// Unit tests run against sources; the runtime page and studio client are used from their builds.
const alias = {
  '@reelforge/core': r('packages/core/src/index.ts'),
  '@reelforge/audio': r('packages/audio/src/index.ts'),
  '@reelforge/assist': r('packages/assist/src/index.ts'),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20000,
        },
      },
      {
        test: {
          name: 'browser',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
          testTimeout: 300000,
          hookTimeout: 300000,
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**', 'packages/runtime/src/**', 'packages/audio/src/**'],
      exclude: [
        '**/*.d.ts',
        'packages/runtime/src/main.ts',
        'packages/runtime/src/node.ts',
        'packages/runtime/src/fonts.ts',
      ],
      thresholds: { lines: 85 },
      reporter: ['text-summary', 'html'],
    },
  },
});
