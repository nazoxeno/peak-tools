import { GoogleApiError } from '../google/client';
import { addDomainPermission } from '../google/drive';
import { batchGetValues, createSpreadsheet, getSpreadsheet, updateValuesBatch } from '../google/sheets';
import { DEFAULT_CONFIG, SETTING_KEYS, TABS, type AppConfig, type SettingKey } from './schema';

export class ConfigError extends Error {
  kind: 'notConfigured' | 'noAccess' | 'other';
  constructor(kind: ConfigError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

const splitEmails = (s: string) =>
  s
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);

const rowsToMap = (rows: string[][]) =>
  Object.fromEntries(rows.filter((r) => r[0]?.trim() && r[1]?.trim()).map((r) => [r[0].trim(), r[1].trim()]));

/** Đọc cấu hình từ Sheet. Tab nào thiếu → dùng giá trị mặc định. */
export async function loadConfigFromSheet(sheetId: string): Promise<AppConfig> {
  if (!sheetId) {
    throw new ConfigError('notConfigured', 'Chưa cấu hình VITE_CONFIG_SHEET_ID.');
  }

  let tabNames: Set<string>;
  try {
    const meta = await getSpreadsheet(sheetId);
    tabNames = new Set((meta.sheets ?? []).map((s) => s.properties?.title ?? ''));
  } catch (e) {
    if (e instanceof GoogleApiError && (e.status === 403 || e.status === 404)) {
      throw new ConfigError('noAccess', 'Bạn chưa được cấp quyền xem Google Sheet cấu hình.');
    }
    throw new ConfigError('other', `Không đọc được Sheet cấu hình: ${(e as Error).message}`);
  }

  const wanted = Object.values(TABS).filter((t) => tabNames.has(t));
  const ranges = wanted.map((t) => `'${t}'!A2:C`);
  const values = ranges.length ? await batchGetValues(sheetId, ranges) : [];
  const tab = (name: string) => values[wanted.indexOf(name as (typeof wanted)[number])] ?? [];

  const settings = rowsToMap(tab(TABS.settings)) as Partial<Record<SettingKey, string>>;
  const d = DEFAULT_CONFIG;

  return {
    clone: {
      template: {
        gameId: settings['clone.template.gameId'] ?? d.clone.template.gameId,
        gameName: settings['clone.template.gameName'] ?? d.clone.template.gameName,
      },
      newOwnerEmail: settings['clone.newOwnerEmail'] ?? '',
      permissions: tab(TABS.clonePermissions)
        .filter((r) => r[0]?.trim())
        .map((r) => ({ suffix: r[0].trim(), emails: splitEmails(r[1] ?? '') }))
        .filter((p) => p.emails.length > 0),
    },
    changeOwner: { defaultEmail: settings['changeOwner.defaultEmail'] ?? '' },
    typeColors: tabNames.has(TABS.typeColors) ? rowsToMap(tab(TABS.typeColors)) : d.typeColors,
    statusColors: tabNames.has(TABS.statusColors) ? rowsToMap(tab(TABS.statusColors)) : d.statusColors,
  };
}

/**
 * Tạo Sheet cấu hình mẫu trong Drive của người dùng.
 * Nếu có `shareDomain`, Sheet được chia sẻ quyền xem cho cả domain.
 */
export async function createConfigTemplate(shareDomain?: string) {
  const d = DEFAULT_CONFIG;
  const sheet = await createSpreadsheet('PEAK Tools – Config', Object.values(TABS));

  await updateValuesBatch(sheet.spreadsheetId!, [
    {
      range: `'${TABS.settings}'!A1`,
      values: [
        ['key', 'value', 'ghi chú'],
        // Dấu ' ở đầu để Sheets giữ dạng text ("0000" không bị thành số 0)
        ['clone.template.gameId', `'${d.clone.template.gameId}`, SETTING_KEYS['clone.template.gameId']],
        ['clone.template.gameName', d.clone.template.gameName, SETTING_KEYS['clone.template.gameName']],
        ['clone.newOwnerEmail', '', SETTING_KEYS['clone.newOwnerEmail']],
        ['changeOwner.defaultEmail', '', SETTING_KEYS['changeOwner.defaultEmail']],
      ],
    },
    {
      range: `'${TABS.clonePermissions}'!A1`,
      values: [
        ['suffix', 'emails', 'ghi chú'],
        ['-01-Document', '', 'Nhiều email: phân tách bằng dấu phẩy'],
        ['-02-Design', '', ''],
        ['-04-Sound', '', ''],
      ],
    },
    {
      range: `'${TABS.typeColors}'!A1`,
      values: [['giá trị', 'màu'], ...Object.entries(d.typeColors)],
    },
    {
      range: `'${TABS.statusColors}'!A1`,
      values: [['giá trị', 'màu'], ...Object.entries(d.statusColors)],
    },
  ]);

  if (shareDomain) {
    await addDomainPermission(sheet.spreadsheetId!, shareDomain, 'reader');
  }

  return { id: sheet.spreadsheetId!, url: sheet.spreadsheetUrl! };
}
