import { googleFetch } from './client';

export type DriveFile = gapi.client.drive.File;

const API = 'https://www.googleapis.com/drive/v3';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Làm việc được cả với Shared Drive. */
const ALL_DRIVES = { supportsAllDrives: true };

export const isFolder = (f: DriveFile) => f.mimeType === FOLDER_MIME;

export function getCurrentUser() {
  return googleFetch<gapi.client.drive.About>(`${API}/about`, {
    query: { fields: 'user(displayName,emailAddress,photoLink)' },
  }).then((a) => a.user!);
}

export function getFile(fileId: string, fields = 'id,name,mimeType,webViewLink,ownedByMe,owners(emailAddress)') {
  return googleFetch<DriveFile>(`${API}/files/${fileId}`, { query: { fields, ...ALL_DRIVES } });
}

/** Người dùng hiện tại có quyền sửa file không (Editor trở lên). Lỗi → coi như không. */
export async function canEditFile(fileId: string): Promise<boolean> {
  try {
    const f = await getFile(fileId, 'capabilities(canEdit)');
    return Boolean(f.capabilities?.canEdit);
  } catch {
    return false;
  }
}

/** Lấy toàn bộ con trực tiếp của 1 folder (tự phân trang). */
export async function listChildren(
  folderId: string,
  fields = 'id,name,mimeType,ownedByMe,owners(emailAddress)',
): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await googleFetch<gapi.client.drive.FileList>(`${API}/files`, {
      query: {
        q: `'${folderId}' in parents and trashed = false`,
        fields: `nextPageToken,files(${fields})`,
        pageSize: 1000,
        pageToken,
        includeItemsFromAllDrives: true,
        ...ALL_DRIVES,
      },
    });
    out.push(...(res.files ?? []));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

export function createFolder(name: string, parentId: string) {
  return googleFetch<DriveFile>(`${API}/files`, {
    method: 'POST',
    query: { fields: 'id,name,webViewLink', ...ALL_DRIVES },
    body: { name, mimeType: FOLDER_MIME, parents: [parentId] },
  });
}

export function copyFile(fileId: string, name: string, parentId: string) {
  return googleFetch<DriveFile>(`${API}/files/${fileId}/copy`, {
    method: 'POST',
    query: { fields: 'id,name', ...ALL_DRIVES },
    body: { name, parents: [parentId] },
  });
}

export function addPermission(fileId: string, emailAddress: string, role: 'reader' | 'commenter' | 'writer') {
  return googleFetch<gapi.client.drive.Permission>(`${API}/files/${fileId}/permissions`, {
    method: 'POST',
    query: { ...ALL_DRIVES },
    body: { type: 'user', role, emailAddress },
  });
}

/** Chia sẻ cho toàn bộ domain (vd 'example.com'). */
export function addDomainPermission(fileId: string, domain: string, role: 'reader' | 'writer') {
  return googleFetch<gapi.client.drive.Permission>(`${API}/files/${fileId}/permissions`, {
    method: 'POST',
    query: { ...ALL_DRIVES },
    body: { type: 'domain', domain, role },
  });
}

export function transferOwnership(fileId: string, emailAddress: string) {
  return googleFetch<gapi.client.drive.Permission>(`${API}/files/${fileId}/permissions`, {
    method: 'POST',
    query: { transferOwnership: true },
    body: { type: 'user', role: 'owner', emailAddress },
  });
}

/** Lấy ID từ link Drive/Sheets hoặc trả lại nguyên nếu đã là ID. */
export function extractId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m =
    s.match(/\/folders\/([\w-]+)/) ||
    s.match(/\/d\/([\w-]+)/) ||
    s.match(/[?&]id=([\w-]+)/) ||
    s.match(/^([\w-]{20,})$/);
  return m ? m[1] : null;
}

export function ownerOf(f: DriveFile): string {
  return f.owners?.[0]?.emailAddress ?? 'Shared drive / Unknown';
}

export const sortByName = (a: DriveFile, b: DriveFile) =>
  (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true, sensitivity: 'base' });
