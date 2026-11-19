import { IconFolderShare, IconUserShare, type Icon } from '@tabler/icons-react';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * REGISTRY — nguồn duy nhất cho sidebar, card ở Home và routing (#/<id>).
 *
 * Thêm tool mới:
 *   1. Tạo thư mục src/tools/<ten-tool>/ gồm logic (.ts) + giao diện (<Ten>Tool.tsx, export default)
 *   2. Thêm 1 entry vào TOOLS bên dưới. `category` dùng để nhóm trên sidebar.
 */
export type ToolDef = {
  id: string;
  title: string;
  description: string;
  category: 'Google Drive' | 'Google Sheets';
  /** Màu Mantine cho icon/badge, vd 'brand', 'teal', 'orange' */
  color: string;
  icon: Icon;
  component: LazyExoticComponent<ComponentType<{ tool: ToolDef }>>;
};

export const TOOLS: ToolDef[] = [
  {
    id: 'change_owner',
    title: 'Drive Ownership',
    description: 'Kiểm tra và chuyển quyền sở hữu toàn bộ file/folder trên Google Drive.',
    category: 'Google Drive',
    color: 'brand',
    icon: IconUserShare,
    component: lazy(() => import('./change-owner/ChangeOwnerTool')),
  },
  {
    id: 'clone_folder',
    title: 'Clone Drive Folder',
    description: 'Sao chép toàn bộ cấu trúc thư mục từ folder mẫu, tự đổi tên theo game mới.',
    category: 'Google Drive',
    color: 'teal',
    icon: IconFolderShare,
    component: lazy(() => import('./clone-folder/CloneFolderTool')),
  },
];

/** Nhóm tool theo category, giữ thứ tự khai báo. */
export function toolsByCategory() {
  const groups = new Map<string, ToolDef[]>();
  for (const t of TOOLS) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
  return [...groups.entries()];
}
