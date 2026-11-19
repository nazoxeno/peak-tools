import type { AppConfig } from '../../app-config/schema';
import { runEngine } from '../../google/appsScript';
import { getFile, isFolder, listChildren, sortByName } from '../../google/drive';
import type { TaskContext } from '../../lib/useTask';
import { pipeEngineLogs } from '../engineLogs';

export type ArtTab = {
  folderId: string;
  /** Tên folder gốc trên Drive */
  originalName: string;
  /** Tên tab trong Sheet (bỏ tiền tố số "01_") */
  sheetName: string;
  isPSD: boolean;
};

/** Danh sách tab = các folder con của folder UI (+ Art_Source nếu có). */
export async function listArtTabs(uiFolderId: string | null, artSourceId: string | null): Promise<ArtTab[]> {
  const tabs: ArtTab[] = [];

  if (uiFolderId) {
    const children = (await listChildren(uiFolderId, 'id,name,mimeType')).filter(isFolder).sort(sortByName);
    for (const f of children) {
      tabs.push({ folderId: f.id!, originalName: f.name!, sheetName: f.name!.replace(/^\d+_/, ''), isPSD: false });
    }
  }

  if (artSourceId) {
    await getFile(artSourceId, 'id'); // kiểm tra quyền truy cập
    tabs.unshift({ folderId: artSourceId, originalName: 'Art_Source', sheetName: 'Art_Source', isPSD: true });
  }

  if (tabs.length === 0) throw new Error('Không có sub-folder (tab) nào trong thư mục này.');
  return tabs;
}

export async function runArtChecklist(
  input: { spreadsheetId: string; tabs: ArtTab[]; config: AppConfig },
  ctx: TaskContext,
) {
  const { log } = ctx;
  const { config } = input;
  let ok = 0;
  let failed = 0;

  log.info(`▶️ Cập nhật ${input.tabs.length} tab...`);

  for (const [i, tab] of input.tabs.entries()) {
    ctx.checkCancelled();
    log.info(`[${i + 1}/${input.tabs.length}] Tab "${tab.sheetName}"${tab.isPSD ? ' (PSD)' : ''}`);
    try {
      const res = await runEngine<{ rows: number; logs: string[] }>(config.engine.scriptId, 'artProcessFolder', {
        spreadsheetId: input.spreadsheetId,
        folderId: tab.folderId,
        sheetName: tab.sheetName,
        isPSD: tab.isPSD,
        typeColors: config.typeColors,
        statusColors: config.statusColors,
      });
      pipeEngineLogs(res.logs, log);
      log.success(`   ✅ ${res.rows} dòng`);
      ok++;
    } catch (e) {
      log.error(`   ❌ ${(e as Error).message}`);
      failed++;
    }
  }

  log.success(`✅ HOÀN TẤT — ${ok} tab thành công, ${failed} tab lỗi.`);
  return { ok, failed };
}
