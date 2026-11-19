#!/usr/bin/env node
/**
 * Game Link Check — kiểm tra các trang game nội bộ còn hoạt động không.
 *
 * Chạy trên máy (đi qua VPN công ty):
 *   1. Đọc danh sách game từ Sheet danh sách, tab `Ids Game` (cặp cột A–B, C–D, E–F… = ID – Tên)
 *   2. Lấy token theo email từ Sheet cấu hình, tab `token` (A email, B user_id, C token)
 *   3. Điền ID + token vào mẫu URL, kiểm tra từng link
 *   4. Ghi bảng kết quả vào Sheet cấu hình, tab `game_id`
 * Token luôn được che (***) khi in ra terminal / ghi vào Sheet.
 *
 *   npm run game-check                # kiểm tra + ghi kết quả
 *   npm run game-check -- --dry-run   # chỉ kiểm tra, không ghi Sheet
 *   npm run game-check -- --login     # đăng nhập Google lại
 *   npm run game-check -- --limit 5           # 5 game đầu trong tab Ids Game
 *   npm run game-check -- --ids 1234,5678     # đúng các ID này
 *   npm run game-check -- --range 9990-0000   # quét dải ID 4 số (giới hạn tốc độ, tự dừng khi bị chặn)
 *   npm run game-check -- --range 00000-00500 # quét dải ID 5 số (viết đủ 5 chữ số)
 * Chạy một phần (--limit / --ids / --range) → chỉ cập nhật các ID đó trong tab game_id, giữ nguyên phần còn lại.
 *
 * Cấu hình: scripts/game-check/.env (xem .env.example). Hướng dẫn: README.md cùng thư mục.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { auth, OAuth2Client } from 'google-auth-library';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_FILE = path.join(DIR, 'credentials.json');
const TOKEN_FILE = path.join(DIR, 'token.json');
/** Cookie đăng nhập trang game (oauth2-proxy) — lưu lại để lần sau không phải dán */
const SESSION_FILE = path.join(DIR, 'game-session.json');
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  // Lấy email tài khoản đang đăng nhập → tra token trong tab `token`
  'https://www.googleapis.com/auth/userinfo.email',
];
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

const argv = process.argv.slice(2);
const args = new Set(argv);

/** Đọc giá trị của tuỳ chọn, hỗ trợ cả `--name value` và `--name=value`. */
function argValue(name) {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

const LIMIT = argValue('--limit');
const ONLY_IDS = argValue('--ids')
  ?.split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const RANGE = argValue('--range');
const ASSUME_YES = args.has('--yes');
/** Chạy một phần → ghi GỘP vào tab game_id (chỉ cập nhật các ID đã kiểm tra, giữ nguyên phần còn lại). */
const PARTIAL = LIMIT !== null || Boolean(ONLY_IDS?.length) || RANGE !== null;
const DRY_RUN = args.has('--dry-run');
const FORCE_LOGIN = args.has('--login');
const FORCE_GAME_LOGIN = args.has('--game-login');

// ---------------------------------------------------------------- output
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function fail(message) {
  console.error(c.red(`\n✖ ${message}\n`));
  process.exit(2);
}

// ---------------------------------------------------------------- config
const env = (key, fallback = '') => (process.env[key] ?? '').trim() || fallback;

function extractId(input) {
  const m = input.match(/\/d\/([\w-]+)/) || input.match(/^([\w-]{20,})$/);
  return m ? m[1] : '';
}

const CFG = {
  /** Sheet chứa danh sách game (cặp cột ID – Tên) */
  gameListSheetId: extractId(env('GAME_LIST_SHEET')),
  gameListTab: env('GAME_LIST_TAB', 'Ids Game'),
  /** Sheet cấu hình (mặc định = VITE_CONFIG_SHEET_ID trong .env.local của web): tab token + tab kết quả */
  configSheetId: extractId(env('CONFIG_SHEET', env('VITE_CONFIG_SHEET_ID'))),
  tokenTab: env('TOKEN_TAB', 'token'),
  resultTab: env('RESULT_TAB', 'game_id'),
  /** Để trống = email tài khoản Google đang đăng nhập trong script */
  tokenEmail: env('TOKEN_EMAIL'),
  /** Để trống → lấy key game.urlTemplate trong tab settings của Sheet cấu hình */
  urlTemplate: env('GAME_URL_TEMPLATE'),
  /** Prefix theo số chữ số của ID, vd "4:kts,5:gss". Để trống → lấy key game.idPrefixes trong tab settings */
  idPrefixes: env('ID_PREFIXES'),
  /** ID ngắn hơn thì thêm số 0 phía trước khi quét dải (vd 12 → 0012) */
  minIdDigits: Number(env('MIN_ID_DIGITS', '4')),
  /** Số request tối đa mỗi giây (0 = không giới hạn). Khi --range mặc định 5. */
  rateLimit: Number(env('RATE_LIMIT', '0')),
  startRow: Number(env('START_ROW', '2')),
  concurrency: Number(env('CONCURRENCY', '8')),
  timeoutMs: Number(env('TIMEOUT_MS', '15000')),
  aliveText: env('ALIVE_TEXT'),
  deadText: env('DEAD_TEXT'),
  /** Tiêu đề chung chung (vd trang đăng nhập) — không dùng làm tên game. Phân tách bằng dấu phẩy. */
  /** Cookie phiên của trang game (oauth2-proxy). Để trống → script hỏi khi gặp trang Sign In. */
  gameCookie: env('GAME_COOKIE'),
  sessionCookieName: env('SESSION_COOKIE_NAME', '_oauth2_proxy'),
  /** Tiền tố bỏ khỏi tên game, vd "Techplay" → "Techplay - Tên game" thành "Tên game". Phân tách bằng dấu phẩy. */
  titleStripPrefixes: env('TITLE_STRIP_PREFIXES')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
  ignoreTitles: env('IGNORE_TITLES', 'Sign In')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean),
  extraCaFile: env('EXTRA_CA_FILE'),
  insecureTls: env('INSECURE_TLS') === '1',
};

function validateConfig() {
  if (LIMIT !== null && !(Number(LIMIT) > 0)) fail('--limit cần một số > 0, vd --limit 5');
  if (args.has('--ids') && !ONLY_IDS?.length) fail('--ids cần danh sách ID, vd --ids 1234,5678');
  if (!existsSync(path.join(DIR, '.env'))) {
    fail('Chưa có file scripts/game-check/.env — copy từ .env.example rồi điền giá trị.');
  }
  if (!CFG.gameListSheetId) fail('GAME_LIST_SHEET chưa đúng (dán link hoặc ID của Sheet danh sách game).');
  if (!CFG.configSheetId) fail('Chưa có Sheet cấu hình — đặt VITE_CONFIG_SHEET_ID trong .env.local (hoặc CONFIG_SHEET trong scripts/game-check/.env).');
  if (CFG.configSheetId === CFG.gameListSheetId && CFG.resultTab === CFG.gameListTab) {
    fail('RESULT_TAB trùng với tab danh sách game — sẽ xoá mất danh sách. Kiểm tra lại cấu hình.');
  }
  if (RANGE !== null && !/^\d+-\d+$/.test(RANGE)) fail('--range cần dạng <từ>-<đến>, vd --range 9990-0000');
  if (CFG.extraCaFile && !existsSync(CFG.extraCaFile)) fail(`Không thấy file CA: ${CFG.extraCaFile}`);
}

// ---------------------------------------------------------------- Google auth
/** Đăng nhập lần đầu qua trình duyệt (OAuth Desktop), lưu refresh token vào token.json. */
async function getGoogleClient() {
  if (!FORCE_LOGIN && existsSync(TOKEN_FILE)) {
    return auth.fromJSON(JSON.parse(await readFile(TOKEN_FILE, 'utf8')));
  }
  if (!existsSync(CREDENTIALS_FILE)) {
    fail('Chưa có scripts/game-check/credentials.json — tạo OAuth client loại "Desktop app" (xem README.md).');
  }

  const keys = JSON.parse(await readFile(CREDENTIALS_FILE, 'utf8'));
  const key = keys.installed ?? keys.web;
  if (!key) fail('credentials.json không đúng định dạng OAuth client.');

  // Server tạm trên 127.0.0.1 để nhận mã đăng nhập từ Google
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const redirectUri = `http://127.0.0.1:${server.address().port}`;
  const client = new OAuth2Client(key.client_id, key.client_secret, redirectUri);
  const authUrl = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });

  console.log(c.bold('\n🔐 Mở trình duyệt để đăng nhập Google...'));
  console.log(c.dim(`   Nếu trình duyệt không tự mở, truy cập:\n   ${authUrl}\n`));
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  execFile(opener, [authUrl], () => {});

  const code = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const params = new URL(req.url, redirectUri).searchParams;
      const code = params.get('code');
      const error = params.get('error');
      if (!code && !error) {
        res.writeHead(404).end(); // vd /favicon.ico
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(code ? '<h3>✅ Đăng nhập xong — quay lại terminal.</h3>' : `<h3>❌ Lỗi: ${error}</h3>`);
      if (code) resolve(code);
      else reject(new Error(`Đăng nhập thất bại: ${error}`));
    });
  }).finally(() => server.close());

  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) fail('Google không trả về refresh token — chạy lại với --login.');
  await writeFile(
    TOKEN_FILE,
    JSON.stringify({ type: 'authorized_user', client_id: key.client_id, client_secret: key.client_secret, refresh_token: tokens.refresh_token }),
    { mode: 0o600 },
  );
  client.setCredentials(tokens);
  console.log(c.green('   Đã lưu đăng nhập vào token.json\n'));
  return client;
}

// ---------------------------------------------------------------- Sheets
async function sheetsRequest(client, url, options = {}) {
  try {
    const res = await client.request({ url, ...options });
    return res.data;
  } catch (e) {
    const msg = e.response?.data?.error?.message ?? e.message;
    if (/invalid_grant/i.test(msg)) fail('Phiên đăng nhập Google đã hết hạn — chạy lại với --login.');
    throw new Error(`Google Sheets: ${msg}`);
  }
}

/** Email của tài khoản Google đang đăng nhập trong script. */
async function getAccountEmail(client) {
  try {
    const res = await client.request({ url: 'https://www.googleapis.com/oauth2/v3/userinfo' });
    return res.data.email;
  } catch {
    fail('Không lấy được email tài khoản — chạy lại với --login để cấp thêm quyền xem email.');
  }
}

/**
 * Tìm token theo email trong tab `token` (cột A email, B user_id, C token; dòng 1 là tiêu đề).
 * @returns {{ email: string, userId: string, token: string }}
 */
async function readToken(client, email) {
  const range = encodeURIComponent(`'${CFG.tokenTab}'!A2:C`);
  const data = await sheetsRequest(client, `${SHEETS_API}/${CFG.configSheetId}/values/${range}`);
  const row = (data.values ?? []).find((r) => String(r[0] ?? '').trim().toLowerCase() === email.toLowerCase());
  if (!row) fail(`Không tìm thấy email ${email} trong tab "${CFG.tokenTab}" (cột A).`);
  const token = String(row[2] ?? '').trim();
  if (!token && CFG.urlTemplate.includes('{token}')) fail(`Email ${email} chưa có token (cột C, tab "${CFG.tokenTab}").`);
  return { email, userId: String(row[1] ?? '').trim(), token };
}

/** Đọc tab settings (key | value) của Sheet cấu hình — dùng chung cấu hình với web. */
async function readSettings(client) {
  try {
    const data = await sheetsRequest(client, `${SHEETS_API}/${CFG.configSheetId}/values/${encodeURIComponent("'settings'!A2:B")}`);
    return Object.fromEntries((data.values ?? []).filter((r) => r[0]).map((r) => [String(r[0]).trim(), String(r[1] ?? '').trim()]));
  } catch {
    return {};
  }
}

/**
 * Sinh danh sách ID theo dải, giữ thứ tự (vd 9990-0000 chạy giảm dần).
 * Số chữ số = theo cách viết dải: "0000-9999" → ID 4 số (kts), "00000-99999" → ID 5 số (gss).
 * ID 4 số và 5 số là 2 dải riêng (0042 ≠ 00042).
 */
function rangeIds(spec) {
  const [fromText, toText] = spec.split('-');
  const digits = Math.max(fromText.length, toText.length, CFG.minIdDigits);
  const from = Number(fromText);
  const to = Number(toText);
  if (String(Math.max(from, to)).length > digits) fail(`--range ${spec}: số vượt quá ${digits} chữ số.`);
  const step = from <= to ? 1 : -1;
  const ids = [];
  for (let n = from; step > 0 ? n <= to : n >= to; n += step) ids.push(String(n).padStart(digits, '0'));
  return ids;
}

/** Đọc các cặp cột ID–Tên. Trả về [{ id, name, row, col }] (row/col 0-based). */
async function readGames(client) {
  const meta = await sheetsRequest(client, `${SHEETS_API}/${CFG.gameListSheetId}?fields=properties.title,sheets.properties(sheetId,title)`);
  const sheet = meta.sheets.find((s) => s.properties.title === CFG.gameListTab);
  if (!sheet) fail(`Không thấy tab "${CFG.gameListTab}" trong Sheet "${meta.properties.title}".`);

  const tab = sheet.properties.title;
  const range = encodeURIComponent(`'${tab}'!A${CFG.startRow}:ZZ`);
  const data = await sheetsRequest(client, `${SHEETS_API}/${CFG.gameListSheetId}/values/${range}`);

  const games = [];
  (data.values ?? []).forEach((row, r) => {
    for (let col = 0; col < row.length; col += 2) {
      const id = String(row[col] ?? '').trim();
      if (!id) continue;
      games.push({ id, name: String(row[col + 1] ?? '').trim(), row: CFG.startRow - 1 + r, col });
    }
  });
  return { title: meta.properties.title, tab, games };
}

// ---------------------------------------------------------------- HTTP check
// Tạo agent khi cần (sau validateConfig) để lỗi cấu hình được báo rõ ràng
let agents = null;
function getAgents() {
  agents ??= {
    https: new https.Agent({
      keepAlive: true,
      maxSockets: CFG.concurrency,
      rejectUnauthorized: !CFG.insecureTls,
      ca: CFG.extraCaFile ? [...tls.rootCertificates, readFileSync(CFG.extraCaFile, 'utf8')] : undefined,
    }),
    http: new http.Agent({ keepAlive: true, maxSockets: CFG.concurrency }),
  };
  return agents;
}
/** Có kiểm tra theo nội dung trang → đọc nhiều hơn; chỉ cần <title> → dừng sớm. */
const needFullBody = Boolean(CFG.aliveText || CFG.deadText);
const MAX_BODY = needFullBody ? 512 * 1024 : 64 * 1024;
const MAX_REDIRECTS = 5;

// ---------------------------------------------------------------- game session (oauth2-proxy)
/** Cookie gửi kèm request tới trang game (sau khi đăng nhập Google qua oauth2-proxy). */
let gameCookie = '';

/** Chỉ gửi cookie tới domain của game (cùng domain gốc, vd *.company.gay), không gửi đi nơi khác. */
function isGameHost(hostname) {
  const gameHost = new URL(CFG.urlTemplate.replace(/\{\w+\}/g, 'x')).hostname;
  const root = gameHost.split('.').slice(-2).join('.');
  return hostname === root || hostname.endsWith(`.${root}`);
}

/**
 * Chấp nhận: cả chuỗi header Cookie, "tên=giá trị", hoặc chỉ giá trị của cookie oauth2-proxy.
 * Giá trị cookie oauth2-proxy có thể chứa dấu "=" → chỉ coi là "tên=giá trị" khi phần trước "="
 * trông giống tên cookie (ngắn, không có ký tự lạ).
 */
function normalizeCookie(input) {
  const v = input.trim().replace(/^cookie:\s*/i, '').replace(/^["']|["']$/g, '');
  const hasName = /^[A-Za-z0-9_.-]{1,64}=/.test(v);
  return hasName ? v : `${CFG.sessionCookieName}=${v}`;
}

async function loadGameSession() {
  if (CFG.gameCookie) return normalizeCookie(CFG.gameCookie);
  if (FORCE_GAME_LOGIN || !existsSync(SESSION_FILE)) return '';
  try {
    return JSON.parse(await readFile(SESSION_FILE, 'utf8')).cookie ?? '';
  } catch {
    return '';
  }
}

/** Trang Sign In → mở trình duyệt để đăng nhập Google, rồi hỏi người dùng dán cookie vào terminal. */
async function promptGameLogin(realUrl) {
  if (!process.stdin.isTTY) {
    fail('Trang game yêu cầu đăng nhập — chạy lại trong terminal để dán cookie, hoặc đặt GAME_COOKIE trong .env.');
  }
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  execFile(opener, [realUrl], () => {});

  console.log(c.yellow('\n🔑 Trang game đang yêu cầu đăng nhập (Sign In).'));
  console.log(`   1. Trình duyệt vừa mở trang game → bấm ${c.bold('Sign in with Google')} → đăng nhập mail công ty`);
  console.log('   2. Khi đã vào được game: F12 → tab Application → Cookies → chọn domain của game');
  console.log(`   3. Copy giá trị cookie ${c.bold(CFG.sessionCookieName)} (hoặc cả chuỗi header "cookie" trong tab Network)`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('\n   Dán cookie vào đây rồi Enter (để trống = huỷ): ')).trim();
  rl.close();
  if (!answer) fail('Đã huỷ — chưa có cookie đăng nhập trang game.');

  const cookie = normalizeCookie(answer);
  await writeFile(SESSION_FILE, JSON.stringify({ cookie, savedAt: new Date().toISOString() }), { mode: 0o600 });
  console.log(c.green('   Đã lưu cookie vào game-session.json\n'));
  return cookie;
}

/** GET 1 URL, tự theo redirect. Không ném lỗi — trả về { status?, finalUrl, body?, error? }. */
function fetchUrl(url, redirects = 0) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      u,
      {
        method: 'GET',
        agent: u.protocol === 'http:' ? getAgents().http : getAgents().https,
        timeout: CFG.timeoutMs,
        headers: {
          'User-Agent': 'PEAK-GameCheck/1.0',
          Accept: 'text/html,*/*',
          ...(gameCookie && isGameHost(u.hostname) ? { Cookie: gameCookie } : {}),
        },
      },
      (res) => {
        const { statusCode = 0, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) return resolve({ finalUrl: url, error: 'Quá nhiều redirect' });
          return resolve(fetchUrl(new URL(headers.location, url).href, redirects + 1));
        }
        // Đọc nội dung để lấy <title> (và kiểm tra DEAD_TEXT / ALIVE_TEXT nếu có)
        let body = '';
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          resolve({ status: statusCode, finalUrl: url, body });
        };
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          const enough = body.length >= MAX_BODY || (!needFullBody && /<\/title>/i.test(body));
          if (enough) {
            finish();
            res.destroy(); // không cần tải phần còn lại
          }
        });
        res.on('end', finish);
        res.on('close', finish);
        res.on('error', (e) => {
          if (!finished) {
            finished = true;
            resolve({ finalUrl: url, error: e.code ?? e.message });
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('Timeout'), { code: 'TIMEOUT' })));
    req.on('error', (e) => resolve({ finalUrl: url, error: e.code ?? e.message }));
    req.end();
  });
}

const STATUS = { OK: '✅ Hoạt động', DEAD: '❌ Không hoạt động', ERROR: '⚠️ Lỗi kết nối' };

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bỏ tiền tố trong TITLE_STRIP_PREFIXES: "Techplay - Tên game" / "techplay – Tên game" / "Techplay | Tên game" → "Tên game". */
function cleanName(name) {
  let out = String(name ?? '').trim();
  for (const prefix of CFG.titleStripPrefixes) {
    out = out.replace(new RegExp(`^${escapeRegExp(prefix)}\\s*[-–—|:]\\s*`, 'i'), '');
  }
  return out.trim();
}

/** Lấy nội dung thẻ <title> (giải mã HTML entity cơ bản). */
function extractTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html ?? '');
  if (!m) return '';
  return m[1]
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&(middot|ndash|mdash|hellip|copy|reg|trade);/g, (_, n) => ({ middot: '·', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', trade: '™' })[n])
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Thông tin token dùng cho mọi URL (gán trong main). */
let credentials = { userId: '', token: '' };

/** "4:kts,5:gss" → { 4: 'kts', 5: 'gss' } */
let prefixByLength = {};
function parsePrefixes(text) {
  return Object.fromEntries(
    text
      .split(',')
      .map((p) => p.split(':').map((x) => x.trim()))
      .filter(([len, prefix]) => /^\d+$/.test(len) && prefix !== undefined),
  );
}

/** Prefix của ID theo số chữ số (vd 4 số → kts, 5 số → gss). */
const prefixFor = (id) => prefixByLength[String(id).length] ?? '';

function buildUrl(id) {
  return CFG.urlTemplate
    .replaceAll('{prefix}', encodeURIComponent(prefixFor(id)))
    .replaceAll('{id}', encodeURIComponent(id))
    .replaceAll('{user_id}', encodeURIComponent(credentials.userId))
    .replaceAll('{token}', encodeURIComponent(credentials.token));
}

/** Che token trước khi in ra terminal / ghi vào Sheet. */
function mask(text) {
  if (!text || !credentials.token) return text;
  return text.replaceAll(encodeURIComponent(credentials.token), '***').replaceAll(credentials.token, '***');
}

/** Giới hạn tốc độ: các request cách nhau tối thiểu 1000/RATE ms (dùng chung cho mọi luồng). */
let nextSlot = 0;
async function throttle() {
  if (!CFG.rateLimit) return;
  const gap = 1000 / CFG.rateLimit;
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Math.max(nextSlot, Date.now()) + gap;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function checkGame(game) {
  if (CFG.idPrefixes && !prefixFor(game.id) && CFG.urlTemplate.includes('{prefix}')) {
    return { ...game, url: '', ms: 0, httpStatus: '', title: '', result: 'DEAD', detail: `Không có prefix cho ID ${String(game.id).length} chữ số` };
  }
  await throttle();
  const realUrl = buildUrl(game.id);
  const url = mask(realUrl);
  const started = Date.now();
  const res = await fetchUrl(realUrl);
  const ms = Date.now() - started;
  const base = { ...game, url, ms, httpStatus: res.status ?? '', finalUrl: mask(res.finalUrl), title: cleanName(extractTitle(res.body)) };

  if (res.error) return { ...base, result: 'ERROR', detail: res.error };
  // 429/503 = server đang chặn / quá tải → không kết luận game chết
  if (res.status === 429 || res.status === 503) return { ...base, result: 'ERROR', detail: `HTTP ${res.status}` };
  if (res.status >= 400) return { ...base, result: 'DEAD', detail: `HTTP ${res.status}` };
  const body = (res.body ?? '').toLowerCase();
  if (CFG.deadText && body.includes(CFG.deadText.toLowerCase())) {
    return { ...base, result: 'DEAD', detail: `Trang có chữ "${CFG.deadText}"` };
  }
  if (CFG.aliveText && !body.includes(CFG.aliveText.toLowerCase())) {
    return { ...base, result: 'DEAD', detail: `Không thấy chữ "${CFG.aliveText}"` };
  }
  const redirected = res.finalUrl !== realUrl ? `→ ${mask(res.finalUrl)}` : '';

  // Tiêu đề chung chung (vd "Sign In") → không dùng làm tên game
  if (base.title && CFG.ignoreTitles.includes(base.title.toLowerCase())) {
    const genericTitle = base.title;
    base.title = '';
    base.signIn = true; // trang đăng nhập → có thể do cookie phiên hết hạn
    // Không có tên trong danh sách → coi là không hoạt động (bị loại khỏi tab game_id)
    if (!game.name) {
      return { ...base, result: 'DEAD', detail: `Chỉ có trang "${genericTitle}", không có tên game` };
    }
  }
  return { ...base, result: 'OK', detail: redirected };
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

// ---------------------------------------------------------------- write results


/**
 * Ghi kết quả vào tab RESULT_TAB (mặc định `game_id`) của Sheet cấu hình, 3 cột: id | name | status.
 * - Chỉ chứa game hoạt động: OK → ghi/cập nhật, không hoạt động → xoá
 * - Lỗi kết nối (có thể chỉ do mạng): giữ nguyên dòng cũ nếu đã có
 * - replaceAll = true (chạy cả danh sách): tab = đúng các game trong danh sách
 *   replaceAll = false (--range / --ids / --limit): chỉ cập nhật các ID đã kiểm tra, giữ nguyên ID khác
 * - Giữ dòng tiêu đề (dòng 1) và các cột khác; chỉ ghi lại vùng A2:C. Sắp xếp theo ID.
 */
async function writeGameIdTab(client, results, { replaceAll }) {
  const sheetId = CFG.configSheetId;
  const tab = `'${CFG.resultTab}'`;
  const meta = await sheetsRequest(client, `${SHEETS_API}/${sheetId}?fields=sheets.properties.title`);
  const exists = meta.sheets.some((s) => s.properties.title === CFG.resultTab);

  const previous = new Map();
  if (exists) {
    const old = await sheetsRequest(client, `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(`${tab}!A2:C`)}`);
    for (const row of old.values ?? []) {
      const id = String(row[0] ?? '').trim();
      if (id) previous.set(id, [id, cleanName(row[1]), row[2] ?? '']);
    }
  } else {
    await sheetsRequest(client, `${SHEETS_API}/${sheetId}:batchUpdate`, {
      method: 'POST',
      data: { requests: [{ addSheet: { properties: { title: CFG.resultTab, gridProperties: { frozenRowCount: 1 } } } }] },
    });
    await sheetsRequest(client, `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(`${tab}!A1:C1`)}?valueInputOption=RAW`, {
      method: 'PUT',
      data: { values: [['id', 'name', 'status']] },
    });
  }

  const next = replaceAll ? new Map() : new Map(previous);
  let written = 0;
  let kept = 0;
  let removed = 0;
  for (const r of results) {
    if (r.result === 'OK') {
      next.set(r.id, [r.id, r.title || r.name, STATUS.OK]);
      written++;
    } else if (r.result === 'DEAD') {
      if (previous.has(r.id)) removed++;
      next.delete(r.id);
    } else if (previous.has(r.id)) {
      next.set(r.id, previous.get(r.id)); // ERROR → giữ kết quả cũ
      kept++;
    }
  }
  if (replaceAll) removed += [...previous.keys()].filter((id) => !next.has(id) && !results.some((r) => r.id === id)).length;

  const rows = [...next.values()].sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0], undefined, { numeric: true }));
  await sheetsRequest(client, `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(`${tab}!A2:C`)}:clear`, { method: 'POST' });
  if (rows.length) {
    await sheetsRequest(client, `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(`${tab}!A2`)}?valueInputOption=RAW`, {
      method: 'PUT',
      data: { values: rows },
    });
  }
  return { written, kept, removed, total: rows.length };
}

// ---------------------------------------------------------------- main
const NETWORK_ERRORS = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'TIMEOUT'];

async function main() {
  validateConfig();
  const mode = DRY_RUN ? '  (dry-run: không ghi Sheet)' : PARTIAL ? '  (chạy một phần: chỉ cập nhật các ID đã kiểm tra)' : '';
  console.log(c.bold('\n🎮 PEAK Game Link Check') + c.dim(mode));

  const client = await getGoogleClient();

  // Mẫu URL + prefix: .env ưu tiên, không có thì lấy từ tab settings (dùng chung với Game Launcher trên web)
  const settings = await readSettings(client);
  CFG.urlTemplate ||= settings['game.urlTemplate'] ?? '';
  CFG.idPrefixes ||= settings['game.idPrefixes'] ?? '';
  prefixByLength = parsePrefixes(CFG.idPrefixes);
  if (!CFG.urlTemplate.includes('{id}')) {
    fail('Chưa có mẫu URL — đặt key game.urlTemplate trong tab settings (hoặc GAME_URL_TEMPLATE trong .env), phải chứa {id}.');
  }
  if (CFG.urlTemplate.includes('{prefix}') && !Object.keys(prefixByLength).length) {
    fail('Mẫu URL có {prefix} nhưng chưa khai báo game.idPrefixes (vd 4:kts,5:gss).');
  }

  const { title, tab, games: allGames } = await readGames(client);
  console.log(`   Danh sách game: ${title} › ${tab}`);

  // Chạy một phần: --range / --ids / --limit
  let games = allGames;
  if (RANGE !== null) {
    const names = new Map(allGames.map((g) => [g.id, g.name]));
    games = rangeIds(RANGE).map((id) => ({ id, name: names.get(id) ?? '', row: -1, col: -1 }));
    CFG.rateLimit ||= 5; // quét dải → mặc định 5 request/giây
    const minutes = Math.ceil(games.length / CFG.rateLimit / 60);
    const digits = games[0].id.length;
    const prefix = prefixByLength[digits] ? ` → prefix "${prefixByLength[digits]}"` : '';
    console.log(`   Quét dải ${RANGE}: ${games.length} ID ${digits} chữ số${prefix} · ${CFG.rateLimit} request/giây · khoảng ${minutes} phút`);
    if (games.length > 500 && !ASSUME_YES) {
      if (!process.stdin.isTTY) fail('Dải lớn hơn 500 ID — thêm --yes để xác nhận.');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ok = (await rl.question('   Tiếp tục? (y/N) ')).trim().toLowerCase() === 'y';
      rl.close();
      if (!ok) fail('Đã huỷ.');
    }
  } else if (ONLY_IDS?.length) {
    games = ONLY_IDS.map((id) => allGames.find((g) => g.id === id) ?? { id, name: '', row: -1, col: -1 });
    const missing = games.filter((g) => g.row === -1).map((g) => g.id);
    if (missing.length) console.log(c.yellow(`   Không có trong tab "${tab}" (vẫn kiểm tra): ${missing.join(', ')}`));
  } else if (LIMIT !== null) {
    games = allGames.slice(0, Number(LIMIT));
  }
  if (PARTIAL && RANGE === null) console.log(c.dim(`   Chạy ${games.length}/${allGames.length} game`));

  if (/\{(token|user_id)\}/.test(CFG.urlTemplate)) {
    const email = CFG.tokenEmail || (await getAccountEmail(client));
    credentials = await readToken(client, email);
    console.log(`   Token: ${email}${credentials.userId ? ` (user_id ${credentials.userId})` : ''} ${c.dim('· token đã được che khi hiển thị')}`);
  }
  console.log(`   ${games.length} game · mẫu URL: ${CFG.urlTemplate}\n`);
  if (games.length === 0) fail(`Không có ID nào từ dòng ${CFG.startRow} trở xuống.`);

  // Kiểm tra thử 1 link trước — phát hiện sớm khi quên bật VPN / chưa đăng nhập trang game
  gameCookie = await loadGameSession();
  let probe = await checkGame(games[0]);
  if (probe.signIn) {
    gameCookie = await promptGameLogin(buildUrl(games[0].id));
    probe = await checkGame(games[0]);
    if (probe.signIn) {
      fail(`Vẫn gặp trang Sign In sau khi dán cookie — kiểm tra lại cookie ${CFG.sessionCookieName} (đúng domain game, còn hạn).`);
    }
    console.log(c.green('   ✔ Đăng nhập trang game thành công, bắt đầu kiểm tra...\n'));
  }
  if (probe.result === 'ERROR' && NETWORK_ERRORS.includes(probe.detail)) {
    fail(`Không kết nối được ${probe.url} (${probe.detail}).\n  → Đã bật VPN công ty chưa?`);
  }
  if (probe.result === 'ERROR' && /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(probe.detail)) {
    fail(`Lỗi chứng chỉ HTTPS (${probe.detail}).\n  → Đặt EXTRA_CA_FILE=<file CA công ty> trong .env, hoặc INSECURE_TLS=1 (kém an toàn hơn).`);
  }

  const results = new Array(games.length);
  results[0] = probe;
  let done = 1;
  const width = String(games.length).length;
  const print = (r) => {
    const icon = r.result === 'OK' ? c.green('✔') : r.result === 'DEAD' ? c.red('✖') : c.yellow('!');
    const extra =
      r.result === 'OK'
        ? `${r.title ? `"${r.title}" ` : ''}${c.dim(`${r.httpStatus} · ${r.ms}ms`)}`
        : (r.result === 'DEAD' ? c.red : c.yellow)(r.detail);
    console.log(`  ${icon} ${c.dim(`[${String(done).padStart(width)}/${games.length}]`)} ${r.id} ${r.name} — ${extra}`);
  };
  print(probe);

  // Bị chặn / quá tải liên tục (429, 503, timeout…) → dừng hẳn, không cố chạy tiếp
  const MAX_BLOCKED_STREAK = 10;
  let blockedStreak = 0;
  let aborted = false;

  await mapLimit(games.slice(1), CFG.concurrency, async (game, i) => {
    if (aborted) return;
    const r = await checkGame(game);
    results[i + 1] = r;
    done++;
    blockedStreak = r.result === 'ERROR' ? blockedStreak + 1 : 0;
    if (blockedStreak >= MAX_BLOCKED_STREAK) aborted = true;
    // Quét dải: phần lớn ID không tồn tại → chỉ in game hoạt động / lỗi và tiến độ mỗi 100 ID
    if (RANGE === null || r.result !== 'DEAD') print(r);
    else if (done % 100 === 0) console.log(c.dim(`  … [${done}/${games.length}]`));
  });

  if (aborted) {
    fail(
      `Dừng lại: ${MAX_BLOCKED_STREAK} lần liên tiếp lỗi kết nối / bị chặn (HTTP 429/503, timeout).\n` +
        '  Có thể server đang giới hạn tốc độ — giảm RATE_LIMIT / CONCURRENCY rồi chạy lại. Chưa ghi gì vào Sheet.',
    );
  }

  // Lỗi kết nối có thể chỉ do mạng chập chờn → thử lại từng game một lần
  const errorIdx = results.map((r, i) => (r.result === 'ERROR' ? i : -1)).filter((i) => i !== -1);
  if (errorIdx.length && errorIdx.length < results.length) {
    console.log(c.dim(`\n   Thử lại ${errorIdx.length} game lỗi kết nối...`));
    for (const i of errorIdx) {
      await new Promise((r) => setTimeout(r, 500));
      const r = await checkGame(games[i]);
      results[i] = r;
      if (r.result !== 'ERROR') print(r);
    }
  }

  const count = (k) => results.filter((r) => r.result === k).length;
  console.log(
    `\n${c.bold('Kết quả:')} ${c.green(`${count('OK')} hoạt động`)} · ${c.red(`${count('DEAD')} không hoạt động`)} · ${c.yellow(`${count('ERROR')} lỗi kết nối`)}`,
  );

  if (DRY_RUN) {
    console.log(c.dim('Không ghi vào Sheet.\n'));
  } else if (count('ERROR') === results.length) {
    console.log(c.yellow('Tất cả đều lỗi kết nối — bỏ qua ghi Sheet để không ghi đè kết quả cũ.\n'));
  } else {
    const { written, kept, removed, total } = await writeGameIdTab(client, results, { replaceAll: !PARTIAL });
    console.log(
      c.green(`📝 Tab "${CFG.resultTab}": ${total} game`) +
        c.dim(` (cập nhật ${written} game hoạt động · xoá ${removed} game không hoạt động${PARTIAL ? ' · giữ nguyên các ID khác' : ''})`),
    );
    if (kept) console.log(c.yellow(`   Giữ nguyên ${kept} game lỗi kết nối (dùng kết quả lần trước)`));
    console.log(c.dim(`   https://docs.google.com/spreadsheets/d/${CFG.configSheetId}/edit\n`));
  }

  // Exit code ≠ 0 khi có game lỗi → tiện dùng cho lịch chạy tự động
  process.exitCode = count('OK') === results.length ? 0 : 1;
}

main().catch((e) => fail(e.message));
