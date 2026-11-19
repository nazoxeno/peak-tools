import type { AppConfig } from '../../app-config/schema';
import { runEngine } from '../../google/appsScript';
import { isFolder, listChildren, sortByName } from '../../google/drive';
import type { TaskContext } from '../../lib/useTask';
import { pipeEngineLogs } from '../engineLogs';

type AnimState = { currentRow: number; countNo: number; folderHeaderRows: number[] };

/** Số dòng xử lý mỗi lần gọi Engine khi chèn ảnh Demo (tránh vượt 6 phút). */
const DEMO_BATCH = 25;

export type AnimInput = {
  spreadsheetId: string;
  animFolderId: string | null;
  demoFolderId: string | null;
  insertInCell: boolean;
  config: AppConfig;
};

export async function runAnimChecklist(input: AnimInput, ctx: TaskContext) {
  const { log } = ctx;
  const { config, spreadsheetId } = input;
  const engine = <T,>(fn: string, param: object) => runEngine<T>(config.engine.scriptId, fn, param);
  let rows = 0;
  let demoMatched = 0;

  if (input.animFolderId) {
    const roots = (await listChildren(input.animFolderId, 'id,name,mimeType'))
      .filter((f) => isFolder(f) && !f.name!.toLowerCase().includes('demo'))
      .sort(sortByName);

    log.info(`▶️ Quét ${roots.length} folder animation...`);
    let state = await engine<AnimState>('animPrepare', { spreadsheetId });
    log.info('   Đã làm mới tab Anim_Source');

    for (const [i, root] of roots.entries()) {
      ctx.checkCancelled();
      log.info(`[${i + 1}/${roots.length}] ${root.name}`);
      const res = await engine<{ state: AnimState; logs: string[] }>('animProcessRootFolder', {
        spreadsheetId,
        folderId: root.id,
        state,
      });
      state = res.state;
      pipeEngineLogs(res.logs, log);
    }

    log.info('🎨 Định dạng sheet...');
    await engine('animFinalize', {
      spreadsheetId,
      state,
      typeColors: config.typeColors,
      statusColors: config.statusColors,
    });
    rows = state.countNo - 1;
    log.success(`   ✅ ${rows} dòng animation`);
  }

  if (input.demoFolderId) {
    const { lastRow } = await engine<{ lastRow: number }>('animSheetInfo', { spreadsheetId });
    log.info(`▶️ Chèn ảnh Demo (${input.insertInCell ? 'in-cell' : 'ảnh nổi'}) cho ${Math.max(0, lastRow - 1)} dòng...`);

    for (let start = 2; start <= lastRow; start += DEMO_BATCH) {
      ctx.checkCancelled();
      const end = Math.min(lastRow, start + DEMO_BATCH - 1);
      const res = await engine<{ matched: number; logs: string[] }>('animUpdateDemo', {
        spreadsheetId,
        demoFolderId: input.demoFolderId,
        insertInCell: input.insertInCell,
        startRow: start,
        endRow: end,
      });
      demoMatched += res.matched;
      pipeEngineLogs(res.logs, log);
      log.info(`   Dòng ${start}–${end}: ${res.matched} ảnh`);
    }
    log.success(`   ✅ Đã chèn ${demoMatched} ảnh demo`);
  }

  log.success('✅ HOÀN TẤT');
  return { rows, demoMatched };
}
