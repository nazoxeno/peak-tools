/**
 * Biến môi trường lúc build (KHÔNG commit giá trị thật vào repo):
 *  - Local:  file .env.local (copy từ .env.example)
 *  - GitHub: Settings → Secrets and variables → Actions → Variables
 */
export const ENV = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  configSheetId: import.meta.env.VITE_CONFIG_SHEET_ID ?? '',
  /** API key cho Google Picker (hộp chọn file Drive). Không bắt buộc — thiếu thì ẩn nút chọn. */
  googleApiKey: import.meta.env.VITE_GOOGLE_API_KEY ?? '',
  /** Domain công ty, chỉ dùng để hiển thị chữ (vd "example.com"). */
  orgDomain: import.meta.env.VITE_ORG_DOMAIN ?? '',
};

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  // Cho Apps Script engine (UrlFetchApp tải thumbnail). Phải khớp oauthScopes trong apps-script/engine/appsscript.json
  'https://www.googleapis.com/auth/script.external_request',
];
