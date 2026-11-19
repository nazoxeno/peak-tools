/**
 * Chạy `fn` cho từng phần tử với tối đa `limit` tác vụ song song.
 * Nếu một lần gọi ném lỗi (vd người dùng bấm Dừng): các luồng khác không nhận việc mới,
 * chờ việc đang làm xong, rồi ném lại lỗi đầu tiên.
 */
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>) {
  let next = 0;
  let firstError: unknown = null;

  const worker = async () => {
    while (firstError === null && next < items.length) {
      const i = next++;
      try {
        await fn(items[i], i);
      } catch (e) {
        firstError ??= e;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (firstError !== null) throw firstError;
}
