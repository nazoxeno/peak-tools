import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ENV, GOOGLE_SCOPES } from '../env';
import { setAccessToken, setReauthHandler } from '../google/client';
import { getCurrentUser } from '../google/drive';

export type GoogleUser = { displayName?: string; emailAddress?: string; photoLink?: string };

/**
 * idle     – token còn hạn
 * soon     – sắp hết hạn (≤ 5 phút) → hiện banner gợi ý gia hạn
 * required – đã hết hạn / bị từ chối, request đang TẠM DỪNG chờ gia hạn
 */
export type ReauthState = 'idle' | 'soon' | 'required';

type AuthState = {
  /** 'loading' khi chờ script Google tải xong / đang khôi phục phiên */
  status: 'loading' | 'signedOut' | 'signedIn';
  user: GoogleUser | null;
  error: string | null;
  reauth: ReauthState;
  /** Mở bảng chọn tài khoản Google */
  signIn: () => void;
  signOut: () => void;
  /** Gia hạn phiên với cùng tài khoản (phải gọi từ thao tác click của người dùng) */
  renewSession: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

// Token chỉ giữ trong tab hiện tại (sessionStorage), hết hạn sau ~1 giờ.
const STORAGE_KEY = 'peak-tools.token';
const WARN_BEFORE_EXPIRY = 5 * 60_000;
type StoredToken = { token: string; expiresAt: number };

function loadStoredToken(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    return t.expiresAt > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}

function waitForGoogleScript(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => (window.google?.accounts?.oauth2 ? resolve() : setTimeout(check, 100));
    check();
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState<ReauthState>('idle');
  const [expiresAt, setExpiresAt] = useState(0);

  const tokenClient = useRef<google.accounts.oauth2.TokenClient | null>(null);
  const tokenRef = useRef<string | null>(null);
  const userRef = useRef<GoogleUser | null>(null);
  /** Các request đang chờ gia hạn */
  const waiters = useRef<((ok: boolean) => void)[]>([]);

  const releaseWaiters = useCallback((ok: boolean) => {
    const list = waiters.current;
    waiters.current = [];
    list.forEach((resolve) => resolve(ok));
  }, []);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    userRef.current = null;
    setAccessToken(null);
    setUser(null);
    setStatus('signedOut');
    setReauth('idle');
    setExpiresAt(0);
    releaseWaiters(false);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [releaseWaiters]);

  const applyToken = useCallback(
    async (token: string, tokenExpiresAt: number) => {
      const previousEmail = userRef.current?.emailAddress;
      tokenRef.current = token;
      setAccessToken(token, tokenExpiresAt);
      setExpiresAt(tokenExpiresAt);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt: tokenExpiresAt }));
      } catch {
        /* ignore */
      }
      try {
        const me = await getCurrentUser();
        // Đang gia hạn mà lại chọn tài khoản khác → không cho tác vụ chạy tiếp bằng tài khoản mới
        releaseWaiters(!(previousEmail && me.emailAddress !== previousEmail));
        userRef.current = me;
        setUser(me);
        setStatus('signedIn');
        setReauth('idle');
        setError(null);
      } catch (e) {
        clearSession();
        setError(`Không lấy được thông tin tài khoản: ${(e as Error).message}`);
      }
    },
    [clearSession, releaseWaiters],
  );

  // Khởi tạo Google Identity Services + khôi phục phiên
  useEffect(() => {
    // googleFetch gọi hàm này khi token sắp hết hạn / bị 401 → chờ người dùng bấm "Gia hạn"
    setReauthHandler(
      () =>
        new Promise<boolean>((resolve) => {
          waiters.current.push(resolve);
          setReauth('required');
        }),
    );

    let cancelled = false;
    waitForGoogleScript().then(() => {
      if (cancelled) return;
      if (!ENV.googleClientId) {
        setStatus('signedOut');
        return;
      }
      tokenClient.current = google.accounts.oauth2.initTokenClient({
        client_id: ENV.googleClientId,
        scope: GOOGLE_SCOPES.join(' '),
        callback: (resp) => {
          if (resp.error) {
            setError(resp.error_description || resp.error);
            return;
          }
          if (!google.accounts.oauth2.hasGrantedAllScopes(resp, GOOGLE_SCOPES[0], ...GOOGLE_SCOPES.slice(1))) {
            setError('Bạn cần cấp đủ quyền Google Drive và Google Sheets để dùng tool.');
            return;
          }
          applyToken(resp.access_token, Date.now() + Number(resp.expires_in) * 1000);
        },
        error_callback: (err) => {
          // popup bị đóng / bị chặn — nếu đang gia hạn thì vẫn giữ hộp thoại để thử lại
          if (err.type !== 'popup_closed') setError(`Đăng nhập thất bại: ${err.type}`);
        },
      });

      const stored = loadStoredToken();
      if (stored) applyToken(stored.token, stored.expiresAt);
      else setStatus('signedOut');
    });

    return () => {
      cancelled = true;
      setReauthHandler(null);
    };
  }, [applyToken]);

  // Báo trước khi token hết hạn
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(
      () => setReauth((r) => (r === 'idle' ? 'soon' : r)),
      Math.max(0, expiresAt - Date.now() - WARN_BEFORE_EXPIRY),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);

  const signIn = useCallback(() => {
    setError(null);
    tokenClient.current?.requestAccessToken({ prompt: 'select_account' });
  }, []);

  const renewSession = useCallback(() => {
    setError(null);
    tokenClient.current?.requestAccessToken({ prompt: '', login_hint: userRef.current?.emailAddress });
  }, []);

  const signOut = useCallback(() => {
    const token = tokenRef.current;
    if (token) google.accounts.oauth2.revoke(token, () => {});
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ status, user, error, reauth, signIn, signOut, renewSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải dùng bên trong <AuthProvider>');
  return ctx;
}
