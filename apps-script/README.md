# P.E.A.K Tools

Bản Apps Script cũ — chạy clasp trong thư mục `apps-script/` (deploy bằng [clasp](https://github.com/google/clasp), `rootDir = src`).

```
src/
├── appsscript.json
├── server/
│   ├── core/
│   │   ├── Router.js       # doGet + PAGES registry (route + navigator + card Home)
│   │   ├── Config.js       # config chung
│   │   ├── TaskLogger.js   # live log (writeLog / getLiveLogs) dùng chung
│   │   └── Utils.js
│   └── tools/
│       ├── ChangeOwner.js
│       └── CloneFolder.js
└── ui/
    ├── layout/
    │   ├── Layout.html     # khung chung: sidebar navigator + live terminal
    │   ├── Styles.html     # CSS chung
    │   └── Scripts.html    # JS chung (TaskRunner, showMessage...)
    └── pages/              # chỉ chứa nội dung từng trang
        ├── Home.html
        ├── ChangeOwner.html
        └── CloneFolder.html
```

## Thêm tool mới

1. `src/server/tools/MyTool.js` — hàm server nhận `taskId` ở tham số cuối, log bằng `writeLog(taskId, msg)`, đầu hàm gọi `resetTaskLog(taskId)`.
2. `src/ui/pages/MyTool.html` — form + script, gọi `TaskRunner.run({ fn: 'myServerFn', args: [...], onDone })`.
3. Thêm entry vào `PAGES` trong `src/server/core/Router.js` → tự có route `?page=<id>`, mục sidebar và card ở Home.

## Lệnh

```bash
clasp push     # đẩy code lên
clasp open     # mở editor
```
