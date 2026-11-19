import {
  getFile,
  isFolder,
  listChildren,
  ownerOf,
  sortByName,
  transferOwnership,
  type DriveFile,
} from '../../google/drive';
import type { TaskContext } from '../../lib/taskStore';

/** Duyệt cây thư mục: folder → các file của nó → các folder con (đệ quy). */
async function walk(folder: DriveFile, ctx: TaskContext, visit: (item: DriveFile) => Promise<void>) {
  ctx.checkCancelled();
  await visit(folder);

  const children = (await listChildren(folder.id!)).sort(sortByName);
  for (const file of children.filter((c) => !isFolder(c))) {
    ctx.checkCancelled();
    await visit(file);
  }
  for (const sub of children.filter(isFolder)) {
    await walk(sub, ctx, visit);
  }
}

const icon = (f: DriveFile) => (isFolder(f) ? '📁' : '📄');

export type OwnershipReport = {
  total: number;
  mismatches: { name: string; isFolder: boolean; owner: string }[];
  owners: string[];
};

export async function checkOwnership(folderId: string, targetEmail: string, ctx: TaskContext): Promise<OwnershipReport> {
  const { log } = ctx;
  const target = targetEmail.toLowerCase();
  const root = await getFile(folderId);

  log.info('▶️ STARTING OWNERSHIP CHECK...');
  log.info(`👤 Target email: ${targetEmail}`);

  const report: OwnershipReport = { total: 0, mismatches: [], owners: [] };
  const owners = new Set<string>();

  await walk(root, ctx, async (item) => {
    report.total++;
    const owner = ownerOf(item);
    if (owner.toLowerCase() !== target) {
      owners.add(owner);
      report.mismatches.push({ name: item.name!, isFolder: isFolder(item), owner });
      log.warn(`⚠️ ${icon(item)} ${item.name} — owner: ${owner}`);
    } else {
      log.info(`✅ ${icon(item)} ${item.name}`);
    }
  });

  report.owners = [...owners];
  log.success(`✅ CHECK COMPLETED — ${report.total} item(s), ${report.mismatches.length} khác owner.`);
  return report;
}

/** Chỉ chuyển những item mà tài khoản đang đăng nhập là owner (giống bản Apps Script). */
export async function transferFolderOwnership(folderId: string, newOwnerEmail: string, ctx: TaskContext) {
  const { log } = ctx;
  const target = newOwnerEmail.toLowerCase();
  const root = await getFile(folderId);

  log.info('▶️ STARTING TRANSFER OF OWNERSHIP...');
  log.info(`🔍 Scanning folder: ${root.name}`);

  let transferred = 0;
  let skipped = 0;
  let failed = 0;

  await walk(root, ctx, async (item) => {
    const owner = ownerOf(item);
    if (!item.ownedByMe || owner.toLowerCase() === target) {
      skipped++;
      log.info(`⏩ Skipped ${icon(item)} ${item.name} (owner: ${owner})`);
      return;
    }
    try {
      await transferOwnership(item.id!, newOwnerEmail);
      transferred++;
      log.success(`${icon(item)} Transferred: ${item.name}`);
    } catch (e) {
      failed++;
      log.error(`❌ ${item.name}: ${(e as Error).message}`);
    }
  });

  log.success(`✅ COMPLETED — transferred ${transferred}, skipped ${skipped}, failed ${failed}.`);
  return { transferred, skipped, failed };
}
