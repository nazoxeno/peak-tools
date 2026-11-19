/** Thông tin tác giả — sửa ở đây là đổi khắp app (footer, trang đăng nhập, lời nhắn liên hệ, console). */
export const AUTHOR = 'NazoX - 723';

/** Dùng trong các thông báo cần người dùng liên hệ để được hỗ trợ / cấp quyền. */
export const CONTACT = `Liên hệ ${AUTHOR}`;

/** Phiên bản build: commit SHA ngắn khi build trên GitHub Actions, "dev" khi chạy local. */
export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;

/** Chữ ký trong DevTools console — "dấu ấn" cho ai mở F12 😄 */
export function printConsoleSignature() {
  console.log(
    `%c P.E.A.K Tools %c crafted by ${AUTHOR} %c ${APP_VERSION} · ${BUILD_DATE} `,
    'background:linear-gradient(135deg,#5b6cff,#8b3dff);color:#fff;font-weight:700;padding:4px 8px;border-radius:6px 0 0 6px',
    'background:#1d1f27;color:#fff;padding:4px 8px',
    'background:#2d2f3a;color:#9aa0b4;padding:4px 8px;border-radius:0 6px 6px 0',
  );
}
