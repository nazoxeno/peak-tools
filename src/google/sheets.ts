/**
 * Helper cho Google Sheets API v4.
 * Nguyên tắc: dựng nhiều Request rồi gửi MỘT lần qua batchUpdate
 * (Sheets giới hạn ~60 lần ghi/phút/người dùng).
 *
 * Ví dụ:
 *   await batchUpdate(spreadsheetId, [
 *     resizeColumns(sheetId, 0, 3, 150),
 *     setBackground({ sheetId, startRowIndex: 0, endRowIndex: 1 }, '#fce8b2'),
 *     ...dropdownWithColors({ sheetId, startColumnIndex: 2, endColumnIndex: 3 }, config.statusColors),
 *   ]);
 */
import { googleFetch } from './client';

export type SheetRequest = gapi.client.sheets.Request;
export type GridRange = gapi.client.sheets.GridRange;
export type Color = gapi.client.sheets.Color;

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export function getSpreadsheet(spreadsheetId: string) {
  return googleFetch<gapi.client.sheets.Spreadsheet>(`${API}/${spreadsheetId}`, {
    query: { fields: 'spreadsheetId,properties.title,sheets.properties' },
  });
}

export function batchUpdate(spreadsheetId: string, requests: SheetRequest[]) {
  return googleFetch<gapi.client.sheets.BatchUpdateSpreadsheetResponse>(`${API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: { requests },
  });
}

export function createSpreadsheet(title: string, sheetTitles: string[]) {
  return googleFetch<gapi.client.sheets.Spreadsheet>(API, {
    method: 'POST',
    body: {
      properties: { title },
      sheets: sheetTitles.map((t) => ({ properties: { title: t, gridProperties: { frozenRowCount: 1 } } })),
    },
  });
}

/** Đọc nhiều range một lần. Trả về mảng values theo đúng thứ tự ranges. */
export async function batchGetValues(spreadsheetId: string, ranges: string[]): Promise<string[][][]> {
  const res = await googleFetch<gapi.client.sheets.BatchGetValuesResponse>(`${API}/${spreadsheetId}/values:batchGet`, {
    query: { ranges, valueRenderOption: 'FORMATTED_VALUE' },
  });
  return (res.valueRanges ?? []).map((vr) => (vr.values ?? []) as string[][]);
}

/** Ghi nhiều range một lần (USER_ENTERED). */
export function updateValuesBatch(spreadsheetId: string, data: { range: string; values: unknown[][] }[]) {
  return googleFetch(`${API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: { valueInputOption: 'USER_ENTERED', data },
  });
}

/** Ghi giá trị/công thức (USER_ENTERED để công thức được tính). A1 notation, vd "Sheet1!B2". */
export function updateValues(spreadsheetId: string, range: string, values: unknown[][]) {
  return googleFetch(`${API}/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
    method: 'PUT',
    query: { valueInputOption: 'USER_ENTERED' },
    body: { range, values },
  });
}

// ---------- Request builders ----------

export function hexToColor(hex: string): Color {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function resizeDimension(dimension: 'ROWS' | 'COLUMNS', sheetId: number, start: number, end: number, px: number): SheetRequest {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension, startIndex: start, endIndex: end },
      properties: { pixelSize: px },
      fields: 'pixelSize',
    },
  };
}

/** Index bắt đầu từ 0, end không bao gồm. */
export const resizeRows = (sheetId: number, start: number, end: number, px: number) =>
  resizeDimension('ROWS', sheetId, start, end, px);
export const resizeColumns = (sheetId: number, start: number, end: number, px: number) =>
  resizeDimension('COLUMNS', sheetId, start, end, px);

export function setBackground(range: GridRange, hex: string): SheetRequest {
  return {
    repeatCell: {
      range,
      cell: { userEnteredFormat: { backgroundColor: hexToColor(hex) } },
      fields: 'userEnteredFormat.backgroundColor',
    },
  };
}

/** Dropdown + tô màu theo giá trị (port từ applyDropdownColors của bản Apps Script). */
export function dropdownWithColors(range: GridRange, colors: Record<string, string>): SheetRequest[] {
  const values = Object.keys(colors);
  return [
    {
      setDataValidation: {
        range,
        rule: {
          condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) },
          showCustomUi: true,
          strict: true,
        },
      },
    },
    ...values.map<SheetRequest>((text, index) => ({
      addConditionalFormatRule: {
        index,
        rule: {
          ranges: [range],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: text }] },
            format: { backgroundColor: hexToColor(colors[text]) },
          },
        },
      },
    })),
  ];
}

/**
 * Sheets API không hỗ trợ chèn ảnh nhúng vào ô.
 * Cách thay thế: công thức IMAGE() trỏ tới ảnh trên Drive (file phải share "Anyone with the link").
 */
export function driveImageFormula(fileId: string, width = 1000) {
  return `=IMAGE("https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}")`;
}
