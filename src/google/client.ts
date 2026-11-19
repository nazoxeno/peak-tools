/**
 * fetch wrapper cho Google REST API:
 *  - tự gắn access token
 *  - retry khi gặp 429 / 5xx (exponential backoff)
 *  - token sắp hết hạn / 401 → TẠM DỪNG request, nhờ AuthProvider gia hạn phiên
 *    (người dùng bấm "Gia hạn"), rồi chạy tiếp — tác vụ dài không bị mất.
 */

let accessToken: string | null = null;
let expiresAt = 0;
/** Do AuthProvider cung cấp: trả về true khi đã có token mới, false nếu người dùng huỷ. */
let reauthHandler: (() => Promise<boolean>) | null = null;
let reauthInFlight: Promise<boolean> | null = null;

/** Gia hạn trước khi token hết hạn bao lâu (ms). */
const EXPIRY_MARGIN = 60_000;

export function setAccessToken(token: string | null, tokenExpiresAt = 0) {
  accessToken = token;
  expiresAt = token ? tokenExpiresAt : 0;
}

export function getAccessToken() {
  return accessToken;
}

export function setReauthHandler(handler: (() => Promise<boolean>) | null) {
  reauthHandler = handler;
}

export class GoogleApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Trả về token còn hạn; nếu sắp hết hạn (hoặc force) thì chờ người dùng gia hạn. */
export async function ensureToken(force = false): Promise<string> {
  // Đã đăng xuất → báo lỗi ngay (không chờ gia hạn)
  if (!accessToken || !reauthHandler) throw new GoogleApiError(401, 'Chưa đăng nhập Google.');
  if (!force && expiresAt - Date.now() > EXPIRY_MARGIN) return accessToken;

  // Nhiều request cùng lúc chỉ mở 1 lần gia hạn
  reauthInFlight ??= reauthHandler().finally(() => {
    reauthInFlight = null;
  });
  const ok = await reauthInFlight;
  if (!ok || !accessToken) throw new GoogleApiError(401, 'Phiên đăng nhập đã hết hạn.');
  return accessToken;
}

const MAX_RETRIES = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Query = Record<string, string | number | boolean | string[] | undefined>;

export async function googleFetch<T>(
  url: string,
  options: { method?: string; query?: Query; body?: unknown } = {},
): Promise<T> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(options.query ?? {})) {
    if (Array.isArray(v)) v.forEach((item) => u.searchParams.append(k, item));
    else if (v !== undefined) u.searchParams.set(k, String(v));
  }

  let token = await ensureToken();
  let reauthed = false;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(u, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (res.ok) {
      return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
    }

    // Token bị từ chối → gia hạn 1 lần rồi gửi lại
    if (res.status === 401 && !reauthed) {
      token = await ensureToken(true);
      reauthed = true;
      attempt--;
      continue;
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
      await sleep(Math.min(2 ** attempt * 1000, 16000) + Math.random() * 500);
      continue;
    }

    let message = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      message = data?.error?.message ?? message;
    } catch {
      /* body không phải JSON */
    }
    throw new GoogleApiError(res.status, message);
  }
}
