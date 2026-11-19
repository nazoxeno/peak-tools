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

# Chạy thử vài game (KHÔNG ghi Sheet — tránh xoá kết quả của các game còn lại)
npm run game-check -- --limit 5            # 5 game đầu trong tab Ids Game
npm run game-check -- --ids 1234,5678      # đúng các ID này (kể cả ID không có trong tab)
```

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

| Cột | Nội dung |
|---|---|
| A `id` | ID game (từ tab `Ids Game`) |
| B `name` | **Tiêu đề `<title>` của trang** khi load được; nếu lỗi / không có tiêu đề / tiêu đề nằm trong `IGNORE_TITLES` (mặc định `Sign In`) → tên trong tab `Ids Game` |
| C `status` | `✅ Hoạt động` · `❌ Không hoạt động (HTTP 404)` · `⚠️ Lỗi kết nối (TIMEOUT)`… |

- Trang chỉ có tiêu đề trong `IGNORE_TITLES` **và** không có tên trong `Ids Game` → ❌ Không hoạt động,
  **không ghi** vào tab `game_id` (danh sách ID bị bỏ qua in ở cuối terminal).
- Giữ nguyên dòng tiêu đề (dòng 1) và các cột ngoài A–C; tab chưa có thì tự tạo.
- Game build bằng engine (Cocos/Unity…) thường có cùng một tiêu đề chung (vd `Game`) — khi đó cột
  `name` sẽ giống nhau giữa các game. Chi tiết HTTP / thời gian phản hồi xem ở terminal.
