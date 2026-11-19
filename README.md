# P.E.A.K Tools

Web nội bộ (Vite + React + TypeScript + Mantine) thao tác Google Drive / Sheets bằng tài khoản của người dùng.
Deploy tự động lên GitHub Pages: https://nazoxeno.github.io/peak-tools/

## Chạy local

```bash
cp .env.example .env.local   # rồi điền Client ID, Sheet ID
npm install
npm run dev                  # http://localhost:5173/peak-tools/
```

## Cấu hình & thông tin nội bộ

Repo **không** chứa ID hay email nội bộ:

| Thông tin | Nằm ở đâu |
|---|---|
| `VITE_GOOGLE_CLIENT_ID`, `VITE_CONFIG_SHEET_ID`, `VITE_ORG_DOMAIN`, `VITE_GOOGLE_API_KEY` | `.env.local` (local, không commit) · GitHub → Settings → Secrets and variables → Actions → **Variables** |
| Email, template clone, phân quyền, màu dropdown | **Google Sheet cấu hình** (chỉ share trong công ty) — xem trang *Cấu hình* trong app |

Lần đầu: để trống `VITE_CONFIG_SHEET_ID`, đăng nhập → trang **Cấu hình** → **Tạo Sheet mẫu** → copy ID vào biến môi trường.

## Cấu trúc

```
src/
├── env.ts                 # Đọc biến môi trường (Client ID, Sheet ID)
├── app-config/            # Schema + đọc/tạo Google Sheet cấu hình
├── auth/AuthProvider.tsx  # Đăng nhập Google (GIS), giữ token
├── google/
│   ├── client.ts          # fetch wrapper: gắn token, retry 429/5xx
│   ├── drive.ts           # Drive API helpers
│   └── sheets.ts          # Sheets API helpers (resize, màu, dropdown, IMAGE())
├── lib/                   # router (hash), useTask (live log + nút dừng)
├── components/            # LogPanel, PageHeader
├── layout/AppLayout.tsx   # Header + sidebar navigator
├── pages/                 # Home, Login, Settings
└── tools/
    ├── registry.tsx       # Danh sách tool → sidebar, card Home, route
    ├── change-owner/
    ├── clone-folder/
    ├── art-checklist/     # cần Apps Script Engine
    └── anim-checklist/    # cần Apps Script Engine
apps-script/               # Apps Script Engine cho tool chèn ảnh vào Sheet — xem apps-script/README.md
```

## Thêm tool mới

1. Tạo `src/tools/<ten-tool>/` gồm file logic (`.ts`, nhận `TaskContext` để ghi log) và `<Ten>Tool.tsx` (`export default`).
2. Thêm 1 entry vào `TOOLS` trong `src/tools/registry.tsx`.

## Google Cloud

- OAuth consent screen: **Internal** (chỉ tài khoản trong tổ chức).
- OAuth client (Web) — Authorized JavaScript origins: `http://localhost:5173` và domain GitHub Pages.
- Đã bật Google Drive API, Google Sheets API, Apps Script API, **Google Picker API**.
- API key (cho nút chọn file Drive): Credentials → API key, giới hạn *Websites* = `http://localhost:5173/*`, `https://nazoxeno.github.io/*` và *API* = Google Picker API → đặt vào `VITE_GOOGLE_API_KEY`.
