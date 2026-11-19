import { useCallback, useRef, useState } from 'react';

export type LogLevel = 'info' | 'success' | 'warn' | 'error';
export type LogEntry = { id: number; time: Date; level: LogLevel; message: string };

export type Logger = {
  info: (msg: string) => void;
  success: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

/** Ném ra khi người dùng bấm Dừng; tool kiểm tra bằng `ctx.checkCancelled()`. */
export class CancelledError extends Error {
  constructor() {
    super('Đã dừng theo yêu cầu.');
  }
}

export type TaskContext = { log: Logger; checkCancelled: () => void };

/**
 * Chạy 1 tác vụ dài có live log + nút dừng.
 *
 *   const task = useTask();
 *   task.run(async ({ log, checkCancelled }) => { ... });
 */
export function useTask() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);
  const nextId = useRef(0);

  const push = useCallback((level: LogLevel, message: string) => {
    const entry = { id: nextId.current++, time: new Date(), level, message };
    setLogs((prev) => [...prev, entry]);
  }, []);

  const run = useCallback(
    async <T,>(fn: (ctx: TaskContext) => Promise<T>): Promise<T | undefined> => {
      cancelled.current = false;
      setLogs([]);
      setRunning(true);
      const ctx: TaskContext = {
        log: {
          info: (m) => push('info', m),
          success: (m) => push('success', m),
          warn: (m) => push('warn', m),
          error: (m) => push('error', m),
        },
        checkCancelled: () => {
          if (cancelled.current) throw new CancelledError();
        },
      };
      try {
        return await fn(ctx);
      } catch (e) {
        if (e instanceof CancelledError) push('warn', `⏹ ${e.message}`);
        else push('error', `❌ ${(e as Error).message}`);
        return undefined;
      } finally {
        setRunning(false);
      }
    },
    [push],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);

  const clear = useCallback(() => setLogs([]), []);

  return { logs, running, run, cancel, clear };
}
