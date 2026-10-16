/**
 * Ambient types for the workers test pool.
 *
 * The bindings are declared inline rather than by extending the Worker's `Env`:
 * a type imported inside a `declare module` block is not visible to an `extends`
 * clause in the same block, which leaves every `env.DB` reference untyped.
 */
declare module 'cloudflare:test' {
  interface D1Migration {
    name: string;
    queries: string[];
  }

  interface ProvidedEnv {
    DB: D1Database;
    DOCUMENTS: R2Bucket;
    SESSIONS: KVNamespace;
    ANTHROPIC_API_KEY?: string;
    ENVIRONMENT?: string;
    TEST_MIGRATIONS: D1Migration[];
  }

  export const env: ProvidedEnv;
  export const SELF: { fetch: typeof fetch };
  export function applyD1Migrations(db: D1Database, migrations: D1Migration[]): Promise<void>;
}
