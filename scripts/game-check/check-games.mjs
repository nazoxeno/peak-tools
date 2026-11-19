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
 *   npm run game-check -- --limit 5           # chạy thử 5 game đầu (không ghi Sheet)
 *   npm run game-check -- --ids 1234,5678     # chạy thử đúng các ID này (không ghi Sheet)
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
/** Chạy thử một phần danh sách → không ghi Sheet (ghi sẽ xoá kết quả của các game còn lại). */
const PARTIAL = LIMIT !== null || Boolean(ONLY_IDS?.length);
const DRY_RUN = args.has('--dry-run') || PARTIAL;
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
  urlTemplate: env('GAME_URL_TEMPLATE'),
  startRow: Number(env('START_ROW', '2')),
  concurrency: Number(env('CONCURRENCY', '8')),
  timeoutMs: Number(env('TIMEOUT_MS', '15000')),
  aliveText: env('ALIVE_TEXT'),
  deadText: env('DEAD_TEXT'),
  /** Tiêu đề chung chung (vd trang đăng nhập) — không dùng làm tên game. Phân tách bằng dấu phẩy. */
  /** Cookie phiên của trang game (oauth2-proxy). Để trống → script hỏi khi gặp trang Sign In. */
  gameCookie: env('GAME_COOKIE'),
  sessionCookieName: env('SESSION_COOKIE_NAME', '_oauth2_proxy'),
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
  if (!CFG.urlTemplate.includes('{id}')) fail('GAME_URL_TEMPLATE phải chứa {id}, vd https://game.internal/play/{id}');
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

function buildUrl(id) {
  return CFG.urlTemplate
    .replaceAll('{id}', encodeURIComponent(id))
    .replaceAll('{user_id}', encodeURIComponent(credentials.userId))
    .replaceAll('{token}', encodeURIComponent(credentials.token));
}

/** Che token trước khi in ra terminal / ghi vào Sheet. */
function mask(text) {
  if (!text || !credentials.token) return text;
  return text.replaceAll(encodeURIComponent(credentials.token), '***').replaceAll(credentials.token, '***');
}

async function checkGame(game) {
  const realUrl = buildUrl(game.id);
  const url = mask(realUrl);
  const started = Date.now();
  const res = await fetchUrl(realUrl);
  const ms = Date.now() - started;
  const base = { ...game, url, ms, httpStatus: res.status ?? '', finalUrl: mask(res.finalUrl), title: extractTitle(res.body) };

  if (res.error) return { ...base, result: 'ERROR', detail: res.error };
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
    // Không có tên trong danh sách → coi là không hoạt động và không ghi vào Sheet
    if (!game.name) {
      return { ...base, result: 'DEAD', detail: `Chỉ có trang "${genericTitle}", không có tên game`, skipWrite: true };
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


/** Trạng thái ghi vào cột status, kèm lý do khi lỗi. */
function statusText(r) {
  return r.result === 'OK' ? STATUS.OK : `${STATUS[r.result]} (${r.detail})`;
}

/**
 * Ghi kết quả vào tab RESULT_TAB (mặc định `game_id`) của Sheet cấu hình, 3 cột: id | name | status.
 * - name = <title> của trang khi load được; nếu không có thì dùng tên trong tab danh sách game
 * - Giữ dòng tiêu đề (dòng 1) và các cột khác; chỉ xoá & ghi lại vùng A2:C
 */
async function writeGameIdTab(client, results) {
  const sheetId = CFG.configSheetId;
  const tab = `'${CFG.resultTab}'`;
  const meta = await sheetsRequest(client, `${SHEETS_API}/${sheetId}?fields=sheets.properties.title`);
  const exists = meta.sheets.some((s) => s.properties.title === CFG.resultTab);

  if (!exists) {
    await sheetsRequest(client, `${SHEETS_API}/${sheetId}:batchUpdate`, {
      method: 'POST',
      data: { requests: [{ addSheet: { properties: { title: CFG.resultTab, gridProperties: { frozenRowCount: 1 } } } }] },
    });
    await sheetsRequest(client, `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(`${tab}!A1:C1`)}?valueInputOption=RAW`, {
      method: 'PUT',
      data: { values: [['id', 'name', 'status']] },
    });
  }

  await sheetsRequest(client, `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(`${tab}!A2:C`)}:clear`, { method: 'POST' });
  const rows = results.filter((r) => !r.skipWrite).map((r) => [r.id, (r.result === 'OK' && r.title) || r.name, statusText(r)]);
  await sheetsRequest(client, `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(`${tab}!A2`)}?valueInputOption=RAW`, {
    method: 'PUT',
    data: { values: rows },
  });
}

// ---------------------------------------------------------------- main
const NETWORK_ERRORS = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'TIMEOUT'];

async function main() {
  validateConfig();
  const mode = PARTIAL ? '  (chạy thử: không ghi Sheet)' : DRY_RUN ? '  (dry-run: không ghi Sheet)' : '';
  console.log(c.bold('\n🎮 PEAK Game Link Check') + c.dim(mode));

  const client = await getGoogleClient();
  const { title, tab, games: allGames } = await readGames(client);
  console.log(`   Danh sách game: ${title} › ${tab}`);

  // Chạy thử: chỉ lấy vài game
  let games = allGames;
  if (ONLY_IDS?.length) {
    games = ONLY_IDS.map((id) => allGames.find((g) => g.id === id) ?? { id, name: '', row: -1, col: -1 });
    const missing = games.filter((g) => g.row === -1).map((g) => g.id);
    if (missing.length) console.log(c.yellow(`   Không có trong tab "${tab}" (vẫn kiểm tra): ${missing.join(', ')}`));
  } else if (LIMIT !== null) {
    games = allGames.slice(0, Number(LIMIT));
  }
  if (PARTIAL) console.log(c.dim(`   Chạy thử ${games.length}/${allGames.length} game`));

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

  await mapLimit(games.slice(1), CFG.concurrency, async (game, i) => {
    const r = await checkGame(game);
    results[i + 1] = r;
    done++;
    print(r);
  });

  const count = (k) => results.filter((r) => r.result === k).length;
  console.log(
    `\n${c.bold('Kết quả:')} ${c.green(`${count('OK')} hoạt động`)} · ${c.red(`${count('DEAD')} không hoạt động`)} · ${c.yellow(`${count('ERROR')} lỗi kết nối`)}`,
  );
  const skipped = results.filter((r) => r.skipWrite);
  if (skipped.length) {
    console.log(c.dim(`Không ghi ${skipped.length} game (chỉ có trang đăng nhập, không có tên): ${skipped.map((r) => r.id).join(', ')}`));
  }

  if (DRY_RUN) {
    console.log(c.dim('Không ghi vào Sheet.\n'));
  } else if (count('ERROR') === results.length) {
    console.log(c.yellow('Tất cả đều lỗi kết nối — bỏ qua ghi Sheet để không ghi đè kết quả cũ.\n'));
  } else {
    await writeGameIdTab(client, results);
    console.log(c.green(`📝 Đã ghi kết quả vào tab "${CFG.resultTab}" của Sheet cấu hình`));
    console.log(c.dim(`   https://docs.google.com/spreadsheets/d/${CFG.configSheetId}/edit\n`));
  }

  // Exit code ≠ 0 khi có game lỗi → tiện dùng cho lịch chạy tự động
  process.exitCode = count('OK') === results.length ? 0 : 1;
}

main().catch((e) => fail(e.message));
