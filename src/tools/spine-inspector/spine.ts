/**
 * Đọc file Spine JSON (3.x / 4.x) → thông tin tóm tắt + so sánh 2 phiên bản.
 * Chỉ hỗ trợ định dạng JSON (không hỗ trợ .skel binary).
 */

type Json = Record<string, unknown>;

export type SpineAnimation = {
  name: string;
  /** Thời lượng (giây) = thời điểm keyframe lớn nhất */
  duration: number;
  bones: number;
  slots: number;
  /** Tên các event được bắn trong animation */
  events: string[];
  /** Mã băm nội dung keyframe — để phát hiện animation bị sửa dù thời lượng không đổi */
  signature: string;
};

export type SpineSkin = { name: string; attachments: number };

export type SpineInfo = {
  fileName: string;
  version: string;
  hash: string;
  width: number;
  height: number;
  bones: string[];
  slots: string[];
  skins: SpineSkin[];
  animations: SpineAnimation[];
  events: string[];
  constraints: { ik: number; transform: number; path: number; physics: number };
  imagesPath: string;
  /** Tên ảnh (region) mà các attachment dùng — chính là các file PNG cần có trong atlas */
  images: string[];
};

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const names = (list: unknown) => (Array.isArray(list) ? list.map((x) => String((x as Json)?.name ?? '')).filter(Boolean) : []);
const count = (v: unknown) => (Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : 0);

/** Thời điểm keyframe lớn nhất trong animation (duyệt mọi trường "time"). */
function maxTime(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((m: number, x) => Math.max(m, maxTime(x)), 0);
  if (!isObj(node)) return 0;
  let m = typeof node.time === 'number' ? node.time : 0;
  for (const [k, v] of Object.entries(node)) if (k !== 'time' && typeof v === 'object') m = Math.max(m, maxTime(v));
  return m;
}

/** Đếm attachment trong 1 skin: { slotName: { attachmentName: {...} } } */
function countAttachments(slotsMap: unknown) {
  if (!isObj(slotsMap)) return 0;
  return Object.values(slotsMap).reduce((n: number, atts) => n + count(atts), 0);
}

/** FNV-1a 32-bit — đủ để so sánh 2 phiên bản, không cần an toàn mật mã. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

/** Các loại attachment không dùng ảnh */
const NO_IMAGE = new Set(['clipping', 'boundingbox', 'path', 'point']);

/** Gom tên ảnh từ { slot: { attachmentName: { type, path } } } */
function collectImages(slotsMap: unknown, out: Set<string>) {
  if (!isObj(slotsMap)) return;
  for (const atts of Object.values(slotsMap)) {
    if (!isObj(atts)) continue;
    for (const [attName, att] of Object.entries(atts)) {
      const a = isObj(att) ? att : {};
      if (NO_IMAGE.has(String(a.type ?? 'region'))) continue;
      out.add(String(a.path ?? a.name ?? attName));
    }
  }
}

export function parseSpine(text: string, fileName: string): SpineInfo {
  let data: Json;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${fileName}: không phải file JSON hợp lệ (file .skel binary chưa được hỗ trợ).`);
  }
  if (!isObj(data) || (!data.skeleton && !data.bones)) {
    throw new Error(`${fileName}: không giống file Spine (thiếu "skeleton" / "bones").`);
  }

  const skeleton = isObj(data.skeleton) ? data.skeleton : {};

  // Skin: 3.8+/4.x là mảng [{ name, attachments }], 3.7- là object { skinName: { slot: { att } } }
  const skins: SpineSkin[] = Array.isArray(data.skins)
    ? data.skins.map((s: Json) => ({ name: String(s.name), attachments: countAttachments(s.attachments) }))
    : isObj(data.skins)
      ? Object.entries(data.skins).map(([name, slots]) => ({ name, attachments: countAttachments(slots) }))
      : [];

  const animations: SpineAnimation[] = isObj(data.animations)
    ? Object.entries(data.animations).map(([name, anim]) => {
        const a = isObj(anim) ? anim : {};
        const evts = Array.isArray(a.events) ? a.events.map((e: Json) => String(e.name)) : [];
        return {
          name,
          duration: Math.round(maxTime(a) * 1000) / 1000,
          bones: count(a.bones),
          slots: count(a.slots),
          events: [...new Set(evts)],
          signature: hash(JSON.stringify(a)),
        };
      })
    : [];

  const images = new Set<string>();
  if (Array.isArray(data.skins)) data.skins.forEach((s: Json) => collectImages(s.attachments, images));
  else if (isObj(data.skins)) Object.values(data.skins).forEach((slots) => collectImages(slots, images));

  return {
    fileName,
    images: [...images].sort(),
    version: String(skeleton.spine ?? '?'),
    hash: String(skeleton.hash ?? ''),
    width: Number(skeleton.width ?? 0),
    height: Number(skeleton.height ?? 0),
    imagesPath: String(skeleton.images ?? ''),
    bones: names(data.bones),
    slots: names(data.slots),
    skins,
    animations,
    events: isObj(data.events) ? Object.keys(data.events) : [],
    constraints: { ik: count(data.ik), transform: count(data.transform), path: count(data.path), physics: count(data.physics) },
  };
}

// ---------------------------------------------------------------- so sánh

export type ListDiff = { added: string[]; removed: string[] };
export type DurationChange = { name: string; before: number; after: number };

export type EventChange = { name: string; added: string[]; removed: string[] };
export type ValueChange<T> = { before: T; after: T } | null;

export type SpineDiff = {
  animations: ListDiff & {
    changed: DurationChange[];
    /** Thời lượng giữ nguyên nhưng keyframe bị sửa */
    contentChanged: string[];
    /** Animation bị thêm / bỏ event */
    eventChanges: EventChange[];
  };
  skins: ListDiff;
  bones: ListDiff;
  slots: ListDiff;
  events: ListDiff;
  images: ListDiff;
  versionChanged: boolean;
  size: ValueChange<string>;
  constraints: ValueChange<string>;
  identical: boolean;
};

function diffList(a: string[], b: string[]): ListDiff {
  const sa = new Set(a);
  const sb = new Set(b);
  return { added: b.filter((x) => !sa.has(x)), removed: a.filter((x) => !sb.has(x)) };
}

/** So sánh bản cũ (a) với bản mới (b). */
export function diffSpine(a: SpineInfo, b: SpineInfo): SpineDiff {
  const before = new Map(a.animations.map((x) => [x.name, x.duration]));
  const changed = b.animations
    .filter((x) => before.has(x.name) && Math.abs(before.get(x.name)! - x.duration) > 0.0005)
    .map((x) => ({ name: x.name, before: before.get(x.name)!, after: x.duration }));

  const old = new Map(a.animations.map((x) => [x.name, x]));
  const common = b.animations.filter((x) => old.has(x.name));
  const changedNames = new Set(changed.map((x) => x.name));
  const contentChanged = common.filter((x) => !changedNames.has(x.name) && old.get(x.name)!.signature !== x.signature).map((x) => x.name);
  const eventChanges = common
    .map((x) => ({ name: x.name, ...diffList(old.get(x.name)!.events, x.events) }))
    .filter((x) => x.added.length || x.removed.length);

  const sizeOf = (i: SpineInfo) => (i.width ? `${Math.round(i.width)}×${Math.round(i.height)}` : '—');
  const consOf = (i: SpineInfo) => `IK ${i.constraints.ik} · Transform ${i.constraints.transform} · Path ${i.constraints.path} · Physics ${i.constraints.physics}`;
  const change = (x: string, y: string): ValueChange<string> => (x === y ? null : { before: x, after: y });

  const diff: SpineDiff = {
    animations: { ...diffList(a.animations.map((x) => x.name), b.animations.map((x) => x.name)), changed, contentChanged, eventChanges },
    skins: diffList(a.skins.map((x) => x.name), b.skins.map((x) => x.name)),
    bones: diffList(a.bones, b.bones),
    slots: diffList(a.slots, b.slots),
    events: diffList(a.events, b.events),
    images: diffList(a.images, b.images),
    versionChanged: a.version !== b.version,
    size: change(sizeOf(a), sizeOf(b)),
    constraints: change(consOf(a), consOf(b)),
    identical: false,
  };
  diff.identical =
    !diff.versionChanged &&
    !diff.size &&
    !diff.constraints &&
    !changed.length &&
    !contentChanged.length &&
    !eventChanges.length &&
    [diff.animations, diff.skins, diff.bones, diff.slots, diff.events, diff.images].every((d) => !d.added.length && !d.removed.length);
  return diff;
}

export const fmtSeconds = (s: number) => `${s.toFixed(s < 10 ? 3 : 2)}s`;
