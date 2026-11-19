/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_CONFIG_SHEET_ID?: string;
  readonly VITE_ORG_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
