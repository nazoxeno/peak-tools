# Game Link Check

Kiểm tra các trang game **nội bộ** còn hoạt động không. Chạy trên máy (qua VPN công ty).

```
Sheet danh sách game                Sheet cấu hình
└─ tab "Ids Game" ──(đọc ID, tên)─┐  ├─ tab "token"   ──(đọc token theo email)
                                  ├─►│
                     kiểm tra URL ◄┘  └─ tab "game_id" ◄─(ghi bảng kết quả)
```

| Sheet | Tab | Cấu trúc |
|---|---|---|
| Danh sách game | `Ids Game` | Cặp cột A–B, C–D, E–F… = **ID – Tên game** (dòng 1 là tiêu đề) |
| Cấu hình (`VITE_CONFIG_SHEET_ID` trong `.env.local`) | `token` | Cột A **email**, B **user_id**, C **token** (dòng 1 là tiêu đề) |
| Cấu hình | `game_id` | **Kết quả**: cột A `id` · B `name` · C `status` — vùng A2:C ghi lại mỗi lần chạy |

Token được tra theo **email tài khoản Google đăng nhập trong script** (hoặc `TOKEN_EMAIL`)
và luôn được che thành `***` trong terminal lẫn trong Sheet.

> ⚠️ Tab `token` chứa token thật — ai có quyền **xem** Sheet cấu hình đều đọc được.

## Cài đặt (1 lần)

1. **OAuth client cho script** — Google Cloud project PEAK Tools → Google Auth Platform → **Clients** →
   *Create client* → Application type **Desktop app** → Create → **Download JSON**
   → lưu thành `scripts/game-check/credentials.json` (đã được `.gitignore`).
2. **Cấu hình**: `cp scripts/game-check/.env.example scripts/game-check/.env` rồi điền
   `GAME_LIST_SHEET`, `GAME_URL_TEMPLATE`. Sheet cấu hình tự lấy từ `VITE_CONFIG_SHEET_ID`
   trong `.env.local` (file của web) — không cần khai báo lại.
3. Lần chạy đầu sẽ mở trình duyệt để đăng nhập Google (quyền Sheets + xem email)
   → token đăng nhập lưu ở `token.json` (đã `.gitignore`).

## Chạy

```bash
# Bật VPN công ty trước
npm run game-check                  # kiểm tra + ghi kết quả vào tab game_id
npm run game-check -- --dry-run     # chỉ kiểm tra, không ghi
npm run game-check -- --login       # đăng nhập Google lại (để đọc/ghi Sheet)
npm run game-check -- --game-login  # dán lại cookie đăng nhập trang game

# Chạy một phần — CHỈ cập nhật các ID này trong tab game_id, giữ nguyên game khác
npm run game-check -- --limit 5            # 5 game đầu trong tab Ids Game
npm run game-check -- --ids 1234,10500     # đúng các ID này (kể cả ID không có trong tab)
npm run game-check -- --range 9990-0000    # ID 4 số (kts), giảm dần, 5 request/giây
npm run game-check -- --range 00000-00500  # ID 5 số (gss) — viết đủ 5 chữ số
npm run game-check -- --range 00000-99999 --yes   # bỏ qua hỏi xác nhận (dải > 500 ID)
```

## URL & prefix

Mẫu URL lấy từ `GAME_URL_TEMPLATE` (.env) hoặc key **`game.urlTemplate`** trong tab `settings`
(dùng chung với Game Launcher trên web). Placeholder `{prefix}` thay theo số chữ số của ID
(`ID_PREFIXES` hoặc key **`game.idPrefixes`**, vd `4:kts,5:gss`):

| ID | URL |
|---|---|
| `0042` (4 số) | `…/en/kts0042/?token=***` |
| `10500` (5 số) | `…/en/gss10500/?token=***` |

ID có số chữ số không khai báo prefix → ❌ Không hoạt động.

**ID 4 số và 5 số là 2 dải riêng**, có thể trùng số: `0042` (kts) ≠ `00042` (gss).
Số chữ số được tính theo đúng chuỗi ID, nên:

- Trong tab `Ids Game`, cột ID phải **giữ số 0 ở đầu**: định dạng ô là *Plain text*
  (Format → Number → Plain text) hoặc số tuỳ chỉnh `0000` / `00000`. Nếu ô là số thường,
  `00042` sẽ bị đọc thành `42` → sai prefix.
- Với `--range`, **viết đủ số chữ số**: `00000-00500` (5 số), `0000-0500` (4 số).

## Quét dải ID (`--range`)

- Giới hạn **5 request/giây** (đổi bằng `RATE_LIMIT`); dải > 500 ID sẽ hỏi xác nhận kèm thời gian ước tính.
- **10 lần liên tiếp** bị chặn / quá tải (HTTP 429, 503, timeout) → **tự dừng, không ghi gì**.
- HTTP 429/503 tính là "lỗi kết nối", không phải game chết.
- Tên game: tiêu đề trang; nếu không có thì lấy từ tab `Ids Game` (nếu ID có trong đó).
- ⚠️ Quét hàng nghìn ID nên báo trước cho DevOps / người quản lý hệ thống staging.

## Đăng nhập trang game (Sign In)

Trang game nằm sau **oauth2-proxy** (Sign in with Google). Sau một thời gian phiên hết hạn và trang
chỉ hiện "Sign In". Script xử lý như sau:

1. Kiểm tra thử game đầu tiên. Nếu gặp trang **Sign In** → tạm dừng, **mở trang game trên trình duyệt**.
2. Bạn bấm *Sign in with Google*, đăng nhập mail công ty, rồi F12 → **Application → Cookies** → copy
   giá trị cookie `_oauth2_proxy` (hoặc cả header `cookie` trong tab Network) → dán vào terminal.
3. Script lưu vào `game-session.json` (đã `.gitignore`) và chạy tiếp toàn bộ ID.
   Lần sau dùng lại cookie đã lưu; hết hạn thì tự hỏi lại.

Cookie chỉ được gửi tới domain của game, không gửi đi nơi khác.

## Cách đánh giá

| Kết quả | Điều kiện |
|---|---|
| ✅ Hoạt động | HTTP 2xx (sau redirect), và thoả `DEAD_TEXT` / `ALIVE_TEXT` nếu có đặt |
| ❌ Không hoạt động | HTTP 4xx/5xx, hoặc trang có `DEAD_TEXT`, hoặc thiếu `ALIVE_TEXT` |
| ⚠️ Lỗi kết nối | Không kết nối được, timeout, lỗi chứng chỉ... |

- Kiểm tra thử link đầu tiên trước: nếu không kết nối được → dừng và nhắc bật VPN.
- Nếu **tất cả** đều lỗi kết nối → không ghi Sheet (giữ nguyên kết quả lần trước).
- Exit code: `0` = tất cả hoạt động, `1` = có game lỗi, `2` = lỗi cấu hình.
- `DEAD_TEXT`/`ALIVE_TEXT` chỉ đọc HTML server trả về — game render hoàn toàn bằng JavaScript
  có thể không có chữ đó trong HTML.

## Kết quả (tab `game_id`)

Tab chỉ chứa **game đang hoạt động** — Game Launcher trên web đọc từ đây.

| Cột | Nội dung |
|---|---|
| A `id` | ID game (từ tab `Ids Game`) |
| B `name` | **Tiêu đề `<title>` của trang** (bỏ tiền tố trong `TITLE_STRIP_PREFIXES`, vd `Techplay - `); nếu không có / nằm trong `IGNORE_TITLES` → tên trong tab `Ids Game` |
| C `status` | `✅ Hoạt động` |

| Kết quả kiểm tra | Xử lý |
|---|---|
| ✅ Hoạt động | Ghi vào tab |
| ❌ Không hoạt động | **Xoá khỏi tab** |
| ⚠️ Lỗi kết nối | Thử lại 1 lần; vẫn lỗi → **giữ nguyên dòng cũ** (nếu đã có), không xoá |

- Chạy **cả danh sách** (không có `--limit/--ids/--range`): tab = đúng các game hoạt động trong `Ids Game`.
- Chạy **một phần**: chỉ cập nhật các ID vừa kiểm tra, các game khác giữ nguyên. Tab luôn sắp xếp theo ID.

- Giữ nguyên dòng tiêu đề (dòng 1) và các cột ngoài A–C; tab chưa có thì tự tạo.
- Game build bằng engine (Cocos/Unity…) thường có cùng một tiêu đề chung (vd `Game`) — khi đó cột
  `name` sẽ giống nhau giữa các game. Chi tiết HTTP / thời gian phản hồi xem ở terminal.
