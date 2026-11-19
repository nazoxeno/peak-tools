import { useEffect, useState } from 'react';

/**
 * useState được lưu vào sessionStorage (theo tab trình duyệt):
 * chuyển trang rồi quay lại form vẫn giữ nguyên dữ liệu đã nhập.
 */
export function useSessionState<T>(key: string, initial: T) {
  const storageKey = `peak-tools.form.${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [storageKey, value]);

  return [value, setValue] as const;
}
