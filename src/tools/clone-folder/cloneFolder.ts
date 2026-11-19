import type { AppConfig } from '../../app-config/schema';
import {
  addPermission,
  copyFile,
  createFolder,
  getFile,
  isFolder,
  listChildren,
  sortByName,
  transferOwnership,
  type DriveFile,
} from '../../google/drive';
import { mapLimit } from '../../lib/concurrency';
import { isCancelled, type TaskContext } from '../../lib/taskStore';

type CloneConfig = AppConfig['clone'];

/** Số file copy song song (Drive giới hạn tốc độ ghi; lỗi 429 đã được tự retry). */
const COPY_CONCURRENCY = 4;

export type CloneInput = {
  config: CloneConfig;
  gameId: string;
  gameName: string;
  sourceFolderId: string;
  targetParentId: string;
};

export type CloneResult = {
  url: string;
  files: number;
  folders: number;
  /** Đường dẫn các file/folder copy lỗi */
  failed: { path: string; error: string }[];
};

type Stats = Omit<CloneResult, 'url'>;

/** Thay gameName rồi gameId của template bằng giá trị mới. */
export function renameFromTemplate(name: string, template: CloneConfig['template'], gameId: string, gameName: string) {
  return name.split(template.gameName).join(gameName).split(template.gameId).join(gameId);
}

export async function cloneFolder(input: CloneInput, ctx: TaskContext): Promise<CloneResult> {
  const { log } = ctx;
  const { template } = input.config;
  log.info('▶️ STARTING CLONE PROCESS...');

  const source = await getFile(input.sourceFolderId);
  const rootName = renameFromTemplate(source.name!, template, input.gameId, input.gameName);
  const root = await createFolder(rootName, input.targetParentId);

  log.info(`-> Replace '${template.gameId}' → '${input.gameId}', '${template.gameName}' → '${input.gameName}'`);
  log.info(`📁 Created root: ${rootName}`);

  const stats: Stats = { files: 0, folders: 1, failed: [] };
  await applyFolderSettings(root, input, ctx);
  await copyRecursive(source.id!, root.id!, rootName, input, ctx, stats);

  if (stats.failed.length) {
    log.warn(`⚠️ CLONE XONG NHƯNG CÓ ${stats.failed.length} MỤC LỖI — ${stats.folders} folder, ${stats.files} file.`);
  } else {
    log.success(`✅ CLONE COMPLETED — ${stats.folders} folder(s), ${stats.files} file(s).`);
  }
  return { url: root.webViewLink!, ...stats };
}

async function copyRecursive(
  sourceId: string,
  targetId: string,
  path: string,
  input: CloneInput,
  ctx: TaskContext,
  stats: Stats,
) {
  const children = (await listChildren(sourceId, 'id,name,mimeType')).sort(sortByName);
  const rename = (name: string) => renameFromTemplate(name, input.config.template, input.gameId, input.gameName);

  // 1. File: copy song song, file lỗi thì ghi lại rồi làm tiếp
  await mapLimit(
    children.filter((c) => !isFolder(c)),
    COPY_CONCURRENCY,
    async (file) => {
      ctx.checkCancelled();
      const name = rename(file.name!);
      try {
        const copied = await copyFile(file.id!, name, targetId);
        await changeOwnerSafely(copied, input, ctx);
        stats.files++;
        ctx.log.info(`  + Copied file: ${name}`);
      } catch (e) {
        if (isCancelled(e)) throw e;
        stats.failed.push({ path: `${path}/${name}`, error: (e as Error).message });
        ctx.log.error(`  ✗ Lỗi copy ${name}: ${(e as Error).message}`);
      }
    },
  );

  // 2. Folder con: tạo tuần tự (giữ đúng thứ tự), lỗi thì bỏ qua cả nhánh đó
  for (const sub of children.filter(isFolder)) {
    ctx.checkCancelled();
    const name = rename(sub.name!);
    let created: DriveFile;
    try {
      created = await createFolder(name, targetId);
    } catch (e) {
      stats.failed.push({ path: `${path}/${name}/`, error: (e as Error).message });
      ctx.log.error(` ✗ Lỗi tạo folder ${name} (bỏ qua cả folder này): ${(e as Error).message}`);
      continue;
    }
    stats.folders++;
    ctx.log.info(` -> Created folder: ${name}`);
    await applyFolderSettings(created, input, ctx);
    await copyRecursive(sub.id!, created.id!, `${path}/${name}`, input, ctx, stats);
  }
}

async function applyFolderSettings(folder: DriveFile, input: CloneInput, ctx: TaskContext) {
  for (const perm of input.config.permissions) {
    if (folder.name !== `${input.gameId}-${input.gameName}${perm.suffix}`) continue;
    for (const email of perm.emails) {
      try {
        await addPermission(folder.id!, email, 'writer');
        ctx.log.info(`   [+] Granted Edit (${perm.suffix}): ${email}`);
      } catch (e) {
        ctx.log.warn(`   [!] Permission error (${email}): ${(e as Error).message}`);
      }
    }
  }
  await changeOwnerSafely(folder, input, ctx);
}

async function changeOwnerSafely(item: DriveFile, input: CloneInput, ctx: TaskContext) {
  const email = input.config.newOwnerEmail.trim();
  if (!email) return;
  try {
    await transferOwnership(item.id!, email);
  } catch (e) {
    ctx.log.warn(`   [!] Owner transfer error for ${item.name}: ${(e as Error).message}`);
  }
}
