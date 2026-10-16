import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    name: 'packages',
    globals: true,
    environment: 'node',
    // apps/api runs in workerd via apps/api/vitest.config.ts, not here. The web app's
    // pure display helpers have no DOM dependency, so they run in this project too.
    include: ['packages/**/*.test.ts', 'apps/web/test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@bbcm/schema': resolve(__dirname, 'packages/schema/src/index.ts'),
      '@bbcm/documents': resolve(__dirname, 'packages/documents/src/index.ts'),
    },
  },
});
