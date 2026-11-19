import { IconBone, IconBrandStackshare, IconDeviceGamepad2, IconPhotoScan, IconFolderShare, IconListCheck, IconMovie, IconUserShare, type Icon } from '@tabler/icons-react';
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
  category: 'Google Drive' | 'Google Sheets' | 'Game' | 'Preview' | 'Asset';
  /** Màu Mantine cho icon/badge, vd 'brand', 'teal', 'orange' */
  color: string;
  icon: Icon;
  /** Hiển thị toàn chiều rộng (vd tool nhúng trang khác), thay vì khung 960px */
  fullWidth?: boolean;
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
  {
    id: 'art_checklist',
    title: 'Art Checklist',
    description: 'Quét folder UI/PSD trên Drive và cập nhật checklist kèm ảnh preview, kích thước, trạng thái.',
    category: 'Google Sheets',
    color: 'orange',
    icon: IconListCheck,
    component: lazy(() => import('./art-checklist/ArtChecklistTool')),
  },
  {
    id: 'anim_checklist',
    title: 'Anim Checklist',
    description: 'Quét folder Animation (Spine/Cocos), liệt kê skin & animation, chèn ảnh demo vào checklist.',
    category: 'Google Sheets',
    color: 'grape',
    icon: IconMovie,
    component: lazy(() => import('./anim-checklist/AnimChecklistTool')),
  },
  {
    id: 'game_launcher',
    title: 'Game Launcher',
    description: 'Danh sách game nội bộ đang hoạt động — bấm để mở game trong tab mới.',
    category: 'Game',
    color: 'cyan',
    icon: IconDeviceGamepad2,
    component: lazy(() => import('./game-launcher/GameLauncherTool')),
  },
  {
    id: 'spine_inspector',
    title: 'Spine Inspector',
    description: 'Xem animation, skin, event, thời lượng trong file Spine .json; so sánh 2 phiên bản.',
    category: 'Asset',
    color: 'grape',
    icon: IconBrandStackshare,
    component: lazy(() => import('./spine-inspector/SpineInspectorTool')),
  },
  {
    id: 'spine_review',
    title: 'Spine Review',
    description: 'Xem trước animation Spine ngay trong trình duyệt.',
    category: 'Preview',
    color: 'pink',
    icon: IconBone,
    fullWidth: true,
    component: lazy(() => import('./spine-review/SpineReviewTool')),
  },
  {
    id: 'image_batch',
    title: 'Batch Image Processor',
    description: 'Resize, cắt viền, nén PNG giảm màu, giới hạn dung lượng, đổi PNG/JPG/WebP; GIF ↔ frame, sprite sheet.',
    category: 'Asset',
    color: 'orange',
    icon: IconPhotoScan,
    component: lazy(() => import('./image-batch/ImageBatchTool')),
  },
];

/** Nhóm tool theo category, giữ thứ tự khai báo. */
export function toolsByCategory() {
  const groups = new Map<string, ToolDef[]>();
  for (const t of TOOLS) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
  return [...groups.entries()];
}
