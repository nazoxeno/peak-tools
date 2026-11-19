/**
 * Google Picker — hộp chọn file/folder giống giao diện Google Drive.
 * Cần: VITE_GOOGLE_API_KEY + bật "Google Picker API" trong Cloud project.
 */
import { ENV } from '../env';
import { ensureToken } from './client';
import { FOLDER_MIME } from './drive';

export type PickKind = 'folder' | 'spreadsheet';
export type PickedItem = { id: string; name: string; url: string };

export const isPickerAvailable = () => Boolean(ENV.googleApiKey);

const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

let loading: Promise<void> | null = null;

/** Tải https://apis.google.com/js/api.js rồi gapi.load('picker') — chỉ 1 lần. */
function loadPickerLib(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const w = window as unknown as { gapi?: { load: (lib: string, opts: { callback: () => void; onerror: () => void }) => void } };
    const done = () => w.gapi!.load('picker', { callback: resolve, onerror: () => reject(new Error('Không tải được Google Picker')) });
    if (w.gapi) return done();

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = done;
    script.onerror = () => {
      loading = null;
      reject(new Error('Không tải được Google Picker'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Project number = phần đầu của OAuth Client ID. */
const appId = () => ENV.googleClientId.split('-')[0];

function buildViews(kind: PickKind, query?: string): google.picker.DocsView[] {
  const P = google.picker;
  const labeled = (v: google.picker.DocsView, label: string) => {
    v.setLabel(label);
    if (query) v.setQuery(query); // điền sẵn từ khoá tìm kiếm
    return v;
  };

  if (kind === 'folder') {
    // Chỉ hiện & cho chọn folder
    const folders = () =>
      new P.DocsView(P.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(FOLDER_MIME);
    return [
      labeled(folders().setParent('root') as google.picker.DocsView, 'Drive của tôi'),
      labeled(folders().setEnableDrives(true), 'Drive dùng chung'),
      labeled(folders().setOwnedByMe(false), 'Được chia sẻ với tôi'),
      labeled(folders().setStarred(true), 'Có gắn dấu sao'),
    ];
  }

  // Google Sheet: chỉ hiện file Sheet, không cho chọn folder
  const sheets = () => new P.DocsView(P.ViewId.SPREADSHEETS).setMimeTypes(SHEET_MIME).setSelectFolderEnabled(false);
  return [
    // Tất cả Sheet có quyền truy cập, mới nhất lên đầu — tìm kiếm nhanh nhất
    labeled(sheets(), 'Tất cả Google Sheet'),
    // Duyệt theo cây thư mục: hiện folder để mở vào, nhưng chỉ chọn được Sheet
    labeled(sheets().setIncludeFolders(true).setParent('root') as google.picker.DocsView, 'Duyệt thư mục'),
    labeled(sheets().setEnableDrives(true).setIncludeFolders(true), 'Drive dùng chung'),
    labeled(sheets().setStarred(true), 'Có gắn dấu sao'),
  ];
}

/**
 * Mở Picker. Trả về item đã chọn, hoặc null nếu người dùng đóng.
 * @param query từ khoá tìm kiếm điền sẵn (vd "UI Checklist")
 */
export async function pickFromDrive(kind: PickKind, title?: string, query?: string): Promise<PickedItem | null> {
  if (!ENV.googleApiKey) throw new Error('Chưa cấu hình VITE_GOOGLE_API_KEY.');

  const [token] = await Promise.all([ensureToken(), loadPickerLib()]);
  const P = google.picker;

  return new Promise((resolve, reject) => {
    const builder = new P.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(ENV.googleApiKey)
      .setAppId(appId())
      .setLocale('vi')
      .setTitle(title ?? (kind === 'folder' ? 'Chọn folder' : 'Chọn Google Sheet'))
      .enableFeature(P.Feature.SUPPORT_DRIVES)
      .setCallback((data: google.picker.ResponseObject) => {
        if (data.action === P.Action.PICKED) {
          const doc = data.docs?.[0];
          if (!doc) return resolve(null);
          // Chặn chọn nhầm loại (vd chọn folder ở ô Sheet)
          const expected = kind === 'folder' ? FOLDER_MIME : SHEET_MIME;
          if (doc.mimeType !== expected) {
            return reject(new Error(kind === 'folder' ? 'Vui lòng chọn một folder.' : 'Vui lòng chọn một file Google Sheet.'));
          }
          resolve({ id: doc.id, name: doc.name ?? '', url: doc.url ?? '' });
        } else if (data.action === P.Action.CANCEL) {
          resolve(null);
        }
      });

    for (const view of buildViews(kind, query)) builder.addView(view);
    builder.build().setVisible(true);
  });
}
