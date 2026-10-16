import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const migrations = await readD1Migrations(path.join(here, 'migrations'));

export default defineWorkersConfig({
  test: {
    name: 'api',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    poolOptions: {
      workers: {
        singleWorker: true,
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // Handed to the setup file, which applies them before each suite.
          bindings: { TEST_MIGRATIONS: migrations },

          // Storage is declared here rather than inherited from wrangler.toml, where the
          // R2 binding is commented out because the Cloudflare account has R2 disabled.
          // That is a fact about one deployment, not about the code — the upload paths
          // still need covering, so the tests get their own local bucket.
          r2Buckets: ['DOCUMENTS'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@bbcm/schema': path.join(root, 'packages/schema/src/index.ts'),
      '@bbcm/documents': path.join(root, 'packages/documents/src/index.ts'),
    },
  },
});
