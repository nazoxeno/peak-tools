import { useCallback, useEffect, useState } from 'react';

/**
 * useState được lưu vào localStorage (giữ lại sau khi đóng trình duyệt) và đồng bộ giữa các tab.
 * localStorage bị chặn (chế độ riêng tư…) → vẫn chạy bình thường, chỉ không lưu.
 */
export function useLocalState<T>(key: string, initial: T) {
  const storageKey = `peak-tools.${key}`;
  const read = useCallback((): T => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const [value, setValue] = useState<T>(read);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [storageKey, value]);

  // Tab khác thay đổi → cập nhật theo
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === storageKey && setValue(read());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey, read]);

  return [value, setValue] as const;
}
