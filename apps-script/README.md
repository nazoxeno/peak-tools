# PEAK Tools Engine (Apps Script)

Phần chạy bằng Apps Script cho các tool cần **chèn ảnh vào Google Sheet** (Art Checklist, Anim Checklist) —
Sheets API của web không làm được việc này. Web gọi engine qua **Apps Script API (`scripts.run`)**,
engine chạy bằng tài khoản của người đang dùng web.

```
apps-script/
├── engine/
│   ├── appsscript.json   # manifest (scopes, Drive advanced service, quyền gọi API)
│   └── PeakEngine.gs     # toàn bộ code engine — 1 file, dán thẳng vào editor
└── original/             # code gốc của 2 tool (tham khảo)
```

## Cài đặt (làm 1 lần, bằng tài khoản công ty — không cần clasp)

1. **Google Cloud** (project PEAK Tools)
   - APIs & Services → Library → bật **Apps Script API**.
   - Ghi lại **Project number** (trang Dashboard / Project info).
2. **Tạo project Apps Script**: https://script.google.com → *New project* → đặt tên `PEAK Tools Engine`.
   - ⚙️ Project Settings → tick **Show "appsscript.json" manifest file in editor**.
   - Dán nội dung `engine/appsscript.json` vào file `appsscript.json`.
   - Xoá nội dung `Code.gs`, dán toàn bộ `engine/PeakEngine.gs` vào.
   - Save.
3. **Gắn với Cloud project của web**: ⚙️ Project Settings → *Google Cloud Platform (GCP) Project* →
   **Change project** → nhập Project number ở bước 1.
4. **Deploy**: Deploy → *New deployment* → ⚙️ chọn type **API Executable** →
   *Who has access*: **Anyone within <domain>** → Deploy.
5. ⚙️ Project Settings → copy **Script ID** → dán vào **Sheet cấu hình**, tab `settings`:

   | key | value |
   |---|---|
   | `engine.scriptId` | *Script ID vừa copy* |

6. Trên web: **Đăng xuất → đăng nhập lại** (app xin thêm quyền `script.external_request`).

## Cập nhật code engine

Sửa `PeakEngine.gs` trong repo → dán lại vào editor → **Deploy → Manage deployments → ✏️ Edit →
Version: New version → Deploy**. Web luôn gọi bản deploy mới nhất, không cần build lại web.

## Lỗi thường gặp

| Thông báo | Cách xử lý |
|---|---|
| *chưa bật Google Apps Script API* (người dùng) | Người đó vào https://script.google.com/home/usersettings → bật **Google Apps Script API** |
| *Cloud project chưa bật Apps Script API* | Làm lại bước 1 |
| 403 / không có quyền chạy Engine | Kiểm tra bước 3 (cùng Cloud project), bước 4 (Anyone within domain), rồi đăng nhập lại web |
| 404 / không tìm thấy Engine | Sai `engine.scriptId` hoặc chưa deploy API Executable |
| Hết thời gian (6 phút) | Art: chọn ít tab hơn mỗi lần · Anim: chia folder nhỏ hơn |
