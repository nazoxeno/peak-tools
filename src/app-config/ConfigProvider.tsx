import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ENV } from '../env';
import { DEFAULT_CONFIG, type AppConfig } from './schema';
import { ConfigError, loadConfigFromSheet } from './sheetConfig';

type ConfigState = {
  status: 'loading' | 'ready' | 'error';
  /** Luôn có giá trị — khi lỗi sẽ là DEFAULT_CONFIG (không có email nào). */
  config: AppConfig;
  error: ConfigError | null;
  reload: () => void;
};

const ConfigContext = createContext<ConfigState | null>(null);

/** Đặt bên trong vùng đã đăng nhập — đọc Sheet bằng token của người dùng. */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConfigState['status']>('loading');
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [error, setError] = useState<ConfigError | null>(null);

  const load = useCallback(async () => {
    try {
      setConfig(await loadConfigFromSheet(ENV.configSheetId));
      setError(null);
      setStatus('ready');
    } catch (e) {
      setConfig(DEFAULT_CONFIG);
      setError(e instanceof ConfigError ? e : new ConfigError('other', (e as Error).message));
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

  return <ConfigContext.Provider value={{ status, config, error, reload }}>{children}</ConfigContext.Provider>;
}

export function useAppConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useAppConfig phải dùng bên trong <ConfigProvider>');
  return ctx;
}
