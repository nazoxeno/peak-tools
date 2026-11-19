import type { AppConfig } from '../../app-config/schema';
import { runEngine } from '../../google/appsScript';
import { getFile, isFolder, listChildren, sortByName } from '../../google/drive';
import { isCancelled, type TaskContext } from '../../lib/taskStore';
import { pipeEngineLogs } from '../engineLogs';

export type ArtTab = {
  folderId: string;
  /** Tên folder gốc trên Drive */
  originalName: string;
  /** Tên tab trong Sheet (bỏ tiền tố số "01_") */
  sheetName: string;
  isPSD: boolean;
};

/** Số file mỗi lần gọi Engine — giữ mỗi lần chạy < 6 phút. Ảnh tốn thời gian hơn PSD nhiều. */
const IMAGES_PER_CALL = 20;
const PSD_PER_CALL = 200;

type ArtState = { currentRowIndex: number; globalCount: number; folderHeaderRows: number[] };
type Dir = { folderId: string; name: string; count: number };

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

/**
 * Quét cây thư mục của 1 tab theo đúng thứ tự Engine ghi ra Sheet:
 * file của folder hiện tại trước, rồi lần lượt các folder con (sắp xếp theo tên).
 */
async function scanTab(tab: ArtTab, ctx: TaskContext) {
  const dirs: Dir[] = [];

  const visit = async (folderId: string, name: string) => {
    ctx.checkCancelled();
    const children = await listChildren(folderId, 'id,name,mimeType');
    const files = children.filter((c) => !isFolder(c));
    const count = tab.isPSD ? files.length : files.filter((f) => f.mimeType?.startsWith('image/')).length;
    dirs.push({ folderId, name, count });
    for (const sub of children.filter(isFolder).sort(sortByName)) await visit(sub.id!, sub.name!);
  };

  await visit(tab.folderId, tab.sheetName);
  return { dirs, hasSubFolders: dirs.length > 1 };
}

export async function runArtChecklist(
  input: { spreadsheetId: string; tabs: ArtTab[]; config: AppConfig },
  ctx: TaskContext,
) {
  const { log } = ctx;
  const { config, spreadsheetId } = input;
  const engine = <T,>(fn: string, param: object) => runEngine<T>(config.engine.scriptId, fn, param);
  let ok = 0;
  let failed = 0;

  log.info(`▶️ Cập nhật ${input.tabs.length} tab...`);

  for (const [i, tab] of input.tabs.entries()) {
    ctx.checkCancelled();
    log.info(`[${i + 1}/${input.tabs.length}] Tab "${tab.sheetName}"${tab.isPSD ? ' (PSD)' : ''}`);

    const tabParam = { spreadsheetId, sheetName: tab.sheetName, isPSD: tab.isPSD };
    let state: ArtState | null = null;
    let cancelError: unknown = null;

    try {
      const { dirs, hasSubFolders } = await scanTab(tab, ctx);
      const total = dirs.reduce((n, d) => n + d.count, 0);
      log.info(`   ${dirs.length} folder · ${total} file`);

      state = await engine<ArtState>('artPrepareTab', tabParam);
      const perCall = tab.isPSD ? PSD_PER_CALL : IMAGES_PER_CALL;
      let done = 0;

      for (const dir of dirs) {
        for (let start = 0; start < dir.count; start += perCall) {
          ctx.checkCancelled();
          const res: { state: ArtState; logs: string[] } = await engine('artProcessDir', {
            ...tabParam,
            folderId: dir.folderId,
            start,
            limit: perCall,
            withFolderHeader: hasSubFolders,
            state,
          });
          state = res.state;
          pipeEngineLogs(res.logs, log);
          done += Math.min(perCall, dir.count - start);
          log.info(`   📁 ${dir.name} — ${done}/${total}`);
        }
      }
      ok++;
    } catch (e) {
      if (isCancelled(e)) {
        cancelError = e;
      } else {
        log.error(`   ❌ ${(e as Error).message}`);
        failed++;
      }
    }

    // Luôn định dạng phần đã ghi — kể cả khi lỗi hoặc bị dừng giữa chừng
    const finalState = state as ArtState | null;
    if (finalState && finalState.currentRowIndex > 2) {
      try {
        log.info('   🎨 Định dạng tab...');
        await engine('artFinalizeTab', {
          ...tabParam,
          state: finalState,
          typeColors: config.typeColors,
          statusColors: config.statusColors,
        });
        log.success(`   ✅ ${finalState.globalCount - 1} dòng`);
      } catch (e) {
        log.warn(`   ⚠️ Không định dạng được tab: ${(e as Error).message}`);
      }
    }
    if (cancelError) throw cancelError;
  }

  log.success(`✅ HOÀN TẤT — ${ok} tab thành công, ${failed} tab lỗi.`);
  return { ok, failed };
}
