/** Ghi nhớ các tool mở gần đây (theo trình duyệt) để hiện ở trang chủ. */
const KEY = 'peak-tools.recent';
const MAX = 6;

export function getRecentTools(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markToolUsed(id: string) {
  try {
    const next = [id, ...getRecentTools().filter((x) => x !== id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* localStorage bị chặn → bỏ qua */
  }
}
