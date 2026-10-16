/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute base URL of the API Worker, e.g. "https://bbcm-summons-api.bbcmsummons.workers.dev".
   * Set at build time only when the SPA is hosted on a different origin than the Worker;
   * left unset for the same-origin build the Worker serves itself. See src/lib/api.ts.
   */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
