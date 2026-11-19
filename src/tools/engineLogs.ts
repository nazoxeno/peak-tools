import type { Logger } from '../lib/taskStore';

/** Đẩy log trả về từ Engine vào live log (dòng bắt đầu bằng ⚠️ là cảnh báo). */
export function pipeEngineLogs(lines: string[] | undefined, log: Logger, indent = '   ') {
  for (const line of lines ?? []) {
    if (line.startsWith('⚠️')) log.warn(indent + line);
    else log.info(indent + line);
  }
}
