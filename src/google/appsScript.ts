/**
 * Gọi hàm trong PEAK Tools Engine (Apps Script) qua Apps Script API — scripts.run.
 * Hàm chạy bằng tài khoản người dùng (token hiện tại), tối đa 6 phút / lần gọi.
 */
import { googleFetch, GoogleApiError } from './client';

type RunResponse<T> = {
  done?: boolean;
  response?: { result?: T };
  error?: {
    code?: number;
    message?: string;
    details?: { errorMessage?: string; errorType?: string; scriptStackTraceElements?: { function?: string; lineNumber?: number }[] }[];
  };
};

export class EngineError extends Error {}

export async function runEngine<T>(scriptId: string, fn: string, param: unknown): Promise<T> {
  if (!scriptId) {
    throw new EngineError('Chưa cấu hình Engine Script ID (key "engine.scriptId" trong Sheet cấu hình).');
  }

  let res: RunResponse<T>;
  try {
    res = await googleFetch<RunResponse<T>>(`https://script.googleapis.com/v1/scripts/${scriptId}:run`, {
      method: 'POST',
      body: { function: fn, parameters: [param], devMode: false },
    });
  } catch (e) {
    throw new EngineError(explain(e));
  }

  if (res.error) {
    const d = res.error.details?.[0];
    const where = d?.scriptStackTraceElements?.[0];
    throw new EngineError(
      `Engine lỗi: ${d?.errorMessage ?? res.error.message ?? 'không rõ'}` +
        (where?.function ? ` (tại ${where.function}:${where.lineNumber})` : ''),
    );
  }
  return res.response?.result as T;
}

/** Dịch các lỗi cấu hình thường gặp sang hướng dẫn dễ hiểu. */
function explain(e: unknown): string {
  const msg = (e as Error).message ?? String(e);
  if (/has not enabled the Apps Script API/i.test(msg)) {
    return 'Tài khoản của bạn chưa bật Google Apps Script API. Vào https://script.google.com/home/usersettings → bật "Google Apps Script API", rồi thử lại.';
  }
  if (/Apps Script API has not been used|is disabled/i.test(msg)) {
    return 'Google Cloud project chưa bật "Apps Script API" (APIs & Services → Library).';
  }
  if (e instanceof GoogleApiError && e.status === 404) {
    return 'Không tìm thấy Engine. Kiểm tra lại engine.scriptId và deployment "API Executable".';
  }
  if (e instanceof GoogleApiError && e.status === 403) {
    return `Không có quyền chạy Engine (${msg}). Kiểm tra: deployment API Executable "Anyone within domain", Apps Script dùng chung Cloud project với web, và đăng nhập lại để cấp đủ quyền.`;
  }
  return msg;
}
