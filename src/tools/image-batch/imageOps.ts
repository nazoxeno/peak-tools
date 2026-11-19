/**
 * Xử lý ảnh ngay trên trình duyệt (canvas) — ảnh không tải lên đâu cả.
 *  - Ảnh tĩnh: cắt viền trong suốt, resize, đổi định dạng PNG / JPEG / WebP, PNG giảm màu, giới hạn dung lượng
 *  - GIF động: resize, giảm màu, bỏ bớt frame → GIF mới; hoặc tách frame PNG (.zip); hoặc ghép sprite sheet
 *  - Dãy ảnh (frame_01.png, frame_02.png…): ghép thành GIF động hoặc sprite sheet
 */
import { strToU8, zipSync } from 'fflate';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { decompressFrames, parseGIF } from 'gifuct-js';
import { encodePng8 } from './png8';

export type WorkMode = 'each' | 'sequence';
export type ResizeMode = 'none' | 'maxSide' | 'maxWidth' | 'maxHeight' | 'scale';
export type StaticFormat = 'keep' | 'png' | 'jpeg' | 'webp';
export type GifMode = 'gif' | 'frames' | 'sheet';

export type ImageOptions = {
  /** each = xử lý từng ảnh; sequence = ghép cả danh sách thành 1 animation */
  mode: WorkMode;
  /** Cắt bỏ viền trong suốt quanh ảnh */
  trim: boolean;
  /** Chừa lại N px trong suốt sau khi cắt */
  trimPadding: number;
  resizeMode: ResizeMode;
  /** px (maxSide / maxWidth / maxHeight) hoặc % (scale) */
  resizeValue: number;
  format: StaticFormat;
  /** 1–100, cho JPEG / WebP */
  quality: number;
  /** Số màu khi xuất PNG (0 = không giảm màu, lossless) */
  pngColors: number;
  /** Dung lượng tối đa mỗi file (KB, 0 = không giới hạn) */
  maxKB: number;
  gifMode: GifMode;
  /** Số màu tối đa mỗi frame GIF (ít màu → file nhỏ hơn) */
  gifColors: number;
  /** Giữ 1 frame mỗi N frame (1 = giữ tất cả). Thời lượng tổng được giữ nguyên. */
  gifFrameStep: number;
  /** Số cột sprite sheet (0 = tự động gần vuông) */
  sheetColumns: number;
  /** Dãy ảnh: xuất GIF hay sprite sheet */
  seqOutput: 'gif' | 'sheet';
  /** Dãy ảnh: số frame mỗi giây */
  seqFps: number;
};

export type TrimInfo = { x: number; y: number; width: number; height: number; sourceWidth: number; sourceHeight: number };

export type ImageResult = {
  name: string;
  blob: Blob;
  width: number;
  height: number;
  /** Thông tin thêm, vd "24 frame · 1.2s" */
  info?: string;
  /** Không đạt được giới hạn dung lượng, giữ bản nhỏ nhất */
  warning?: string;
  /** Vùng đã giữ lại sau khi cắt viền (toạ độ trên ảnh gốc) */
  trim?: TrimInfo;
};

export const DEFAULT_OPTIONS: ImageOptions = {
  mode: 'each',
  trim: false,
  trimPadding: 0,
  resizeMode: 'none',
  resizeValue: 1024,
  format: 'keep',
  quality: 85,
  pngColors: 0,
  maxKB: 0,
  gifMode: 'gif',
  gifColors: 256,
  gifFrameStep: 1,
  sheetColumns: 0,
  seqOutput: 'gif',
  seqFps: 12,
};

export const isGif = (f: File) => f.type === 'image/gif' || f.name.toLowerCase().endsWith('.gif');
const baseName = (name: string) => name.replace(/\.[^.]+$/, '');
const yieldToUi = () => new Promise((r) => setTimeout(r, 0));
/** Sắp xếp theo tên kiểu tự nhiên: frame_2 trước frame_10 */
export const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Kích thước đích — chỉ thu nhỏ, không phóng to. */
export function targetSize(w: number, h: number, o: ImageOptions) {
  const v = Math.max(1, o.resizeValue || 0);
  let scale = 1;
  if (o.resizeMode === 'maxSide') scale = v / Math.max(w, h);
  else if (o.resizeMode === 'maxWidth') scale = v / w;
  else if (o.resizeMode === 'maxHeight') scale = v / h;
  else if (o.resizeMode === 'scale') scale = v / 100;
  scale = Math.min(1, scale);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!;

/** Thu nhỏ chất lượng cao: giảm một nửa nhiều bước khi tỉ lệ lớn (tránh răng cưa). */
function resizeTo(source: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  if (source.width === w && source.height === h && source instanceof HTMLCanvasElement) return source;
  let src: CanvasImageSource = source;
  let sw = source.width;
  let sh = source.height;
  while (sw / 2 >= w && sh / 2 >= h) {
    const half = makeCanvas(Math.round(sw / 2), Math.round(sh / 2));
    const ctx = half.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, half.width, half.height);
    src = half;
    sw = half.width;
    sh = half.height;
  }
  const out = makeCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error(`Trình duyệt không xuất được định dạng ${type}`))), type, quality),
  );

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// ---------------------------------------------------------------- cắt viền

type Rect = { x: number; y: number; width: number; height: number };

/** Khung bao các pixel không trong suốt. Ảnh trong suốt hoàn toàn → null. */
function opaqueBounds(img: ImageData): Rect | null {
  const { width: w, height: h, data } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

const unionRect = (a: Rect | null, b: Rect | null): Rect | null => {
  if (!a || !b) return a ?? b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};

/** Nới khung thêm `pad` px nhưng không vượt ra ngoài ảnh gốc. */
function padRect(r: Rect, pad: number, w: number, h: number): Rect {
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  return { x, y, width: Math.min(w, r.x + r.width + pad) - x, height: Math.min(h, r.y + r.height + pad) - y };
}

function cropCanvas(src: CanvasImageSource, r: Rect) {
  const out = makeCanvas(r.width, r.height);
  out.getContext('2d')!.drawImage(src, -r.x, -r.y);
  return out;
}

const isFullRect = (r: Rect, w: number, h: number) => r.x === 0 && r.y === 0 && r.width === w && r.height === h;

// ---------------------------------------------------------------- mã hoá + giới hạn dung lượng

type Encoded = { blob: Blob; canvas: HTMLCanvasElement; note?: string };

async function encodeCanvas(c: HTMLCanvasElement, type: string, quality: number, pngColors: number): Promise<Blob> {
  if (type === 'image/jpeg') {
    // JPEG không có nền trong suốt → nền trắng
    const flat = makeCanvas(c.width, c.height);
    const ctx = flat.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(c, 0, 0);
    return toBlob(flat, type, quality / 100);
  }
  if (type === 'image/png') {
    if (pngColors > 0) {
      const { data } = ctx2d(c).getImageData(0, 0, c.width, c.height);
      return new Blob([encodePng8(data, c.width, c.height, pngColors) as Uint8Array<ArrayBuffer>], { type });
    }
    return toBlob(c, type);
  }
  return toBlob(c, type, quality / 100);
}

/** Các mức màu PNG thử lần lượt khi cần giảm dung lượng */
const PNG_STEPS = [256, 128, 64, 32, 16];

/**
 * Mã hoá ảnh; nếu có giới hạn dung lượng thì tự hạ chất lượng / số màu, cuối cùng mới thu nhỏ ảnh.
 * `allowScale=false` (vd sprite sheet) → không thu nhỏ để giữ đúng kích thước ô.
 */
async function encodeWithLimit(c: HTMLCanvasElement, type: string, o: ImageOptions, allowScale = true): Promise<Encoded & { warning?: string }> {
  const first = await encodeCanvas(c, type, o.quality, type === 'image/png' ? o.pngColors : 0);
  const limit = o.maxKB * 1024;
  if (!limit || first.size <= limit) return { blob: first, canvas: c };

  let best: Encoded = { blob: first, canvas: c };
  const keep = (e: Encoded) => {
    if (e.blob.size < best.blob.size) best = e;
  };

  let canvas = c;
  for (let pass = 0; pass < 8; pass++) {
    const scaleNote = canvas === c ? '' : ` · thu nhỏ còn ${Math.round((canvas.width / c.width) * 100)}%`;
    if (type === 'image/png') {
      const steps = PNG_STEPS.filter((n) => !o.pngColors || n <= o.pngColors);
      for (const colors of pass === 0 ? steps : [steps[0], steps[steps.length - 1]]) {
        const blob = await encodeCanvas(canvas, type, 0, colors);
        if (blob.size <= limit) return { blob, canvas, note: `PNG ${colors} màu${scaleNote}` };
        keep({ blob, canvas, note: `PNG ${colors} màu${scaleNote}` });
      }
    } else {
      // Tìm nhị phân chất lượng cao nhất mà vẫn ≤ giới hạn
      let lo = Math.min(30, o.quality);
      let hi = o.quality;
      let ok: Encoded | null = null;
      const atLo = await encodeCanvas(canvas, type, lo, 0);
      keep({ blob: atLo, canvas, note: `chất lượng ${lo}${scaleNote}` });
      if (atLo.size <= limit) {
        ok = { blob: atLo, canvas, note: `chất lượng ${lo}${scaleNote}` };
        while (hi - lo > 2) {
          const q = Math.round((lo + hi) / 2);
          const blob = await encodeCanvas(canvas, type, q, 0);
          if (blob.size <= limit) {
            lo = q;
            ok = { blob, canvas, note: `chất lượng ${q}${scaleNote}` };
          } else hi = q;
        }
        return ok;
      }
    }
    if (!allowScale) break;
    // Thu nhỏ theo tỉ lệ ước lượng từ dung lượng (dung lượng ~ diện tích)
    const ratio = Math.min(0.9, Math.max(0.5, Math.sqrt(limit / best.blob.size) * 0.97));
    const w = Math.max(1, Math.round(canvas.width * ratio));
    const h = Math.max(1, Math.round(canvas.height * ratio));
    if (w < 8 || h < 8) break;
    canvas = resizeTo(canvas, w, h);
    await yieldToUi();
  }
  return { ...best, warning: `Không nén được xuống ${o.maxKB} KB — giữ bản nhỏ nhất (${Math.round(best.blob.size / 1024)} KB)` };
}

// ---------------------------------------------------------------- ảnh tĩnh

async function processStatic(file: File, o: ImageOptions): Promise<ImageResult> {
  const bmp = await createImageBitmap(file);
  const type = o.format === 'keep' ? (EXT[file.type] ? file.type : 'image/png') : `image/${o.format}`;
  const notes: string[] = [];

  const srcW = bmp.width;
  const srcH = bmp.height;
  let canvas = makeCanvas(srcW, srcH);
  ctx2d(canvas).drawImage(bmp, 0, 0);
  bmp.close();

  let trim: TrimInfo | undefined;
  if (o.trim) {
    const bounds = opaqueBounds(ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height));
    if (bounds && !isFullRect(bounds, canvas.width, canvas.height)) {
      const r = padRect(bounds, Math.max(0, o.trimPadding), canvas.width, canvas.height);
      if (!isFullRect(r, canvas.width, canvas.height)) {
        trim = { ...r, sourceWidth: canvas.width, sourceHeight: canvas.height };
        notes.push(`cắt viền ${canvas.width}×${canvas.height} → ${r.width}×${r.height}`);
        canvas = cropCanvas(canvas, r);
      }
    }
  }

  const size = targetSize(canvas.width, canvas.height, o);
  canvas = resizeTo(canvas, size.width, size.height);

  const enc = await encodeWithLimit(canvas, type, o);
  if (enc.note) notes.push(enc.note);
  else if (type === 'image/png' && o.pngColors) notes.push(`PNG ${o.pngColors} màu`);

  // Không đổi gì về kích thước/định dạng mà file mới lại nặng hơn → giữ file gốc
  const untouched = !trim && enc.canvas.width === srcW && enc.canvas.height === srcH && type === file.type;
  if (untouched && enc.blob.size >= file.size && (!o.maxKB || file.size <= o.maxKB * 1024)) {
    return { name: file.name, blob: file, width: srcW, height: srcH, info: 'Giữ file gốc (đã tối ưu sẵn)', trim };
  }

  return {
    name: `${baseName(file.name)}.${EXT[type]}`,
    blob: enc.blob,
    width: enc.canvas.width,
    height: enc.canvas.height,
    info: notes.join(' · ') || undefined,
    warning: enc.warning,
    trim,
  };
}

// ---------------------------------------------------------------- frame (GIF / dãy ảnh)

type Frame = { image: ImageData; delay: number };
type FrameSet = { width: number; height: number; frames: Frame[] };

/** Giải mã GIF thành các frame đầy đủ (đã ghép theo disposal), mỗi frame kèm delay (ms). */
export async function decodeGif(buffer: ArrayBuffer): Promise<FrameSet> {
  const gif = parseGIF(buffer);
  const raw = decompressFrames(gif, true);
  const { width, height } = gif.lsd as unknown as { width: number; height: number };
  if (!raw.length) throw new Error('GIF không có frame nào.');

  const canvas = makeCanvas(width, height);
  const ctx = ctx2d(canvas);
  const patchCanvas = makeCanvas(1, 1);
  const patchCtx = patchCanvas.getContext('2d')!;
  const frames: Frame[] = [];

  for (const f of raw) {
    const restore = f.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;
    const { width: pw, height: ph, left, top } = f.dims;
    patchCanvas.width = pw;
    patchCanvas.height = ph;
    patchCtx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), pw, ph), 0, 0);
    ctx.drawImage(patchCanvas, left, top); // drawImage giữ nền trong suốt (putImageData thì không)

    frames.push({ image: ctx.getImageData(0, 0, width, height), delay: f.delay || 100 });

    if (f.disposalType === 2) ctx.clearRect(left, top, pw, ph);
    else if (restore) ctx.putImageData(restore, 0, 0);
    if (frames.length % 10 === 0) await yieldToUi();
  }
  return { width, height, frames };
}

/** Dãy ảnh tĩnh → frame. Ảnh khác kích thước được đặt giữa khung lớn nhất. */
async function decodeSequence(files: File[], fps: number): Promise<FrameSet> {
  const bitmaps = await Promise.all(files.map((f) => createImageBitmap(f)));
  const width = Math.max(...bitmaps.map((b) => b.width));
  const height = Math.max(...bitmaps.map((b) => b.height));
  const canvas = makeCanvas(width, height);
  const ctx = ctx2d(canvas);
  const delay = Math.round(1000 / Math.max(1, Math.min(60, fps)));
  const frames = bitmaps.map((b) => {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(b, Math.floor((width - b.width) / 2), Math.floor((height - b.height) / 2));
    b.close();
    return { image: ctx.getImageData(0, 0, width, height), delay };
  });
  return { width, height, frames };
}

/** Giữ 1 frame mỗi `step` frame; cộng dồn delay để tổng thời lượng không đổi. */
function dropFrames(frames: Frame[], step: number): Frame[] {
  if (step <= 1) return frames;
  const out: Frame[] = [];
  frames.forEach((f, i) => {
    if (i % step === 0) out.push({ ...f });
    else out[out.length - 1].delay += f.delay;
  });
  return out;
}

function frameToCanvas(frame: ImageData) {
  const c = makeCanvas(frame.width, frame.height);
  c.getContext('2d')!.putImageData(frame, 0, 0);
  return c;
}

/** Cắt viền theo khung chung của mọi frame (giữ các frame thẳng hàng), rồi resize. */
async function transformFrames(set: FrameSet, o: ImageOptions, onProgress?: (p: number) => void) {
  let rect: Rect = { x: 0, y: 0, width: set.width, height: set.height };
  let trim: TrimInfo | undefined;
  if (o.trim) {
    const bounds = set.frames.reduce<Rect | null>((u, f) => unionRect(u, opaqueBounds(f.image)), null);
    if (bounds && !isFullRect(bounds, set.width, set.height)) {
      const r = padRect(bounds, Math.max(0, o.trimPadding), set.width, set.height);
      if (!isFullRect(r, set.width, set.height)) {
        rect = r;
        trim = { ...r, sourceWidth: set.width, sourceHeight: set.height };
      }
    }
  }
  const { width, height } = targetSize(rect.width, rect.height, o);
  const unchanged = !trim && width === set.width && height === set.height;
  const frames: Frame[] = [];
  for (const [i, f] of set.frames.entries()) {
    const image = unchanged ? f.image : ctx2d(resizeTo(cropCanvas(frameToCanvas(f.image), rect), width, height)).getImageData(0, 0, width, height);
    frames.push({ image, delay: f.delay });
    onProgress?.((i + 1) / set.frames.length);
    if (i % 5 === 0) await yieldToUi();
  }
  return { width, height, frames, trim };
}

function encodeGif(frames: Frame[], width: number, height: number, colors: number) {
  const enc = GIFEncoder();
  for (const f of frames) {
    const { data } = f.image;
    const palette = quantize(data, colors, { format: 'rgba4444', oneBitAlpha: true });
    const index = applyPalette(data, palette, 'rgba4444');
    const transparentIndex = palette.findIndex((p) => p[3] === 0);
    enc.writeFrame(index, width, height, {
      palette,
      delay: f.delay,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
    });
  }
  enc.finish();
  return new Blob([enc.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
}

const GIF_STEPS = [256, 128, 64, 32, 16];

/** Xuất bộ frame thành GIF / zip frame / sprite sheet. */
async function outputFrames(
  source: FrameSet,
  name: string,
  output: GifMode,
  o: ImageOptions,
  onProgress?: (p: number) => void,
): Promise<ImageResult> {
  const kept = dropFrames(source.frames, o.gifFrameStep);
  const t = await transformFrames({ ...source, frames: kept }, o, (p) => onProgress?.(p * 0.4));
  const { width, height, frames, trim } = t;
  const totalMs = frames.reduce((n, f) => n + f.delay, 0);
  const notes = [
    `${frames.length}${frames.length !== source.frames.length ? `/${source.frames.length}` : ''} frame · ${(totalMs / 1000).toFixed(2)}s`,
  ];
  if (trim) notes.push(`cắt viền ${source.width}×${source.height} → ${trim.width}×${trim.height}`);

  if (output === 'frames') {
    const entries: Record<string, Uint8Array> = {};
    const pad = String(frames.length).length;
    const file = (i: number) => `${name}_${String(i).padStart(pad, '0')}.png`;
    for (const [i, f] of frames.entries()) {
      const blob = await encodeCanvas(frameToCanvas(f.image), 'image/png', 0, o.pngColors);
      entries[file(i)] = new Uint8Array(await blob.arrayBuffer());
      onProgress?.(0.4 + ((i + 1) / frames.length) * 0.6);
    }
    entries[`${name}_frames.json`] = strToU8(JSON.stringify({ width, height, trim, frames: frames.map((f, i) => ({ file: file(i), delay: f.delay })) }, null, 2));
    if (o.pngColors) notes.push(`PNG ${o.pngColors} màu`);
    return { name: `${name}_frames.zip`, blob: new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' }), width, height, info: notes.join(' · '), trim };
  }

  if (output === 'sheet') {
    const cols = o.sheetColumns > 0 ? Math.min(o.sheetColumns, frames.length) : Math.ceil(Math.sqrt(frames.length));
    const rows = Math.ceil(frames.length / cols);
    const sheet = makeCanvas(cols * width, rows * height);
    const ctx = sheet.getContext('2d')!;
    frames.forEach((f, i) => ctx.drawImage(frameToCanvas(f.image), (i % cols) * width, Math.floor(i / cols) * height));
    onProgress?.(0.7);
    const enc = await encodeWithLimit(sheet, 'image/png', o, false);
    onProgress?.(1);
    notes.push(`lưới ${cols}×${rows}, ô ${width}×${height}`);
    if (enc.note) notes.push(enc.note);
    else if (o.pngColors) notes.push(`PNG ${o.pngColors} màu`);
    return {
      name: `${name}_sheet_${cols}x${rows}_${width}x${height}.png`,
      blob: enc.blob,
      width: sheet.width,
      height: sheet.height,
      info: notes.join(' · '),
      warning: enc.warning,
      trim,
    };
  }

  // GIF động — có giới hạn dung lượng thì hạ số màu trước, sau đó thu nhỏ
  const limit = o.maxKB * 1024;
  let cur = { width, height, frames };
  let colors = o.gifColors;
  let blob = encodeGif(cur.frames, cur.width, cur.height, colors);
  onProgress?.(limit ? 0.6 : 1);
  for (let attempt = 0; limit && blob.size > limit && attempt < 8; attempt++) {
    await yieldToUi();
    const lower = GIF_STEPS.find((n) => n < colors && n >= 32);
    if (lower) colors = lower;
    else {
      const ratio = Math.min(0.9, Math.max(0.5, Math.sqrt(limit / blob.size) * 0.97));
      const w = Math.max(1, Math.round(cur.width * ratio));
      const h = Math.max(1, Math.round(cur.height * ratio));
      if (w < 8 || h < 8) break;
      cur = { width: w, height: h, frames: cur.frames.map((f) => ({ delay: f.delay, image: ctx2d(resizeTo(frameToCanvas(f.image), w, h)).getImageData(0, 0, w, h) })) };
    }
    blob = encodeGif(cur.frames, cur.width, cur.height, colors);
    onProgress?.(0.6 + ((attempt + 1) / 8) * 0.4);
  }
  notes.push(`${colors} màu`);
  if (cur.width !== width) notes.push(`thu nhỏ còn ${Math.round((cur.width / width) * 100)}% để vừa giới hạn`);
  return {
    name: `${name}.gif`,
    blob,
    width: cur.width,
    height: cur.height,
    info: notes.join(' · '),
    warning: limit && blob.size > limit ? `Không nén được xuống ${o.maxKB} KB — giữ bản nhỏ nhất (${Math.round(blob.size / 1024)} KB)` : undefined,
    trim,
  };
}

async function processGif(file: File, o: ImageOptions, onProgress?: (p: number) => void): Promise<ImageResult> {
  const decoded = await decodeGif(await file.arrayBuffer());
  return outputFrames(decoded, baseName(file.name), o.gifMode, o, onProgress);
}

export function processImage(file: File, o: ImageOptions, onProgress?: (p: number) => void) {
  return isGif(file) ? processGif(file, o, onProgress) : processStatic(file, o);
}

/** Ghép dãy ảnh (đã sắp theo tên) thành 1 GIF động hoặc sprite sheet. */
export async function processSequence(files: File[], o: ImageOptions, onProgress?: (p: number) => void): Promise<ImageResult> {
  if (files.length < 2) throw new Error('Cần ít nhất 2 ảnh để ghép animation.');
  const set = await decodeSequence(files, o.seqFps);
  // Tên gốc: bỏ số thứ tự ở cuối tên frame đầu, vd "run_001.png" → "run"
  const name = baseName(files[0].name).replace(/[-_ .]*\d+$/, '') || 'sequence';
  return outputFrames(set, name, o.seqOutput, o, onProgress);
}

/** Gộp nhiều kết quả thành 1 file zip (tên trùng → thêm số). Có ảnh đã cắt viền → kèm trim.json. */
export async function zipResults(results: ImageResult[]) {
  const entries: Record<string, Uint8Array> = {};
  const trims: Record<string, TrimInfo> = {};
  for (const r of results) {
    let name = r.name;
    for (let n = 2; entries[name]; n++) name = r.name.replace(/(\.[^.]+)$/, `_${n}$1`);
    entries[name] = new Uint8Array(await r.blob.arrayBuffer());
    if (r.trim) trims[name] = r.trim;
  }
  if (Object.keys(trims).length) entries['trim.json'] = strToU8(JSON.stringify(trims, null, 2));
  return new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' });
}
