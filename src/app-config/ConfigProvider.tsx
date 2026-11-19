import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ENV } from '../env';
import { canEditFile } from '../google/drive';
import { DEFAULT_CONFIG, type AppConfig } from './schema';
import { ConfigError, loadConfigFromSheet } from './sheetConfig';

type ConfigState = {
  status: 'loading' | 'ready' | 'error';
  /** Luôn có giá trị — khi lỗi sẽ là DEFAULT_CONFIG (không có email nào). */
  config: AppConfig;
  error: ConfigError | null;
  /**
   * Có quyền sửa Sheet cấu hình (Editor) → được xem/quản lý trang Cấu hình.
   * Chạy local khi chưa đặt Sheet ID → true để còn tạo Sheet mẫu.
   */
  canEditConfig: boolean;
  reload: () => void;
};

const ConfigContext = createContext<ConfigState | null>(null);

/** Đặt bên trong vùng đã đăng nhập — đọc Sheet bằng token của người dùng. */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConfigState['status']>('loading');
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [error, setError] = useState<ConfigError | null>(null);
  const [canEditConfig, setCanEditConfig] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cfg, canEdit] = await Promise.all([
        loadConfigFromSheet(ENV.configSheetId),
        canEditFile(ENV.configSheetId),
      ]);
      setConfig(cfg);
      setCanEditConfig(canEdit);
      setError(null);
      setStatus('ready');
    } catch (e) {
      const err = e instanceof ConfigError ? e : new ConfigError('other', (e as Error).message);
      setConfig(DEFAULT_CONFIG);
      setCanEditConfig(import.meta.env.DEV && err.kind === 'notConfigured');
      setError(err);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(() => {
    setStatus('loading');
    load();
  }, [load]);

  return <ConfigContext.Provider value={{ status, config, error, canEditConfig, reload }}>{children}</ConfigContext.Provider>;
}

export function useAppConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useAppConfig phải dùng bên trong <ConfigProvider>');
  return ctx;
}
