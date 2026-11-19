import { ENV } from '../../env';
import { batchGetValues } from '../../google/sheets';

/** Tab trong Sheet cấu hình (do script scripts/game-check ghi/đọc). */
export const GAME_TAB = 'game_id';
export const TOKEN_TAB = 'token';

export type Game = { id: string; name: string; status: string; active: boolean };
export type GameCredentials = { userId: string; token: string } | null;

/** Status do script game-check ghi: "✅ Hoạt động" / "❌ Không hoạt động (...)" / "⚠️ Lỗi kết nối (...)" */
const isActive = (status: string) => status.trim().startsWith('✅');

/**
 * Đọc tab game_id (A id | B name | C status) + token của người đang đăng nhập (tab token: A email | B user_id | C token).
 */
export async function loadGames(email: string): Promise<{ games: Game[]; credentials: GameCredentials }> {
  let gameRows: string[][];
  let tokenRows: string[][];
  try {
    [gameRows, tokenRows] = await batchGetValues(ENV.configSheetId, [`'${GAME_TAB}'!A2:C`, `'${TOKEN_TAB}'!A2:C`]);
  } catch (e) {
    const msg = (e as Error).message;
    if (/Unable to parse range/i.test(msg)) {
      throw new Error(`Sheet cấu hình chưa có tab "${GAME_TAB}" hoặc "${TOKEN_TAB}".`);
    }
    throw e;
  }

  const games = gameRows
    .map((r) => ({ id: String(r[0] ?? '').trim(), name: String(r[1] ?? '').trim(), status: String(r[2] ?? '').trim() }))
    .filter((g) => g.id)
    .map((g) => ({ ...g, active: isActive(g.status) }));

  const row = tokenRows.find((r) => String(r[0] ?? '').trim().toLowerCase() === email.toLowerCase());
  const credentials = row ? { userId: String(row[1] ?? '').trim(), token: String(row[2] ?? '').trim() } : null;

  return { games, credentials };
}

/** "4:kts,5:gss" → { 4: 'kts', 5: 'gss' } */
export function parsePrefixes(text: string): Record<number, string> {
  return Object.fromEntries(
    text
      .split(',')
      .map((p) => p.split(':').map((x) => x.trim()))
      .filter(([len, prefix]) => /^\d+$/.test(len) && prefix !== undefined)
      .map(([len, prefix]) => [Number(len), prefix]),
  );
}

/** Ghép URL mở game từ mẫu: {prefix} (theo số chữ số của ID), {id}, {token}, {user_id}. */
export function buildGameUrl(
  template: string,
  id: string,
  credentials: GameCredentials,
  prefixes: Record<number, string> = {},
) {
  return template
    .replaceAll('{prefix}', encodeURIComponent(prefixes[id.length] ?? ''))
    .replaceAll('{id}', encodeURIComponent(id))
    .replaceAll('{token}', encodeURIComponent(credentials?.token ?? ''))
    .replaceAll('{user_id}', encodeURIComponent(credentials?.userId ?? ''));
}

export const needsToken = (template: string) => /\{(token|user_id)\}/.test(template);
