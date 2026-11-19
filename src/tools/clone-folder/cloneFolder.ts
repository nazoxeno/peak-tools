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
import type { TaskContext } from '../../lib/taskStore';

type CloneConfig = AppConfig['clone'];

export type CloneInput = {
  config: CloneConfig;
  gameId: string;
  gameName: string;
  sourceFolderId: string;
  targetParentId: string;
};

/** Thay gameName rồi gameId của template bằng giá trị mới. */
export function renameFromTemplate(name: string, template: CloneConfig['template'], gameId: string, gameName: string) {
  return name.split(template.gameName).join(gameName).split(template.gameId).join(gameId);
}

export async function cloneFolder(input: CloneInput, ctx: TaskContext) {
  const { log } = ctx;
  log.info('▶️ STARTING CLONE PROCESS...');

  const source = await getFile(input.sourceFolderId);
  const rootName = renameFromTemplate(source.name!, input.config.template, input.gameId, input.gameName);
  const root = await createFolder(rootName, input.targetParentId);

  const { template } = input.config;
  log.info(`-> Replace '${template.gameId}' → '${input.gameId}', '${template.gameName}' → '${input.gameName}'`);
  log.info(`📁 Created root: ${rootName}`);

  const stats = { files: 0, folders: 1 };
  await applyFolderSettings(root, input, ctx);
  await copyRecursive(source.id!, root.id!, input, ctx, stats);

  log.success(`✅ CLONE COMPLETED — ${stats.folders} folder(s), ${stats.files} file(s).`);
  return { url: root.webViewLink!, ...stats };
}

async function copyRecursive(
  sourceId: string,
  targetId: string,
  input: CloneInput,
  ctx: TaskContext,
  stats: { files: number; folders: number },
) {
  const children = (await listChildren(sourceId, 'id,name,mimeType')).sort(sortByName);

  for (const file of children.filter((c) => !isFolder(c))) {
    ctx.checkCancelled();
    const name = renameFromTemplate(file.name!, input.config.template, input.gameId, input.gameName);
    const copied = await copyFile(file.id!, name, targetId);
    await changeOwnerSafely(copied, input, ctx);
    stats.files++;
    ctx.log.info(`  + Copied file: ${name}`);
  }

  for (const sub of children.filter(isFolder)) {
    ctx.checkCancelled();
    const name = renameFromTemplate(sub.name!, input.config.template, input.gameId, input.gameName);
    const created = await createFolder(name, targetId);
    stats.folders++;
    ctx.log.info(` -> Created folder: ${name}`);
    await applyFolderSettings(created, input, ctx);
    await copyRecursive(sub.id!, created.id!, input, ctx, stats);
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
