/**
 * Two test environments:
 *  - packages/*  run in plain Node (pure functions, no bindings needed)
 *  - apps/api    runs in workerd with real D1, R2 and KV bindings, so the
 *                authorisation tests exercise the actual SQL and session code
 */
export default ['./vitest.config.ts', './apps/api/vitest.config.ts'];
