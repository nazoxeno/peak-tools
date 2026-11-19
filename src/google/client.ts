/**
 * fetch wrapper cho Google REST API:
 *  - tự gắn access token
 *  - retry khi gặp 429 / 5xx (exponential backoff)
 *  - 401 → báo cho AuthProvider để bắt đăng nhập lại
 */

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export class GoogleApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX_RETRIES = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Query = Record<string, string | number | boolean | string[] | undefined>;

export async function googleFetch<T>(
  url: string,
  options: { method?: string; query?: Query; body?: unknown } = {},
): Promise<T> {
  if (!accessToken) throw new GoogleApiError(401, 'Chưa đăng nhập Google.');

  const u = new URL(url);
  for (const [k, v] of Object.entries(options.query ?? {})) {
    if (Array.isArray(v)) v.forEach((item) => u.searchParams.append(k, item));
    else if (v !== undefined) u.searchParams.set(k, String(v));
  }

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(u, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (res.ok) {
      return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
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

    if (res.status === 401) onUnauthorized?.();
    throw new GoogleApiError(res.status, message);
  }
}
