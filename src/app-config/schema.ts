/**
 * Cấu hình ứng dụng — được đọc từ Google Sheet (VITE_CONFIG_SHEET_ID) sau khi đăng nhập.
 * Email nội bộ chỉ nằm trong Sheet, không nằm trong code/bundle.
 *
 * Cấu trúc Sheet (dòng 1 là tiêu đề, dữ liệu từ dòng 2):
 *   settings           key | value | ghi chú
 *   clone_permissions  suffix | emails (phân tách bằng dấu phẩy/xuống dòng) | ghi chú
 *   type_colors        giá trị | màu (#hex)
 *   status_colors      giá trị | màu (#hex)
 */
export type AppConfig = {
  clone: {
    template: { gameId: string; gameName: string };
    /** Nếu có, mọi file/folder clone ra sẽ được chuyển owner cho email này. */
    newOwnerEmail: string;
    /** Cấp quyền Edit cho folder có tên `<gameId>-<gameName><suffix>`. */
    permissions: { suffix: string; emails: string[] }[];
  };
  changeOwner: { defaultEmail: string };
  /** Apps Script engine (cho các tool cần chèn ảnh vào Sheet). */
  engine: { scriptId: string };
  /** Mở game nội bộ: mẫu URL có {prefix}, {id}, {token}, {user_id}; idPrefixes vd "4:kts,5:gss" */
  game: { urlTemplate: string; idPrefixes: string };
  typeColors: Record<string, string>;
  statusColors: Record<string, string>;
};

export const DEFAULT_CONFIG: AppConfig = {
  clone: {
    template: { gameId: '0000', gameName: 'GameName' },
    newOwnerEmail: '',
    permissions: [],
  },
  changeOwner: { defaultEmail: '' },
  engine: { scriptId: '' },
  game: { urlTemplate: '', idPrefixes: '' },
  typeColors: {
    Static: '#fce8b2',
    Spine: '#9fc5e8',
    Cocos: '#b6d7a8',
    FBF: '#d9d2e9',
    'Bitmap Font': '#ffffff',
    PSD: '#f4cccc',
  },
  statusColors: {
    DONE: '#b7e1cd',
    'Not yet': '#f4cccc',
    'N/A': '#e8eaed',
    New: '#ffff00',
    Update: '#f6b26b',
    Optimize: '#fff2cc',
  },
};

export const TABS = {
  settings: 'settings',
  clonePermissions: 'clone_permissions',
  typeColors: 'type_colors',
  statusColors: 'status_colors',
} as const;

/** Các key hợp lệ trong tab `settings`. */
export const SETTING_KEYS = {
  'clone.template.gameId': 'ID game trong tên folder mẫu (sẽ được thay bằng Game ID mới)',
  'clone.template.gameName': 'Tên game trong tên folder mẫu (sẽ được thay bằng Game Name mới)',
  'clone.newOwnerEmail': 'Để trống nếu không muốn tự chuyển owner sau khi clone',
  'changeOwner.defaultEmail': 'Email điền sẵn ở tool Drive Ownership',
  'engine.scriptId': 'Script ID của PEAK Tools Engine (Apps Script) — dùng cho Art/Anim Checklist',
  'game.urlTemplate': 'Mẫu URL mở game (Game Launcher + script game-check), vd https://…/{prefix}{id}/?token={token}',
  'game.idPrefixes': 'Prefix theo số chữ số của ID, vd 4:kts,5:gss (ID 4 số → kts, 5 số → gss)',
} as const;

export type SettingKey = keyof typeof SETTING_KEYS;
