import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ENV, GOOGLE_SCOPES } from '../env';
import { setAccessToken, setUnauthorizedHandler } from '../google/client';
import { getCurrentUser } from '../google/drive';

export type GoogleUser = { displayName?: string; emailAddress?: string; photoLink?: string };

type AuthState = {
  /** 'loading' khi chờ script Google tải xong / đang khôi phục phiên */
  status: 'loading' | 'signedOut' | 'signedIn';
  user: GoogleUser | null;
  error: string | null;
  /** Mở bảng chọn tài khoản Google */
  signIn: () => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

// Token chỉ giữ trong tab hiện tại (sessionStorage), hết hạn sau ~1 giờ.
const STORAGE_KEY = 'peak-tools.token';
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
  const tokenClient = useRef<google.accounts.oauth2.TokenClient | null>(null);
  const tokenRef = useRef<string | null>(null);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setAccessToken(null);
    setUser(null);
    setStatus('signedOut');
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const applyToken = useCallback(
    async (token: string, expiresAt: number) => {
      tokenRef.current = token;
      setAccessToken(token);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt }));
      } catch {
        /* ignore */
      }
      try {
        setUser(await getCurrentUser());
        setStatus('signedIn');
        setError(null);
      } catch (e) {
        clearSession();
        setError(`Không lấy được thông tin tài khoản: ${(e as Error).message}`);
      }
    },
    [clearSession],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    });

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
          // popup bị đóng / bị chặn
          if (err.type !== 'popup_closed') setError(`Đăng nhập thất bại: ${err.type}`);
        },
      });

      const stored = loadStoredToken();
      if (stored) applyToken(stored.token, stored.expiresAt);
      else setStatus('signedOut');
    });

    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, [applyToken, clearSession]);

  const signIn = useCallback(() => {
    setError(null);
    tokenClient.current?.requestAccessToken({ prompt: 'select_account' });
  }, []);

  const signOut = useCallback(() => {
    const token = tokenRef.current;
    if (token) google.accounts.oauth2.revoke(token, () => {});
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ status, user, error, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải dùng bên trong <AuthProvider>');
  return ctx;
}
