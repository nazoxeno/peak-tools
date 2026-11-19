/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_CONFIG_SHEET_ID?: string;
  readonly VITE_ORG_DOMAIN?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Inject lúc build (vite.config.ts → define) */
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
