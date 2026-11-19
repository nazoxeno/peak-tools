/**
 * Nén PNG có giảm màu (PNG-8 có bảng màu + kênh alpha) — cùng ý tưởng với TinyPNG / pngquant.
 * Giảm còn ≤ 256 màu nhưng vẫn giữ trong suốt (kể cả bán trong suốt), file thường nhỏ đi 50–70%.
 */
import { zlibSync } from 'fflate';
import { quantize } from 'gifenc';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Lượng tử hoá: pixel trong suốt hoàn toàn dùng riêng 1 màu (index 0), các pixel còn lại
 * được gom thành ≤ colors-1 màu rồi tra màu gần nhất (độ chính xác đầy đủ) có dithering
 * Floyd–Steinberg để gradient không bị vỡ khối.
 */
function quantizeRgba(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, colors: number, dither: boolean) {
  const total = width * height;
  let visible = 0;
  for (let i = 0; i < total; i++) if (rgba[i * 4 + 3] > 0) visible++;
  const hasClear = visible < total;
  const index = new Uint8Array(total);
  if (!visible) return { palette: [[0, 0, 0, 0]], index };

  const sub = new Uint8Array(visible * 4);
  for (let i = 0, j = 0; i < total; i++) if (rgba[i * 4 + 3] > 0) sub.set(rgba.subarray(i * 4, i * 4 + 4), 4 * j++);
  const found = quantize(sub, Math.max(1, colors - (hasClear ? 1 : 0)), { format: 'rgba4444', clearAlpha: false });
  const palette = hasClear ? [[0, 0, 0, 0], ...found] : found;
  const pr = palette.map((p) => p[0]);
  const pg = palette.map((p) => p[1]);
  const pb = palette.map((p) => p[2]);
  const pa = palette.map((p) => p[3] ?? 255);

  // Bộ nhớ đệm tra màu theo khoá 5 bit mỗi kênh
  const cache = new Int16Array(1 << 20).fill(-1);
  const nearest = (r: number, g: number, b: number, a: number) => {
    const key = ((r >> 3) << 15) | ((g >> 3) << 10) | ((b >> 3) << 5) | (a >> 3);
    let best = cache[key];
    if (best >= 0) return best;
    let bestD = Infinity;
    for (let k = hasClear ? 1 : 0; k < palette.length; k++) {
      const dr = r - pr[k];
      const dg = g - pg[k];
      const db = b - pb[k];
      const da = a - pa[k];
      const d = dr * dr + dg * dg + db * db + da * da * 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    cache[key] = best;
    return best;
  };

  const strength = dither ? 0.85 : 0;
  let cur = new Float32Array((width + 2) * 4);
  let next = new Float32Array((width + 2) * 4);
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (let y = 0; y < height; y++) {
    next.fill(0);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] === 0) continue; // index 0 = trong suốt
      const e = (x + 1) * 4;
      const r = clamp(rgba[i] + cur[e]);
      const g = clamp(rgba[i + 1] + cur[e + 1]);
      const b = clamp(rgba[i + 2] + cur[e + 2]);
      const a = clamp(rgba[i + 3] + cur[e + 3]);
      const k = nearest(r, g, b, a);
      index[y * width + x] = k;
      if (!strength) continue;
      const err = [(r - pr[k]) * strength, (g - pg[k]) * strength, (b - pb[k]) * strength, (a - pa[k]) * strength];
      for (let c = 0; c < 4; c++) {
        cur[e + 4 + c] += (err[c] * 7) / 16;
        next[e - 4 + c] += (err[c] * 3) / 16;
        next[e + c] += (err[c] * 5) / 16;
        next[e + 4 + c] += err[c] / 16;
      }
    }
    [cur, next] = [next, cur];
  }
  return { palette, index };
}

/** RGBA → file PNG-8 (bytes). `colors`: 2–256. */
export function encodePng8(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, colors: number, dither = true): Uint8Array {
  const { palette, index } = quantizeRgba(rgba, width, height, Math.max(2, Math.min(256, colors)), dither);

  // Bit depth nhỏ hơn khi ít màu → file nhỏ hơn nữa
  const depth = palette.length <= 2 ? 1 : palette.length <= 4 ? 2 : palette.length <= 16 ? 4 : 8;
  const perByte = 8 / depth;
  const rowBytes = Math.ceil(width / perByte);
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (rowBytes + 1); // byte đầu dòng = filter 0 (None) — tốt nhất cho ảnh bảng màu
    for (let x = 0; x < width; x++) {
      const v = index[y * width + x];
      if (depth === 8) raw[o + 1 + x] = v;
      else raw[o + 1 + Math.floor(x / perByte)] |= v << (8 - depth * (1 + (x % perByte)));
    }
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr.set([depth, 3, 0, 0, 0], 8); // color type 3 = indexed

  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((p, i) => plte.set([p[0], p[1], p[2]], i * 3));

  // tRNS: alpha từng màu, bỏ các màu đục ở cuối danh sách
  let last = -1;
  palette.forEach((p, i) => (p[3] ?? 255) < 255 && (last = i));
  const trns = new Uint8Array(last + 1);
  for (let i = 0; i <= last; i++) trns[i] = palette[i][3] ?? 255;

  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    ...(trns.length ? [chunk('tRNS', trns)] : []),
    chunk('IDAT', zlibSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
