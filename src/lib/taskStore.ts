/**
 * Store tác vụ dùng chung cho cả app (không phụ thuộc trang đang mở):
 * chuyển trang rồi quay lại vẫn thấy log/tiến độ/kết quả và vẫn bấm Dừng được.
 *
 *   const task = useTask<Result>(tool.id);
 *   task.run(async ({ log, checkCancelled }) => { ...; return result; });
 *   task.result // kết quả lần chạy gần nhất
 */
import { useCallback, useSyncExternalStore } from 'react';

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

export const isCancelled = (e: unknown) => e instanceof CancelledError;

export type TaskContext = { log: Logger; checkCancelled: () => void };

type TaskState = {
  logs: LogEntry[];
  running: boolean;
  result: unknown;
};

const EMPTY: TaskState = { logs: [], running: false, result: undefined };
/** Giữ tối đa bấy nhiêu dòng log mỗi tác vụ */
const MAX_LOGS = 5000;

const tasks = new Map<string, TaskState>();
const cancelFlags = new Map<string, boolean>();
const listeners = new Set<() => void>();
let runningSnapshot: string[] = [];
let nextLogId = 0;

function emit() {
  runningSnapshot = [...tasks.entries()].filter(([, t]) => t.running).map(([id]) => id);
  listeners.forEach((l) => l());
}

function update(id: string, patch: Partial<TaskState> | ((t: TaskState) => Partial<TaskState>)) {
  const prev = tasks.get(id) ?? EMPTY;
  const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
  tasks.set(id, next);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function pushLog(id: string, level: LogLevel, message: string) {
  const entry = { id: nextLogId++, time: new Date(), level, message };
  update(id, (t) => ({ logs: t.logs.length >= MAX_LOGS ? [...t.logs.slice(-MAX_LOGS + 1), entry] : [...t.logs, entry] }));
}

async function runTask<T>(id: string, fn: (ctx: TaskContext) => Promise<T>): Promise<T | undefined> {
  if (tasks.get(id)?.running) return undefined;
  cancelFlags.set(id, false);
  update(id, { logs: [], running: true, result: undefined });

  const ctx: TaskContext = {
    log: {
      info: (m) => pushLog(id, 'info', m),
      success: (m) => pushLog(id, 'success', m),
      warn: (m) => pushLog(id, 'warn', m),
      error: (m) => pushLog(id, 'error', m),
    },
    checkCancelled: () => {
      if (cancelFlags.get(id)) throw new CancelledError();
    },
  };

  try {
    const result = await fn(ctx);
    update(id, { result });
    return result;
  } catch (e) {
    if (isCancelled(e)) pushLog(id, 'warn', `⏹ ${(e as Error).message}`);
    else pushLog(id, 'error', `❌ ${(e as Error).message}`);
    return undefined;
  } finally {
    update(id, { running: false });
  }
}

export function useTask<T = unknown>(id: string) {
  const state = useSyncExternalStore(subscribe, () => tasks.get(id) ?? EMPTY);
  const run = useCallback((fn: (ctx: TaskContext) => Promise<T>) => runTask(id, fn), [id]);
  const cancel = useCallback(() => {
    cancelFlags.set(id, true);
    pushLog(id, 'warn', '⏳ Đang dừng — chờ bước hiện tại xong...');
  }, [id]);
  const clearResult = useCallback(() => update(id, { result: undefined }), [id]);

  return {
    logs: state.logs,
    running: state.running,
    result: state.result as T | undefined,
    run,
    cancel,
    clearResult,
  };
}

/** Danh sách id tác vụ đang chạy (cho sidebar, cảnh báo khi đóng tab...). */
export function useRunningTasks(): string[] {
  return useSyncExternalStore(subscribe, () => runningSnapshot);
}
