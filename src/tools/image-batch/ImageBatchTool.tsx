import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Image,
  Modal,
  NumberInput,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconArrowsSort,
  IconArrowsUpDown,
  IconChevronDown,
  IconChevronUp,
  IconGripVertical,
  IconBolt,
  IconCrop,
  IconDownload,
  IconFileZip,
  IconGauge,
  IconGif,
  IconLayoutGrid,
  IconMovie,
  IconPhoto,
  IconPlayerPlay,
  IconResize,
  IconTrash,
  IconWorld,
  IconX,
  type Icon,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { downloadBlob, FileDropzone, formatBytes } from '../../components/FileDropzone';
import { ToolHeader } from '../../components/ToolHeader';
import { useSessionState } from '../../lib/useSessionState';
import type { ToolDef } from '../registry';
import { DEFAULT_OPTIONS, isGif, naturalSort, processImage, processSequence, zipResults, type ImageOptions, type ImageResult } from './imageOps';

type Item = {
  id: string;
  file: File;
  /** URL ảnh gốc để xem trước / so sánh */
  original: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;
  result?: ImageResult;
  preview?: string;
  error?: string;
};

type SeqState = {
  status: 'running' | 'done' | 'error';
  progress: number;
  result?: ImageResult;
  preview?: string;
  error?: string;
};

let nextId = 0;

/** Cài đặt nhanh cho các việc hay làm */
const PRESETS: {
  label: string;
  hint: string;
  icon: Icon;
  opts: Partial<ImageOptions>;
}[] = [
  {
    label: 'Nén PNG (giảm màu)',
    hint: 'Giữ định dạng, PNG giảm còn 256 màu — nhẹ đi ~60%, gần như không thấy khác.',
    icon: IconBolt,
    opts: {
      trim: false,
      resizeMode: 'none',
      format: 'keep',
      pngColors: 256,
      maxKB: 0,
    },
  },
  {
    label: 'WebP cho web',
    hint: 'Đổi sang WebP chất lượng 80 — nhẹ nhất cho web, vẫn giữ trong suốt.',
    icon: IconWorld,
    opts: {
      trim: false,
      resizeMode: 'none',
      format: 'webp',
      quality: 80,
      pngColors: 0,
      maxKB: 0,
    },
  },
  {
    label: 'Icon game ≤ 100 KB',
    hint: 'Cắt viền trong suốt (chừa 2px), cạnh dài tối đa 512px, PNG 256 màu, tối đa 100 KB.',
    icon: IconCrop,
    opts: {
      trim: true,
      trimPadding: 2,
      resizeMode: 'maxSide',
      resizeValue: 512,
      format: 'keep',
      pngColors: 256,
      maxKB: 100,
    },
  },
  {
    label: 'Thumbnail 256px',
    hint: 'Cạnh dài tối đa 256px, WebP chất lượng 80.',
    icon: IconResize,
    opts: {
      trim: false,
      resizeMode: 'maxSide',
      resizeValue: 256,
      format: 'webp',
      quality: 80,
      pngColors: 0,
      maxKB: 0,
    },
  },
];

const RESIZE_LABEL: Record<ImageOptions['resizeMode'], string> = {
  none: 'Giữ nguyên',
  maxSide: 'Cạnh dài tối đa',
  maxWidth: 'Chiều rộng tối đa',
  maxHeight: 'Chiều cao tối đa',
  scale: 'Theo tỉ lệ',
};

export default function ImageBatchTool({ tool }: { tool: ToolDef }) {
  const [stored, setOpts] = useSessionState<ImageOptions>(`${tool.id}.options`, DEFAULT_OPTIONS);
  // Bản lưu cũ có thể thiếu tuỳ chọn mới → ghép với mặc định
  const opts = useMemo(() => ({ ...DEFAULT_OPTIONS, ...stored }), [stored]);
  const [items, setItems] = useState<Item[]>([]);
  const [seq, setSeq] = useState<SeqState | null>(null);
  const [running, setRunning] = useState(false);
  const [compare, setCompare] = useState<Item | null>(null);
  /** Thứ tự frame do người dùng sắp (id). null = theo tên file */
  const [order, setOrder] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const set = <K extends keyof ImageOptions>(k: K, v: ImageOptions[K]) => setOpts((o) => ({ ...DEFAULT_OPTIONS, ...o, [k]: v }));
  const update = (id: string, patch: Partial<Item>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const isSeq = opts.mode === 'sequence';

  // Giải phóng URL xem trước khi rời trang
  const latest = useRef({ items, seq });
  useEffect(() => {
    latest.current = { items, seq };
  }, [items, seq]);
  useEffect(
    () => () => {
      latest.current.items.forEach(revokeItem);
      if (latest.current.seq?.preview) URL.revokeObjectURL(latest.current.seq.preview);
    },
    [],
  );

  const gifs = items.filter((it) => isGif(it.file));
  const statics = items.filter((it) => !isGif(it.file));
  const seqFrames = useMemo(() => {
    const byName = [...statics].sort((a, b) => naturalSort(a.file.name, b.file.name));
    if (!order) return byName;
    // Ảnh đã sắp giữ nguyên vị trí; ảnh mới thêm nối vào cuối (theo tên)
    const pos = new Map(order.map((id, i) => [id, i]));
    return [...byName.filter((it) => pos.has(it.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!), ...byName.filter((it) => !pos.has(it.id))];
  }, [statics, order]);

  /** Chuyển frame ở vị trí `from` sang vị trí `to` */
  function moveFrame(from: number, to: number) {
    if (from === to || to < 0 || to >= seqFrames.length) return;
    const ids = seqFrames.map((it) => it.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    setOrder(ids);
  }
  const done = items.filter((it) => it.result);
  const totals = done.reduce(
    (t, it) => ({
      before: t.before + it.file.size,
      after: t.after + it.result!.blob.size,
    }),
    { before: 0, after: 0 },
  );

  const pngApplies = opts.format === 'png' || opts.format === 'keep' || (gifs.length > 0 && opts.gifMode !== 'gif');
  const qualityApplies =
    !isSeq && (opts.format === 'jpeg' || opts.format === 'webp' || (opts.format === 'keep' && statics.some((it) => /jpe?g|webp/i.test(it.file.type))));

  function addFiles(files: File[]) {
    setItems((list) => [
      ...list,
      ...files.map((file) => ({
        id: String(nextId++),
        file,
        original: URL.createObjectURL(file),
        status: 'pending' as const,
        progress: 0,
      })),
    ]);
  }

  function clearAll() {
    items.forEach(revokeItem);
    if (seq?.preview) URL.revokeObjectURL(seq.preview);
    setItems([]);
    setSeq(null);
    setOrder(null);
  }

  async function run() {
    setRunning(true);
    try {
      if (isSeq) {
        if (seq?.preview) URL.revokeObjectURL(seq.preview);
        setSeq({ status: 'running', progress: 0 });
        try {
          const result = await processSequence(
            seqFrames.map((it) => it.file),
            opts,
            (p) => setSeq((s) => (s ? { ...s, progress: p } : s)),
          );
          setSeq({
            status: 'done',
            progress: 1,
            result,
            preview: result.blob.type.startsWith('image/') ? URL.createObjectURL(result.blob) : undefined,
          });
          notifications.show({
            color: 'green',
            title: 'Ghép xong',
            message: `${seqFrames.length} ảnh → ${result.name}`,
          });
        } catch (e) {
          setSeq({ status: 'error', progress: 0, error: (e as Error).message });
        }
        return;
      }
      // Chạy lần lượt để không chiếm quá nhiều bộ nhớ (GIF nhiều frame rất nặng)
      let warned = 0;
      for (const it of items) {
        if (it.preview) URL.revokeObjectURL(it.preview);
        update(it.id, {
          status: 'running',
          progress: 0,
          result: undefined,
          preview: undefined,
          error: undefined,
        });
        try {
          const result = await processImage(it.file, opts, (p) => update(it.id, { progress: p }));
          const preview = result.blob.type.startsWith('image/') ? URL.createObjectURL(result.blob) : undefined;
          if (result.warning) warned++;
          update(it.id, { status: 'done', progress: 1, result, preview });
        } catch (e) {
          update(it.id, { status: 'error', error: (e as Error).message });
        }
      }
      notifications.show({
        color: warned ? 'orange' : 'green',
        title: 'Xử lý xong',
        message: warned ? `${items.length} ảnh — ${warned} ảnh chưa đạt giới hạn dung lượng` : `${items.length} ảnh`,
      });
    } finally {
      setRunning(false);
    }
  }

  async function downloadAll() {
    if (done.length === 1) return downloadBlob(done[0].result!.blob, done[0].result!.name);
    downloadBlob(await zipResults(done.map((it) => it.result!)), 'images.zip');
  }

  const canRun = isSeq ? seqFrames.length >= 2 : items.length > 0;

  return (
    <>
      <ToolHeader tool={tool} />
      <Stack gap="lg">
        <SegmentedControl
          fullWidth
          size="md"
          value={opts.mode}
          onChange={(v) => set('mode', v as ImageOptions['mode'])}
          disabled={running}
          data={[
            {
              value: 'each',
              label: <ModeLabel icon={IconPhoto} text="Xử lý từng ảnh" />,
            },
            {
              value: 'sequence',
              label: <ModeLabel icon={IconMovie} text="Ghép dãy ảnh → GIF / sprite sheet" />,
            },
          ]}
        />

        <FileDropzone
          accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
          onFiles={addFiles}
          disabled={running}
          title={isSeq ? 'Kéo thả dãy ảnh frame_01.png, frame_02.png… vào đây' : 'Kéo thả ảnh PNG / JPG / WebP / GIF vào đây (hoặc bấm để chọn)'}
          hint={
            isSeq
              ? 'Tự xếp theo tên file (frame_2 trước frame_10), kéo thả để đổi thứ tự. Xử lý ngay trên trình duyệt — ảnh không tải lên đâu cả.'
              : 'Chọn được nhiều ảnh một lúc. Xử lý ngay trên trình duyệt — ảnh không tải lên đâu cả.'
          }
        />

        {!isSeq && (
          <div>
            <Text size="sm" fw={600} mb={6}>
              Cài đặt nhanh
            </Text>
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
              {PRESETS.map((p) => (
                <Tooltip key={p.label} label={p.hint} multiline w={260} withArrow>
                  <UnstyledButton onClick={() => setOpts((o) => ({ ...DEFAULT_OPTIONS, ...o, ...p.opts }))} disabled={running}>
                    <Paper withBorder p="sm" className="preset-card">
                      <Group gap="xs" wrap="nowrap">
                        <ThemeIcon variant="light" color={tool.color} size="md">
                          <p.icon size={16} />
                        </ThemeIcon>
                        <Text size="sm" fw={500} lh={1.2}>
                          {p.label}
                        </Text>
                      </Group>
                    </Paper>
                  </UnstyledButton>
                </Tooltip>
              ))}
            </SimpleGrid>
          </div>
        )}

        <Card padding="lg">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" verticalSpacing="lg">
            <Section step={1} icon={IconResize} title="Kích thước">
              <Switch
                checked={opts.trim}
                onChange={(e) => set('trim', e.currentTarget.checked)}
                label="Cắt viền trong suốt"
                description={
                  isSeq || gifs.length
                    ? 'Ảnh động: cắt theo khung chung của mọi frame để các frame vẫn thẳng hàng.'
                    : 'Bỏ phần trong suốt thừa quanh ảnh. Toạ độ cắt ghi vào trim.json khi tải .zip.'
                }
              />
              {opts.trim && (
                <NumberInput
                  label="Chừa lề"
                  w={160}
                  min={0}
                  max={256}
                  suffix=" px"
                  value={opts.trimPadding}
                  onChange={(v) => set('trimPadding', Number(v) || 0)}
                />
              )}
              <Group gap="sm" align="flex-end" wrap="nowrap">
                <Select
                  label="Thu nhỏ"
                  value={opts.resizeMode}
                  onChange={(v) => v && set('resizeMode', v as ImageOptions['resizeMode'])}
                  data={[
                    { value: 'none', label: 'Không thu nhỏ' },
                    { value: 'maxSide', label: 'Cạnh dài tối đa (px)' },
                    { value: 'maxWidth', label: 'Chiều rộng tối đa (px)' },
                    { value: 'maxHeight', label: 'Chiều cao tối đa (px)' },
                    { value: 'scale', label: 'Theo tỉ lệ (%)' },
                  ]}
                  allowDeselect={false}
                  style={{ flex: 1 }}
                />
                {opts.resizeMode !== 'none' && (
                  <NumberInput
                    w={120}
                    min={1}
                    max={opts.resizeMode === 'scale' ? 100 : 16384}
                    value={opts.resizeValue}
                    onChange={(v) => set('resizeValue', Number(v) || 1)}
                    suffix={opts.resizeMode === 'scale' ? '%' : ' px'}
                  />
                )}
              </Group>
              <Hint>Chỉ thu nhỏ, không phóng to. Luôn giữ tỉ lệ ảnh.</Hint>
            </Section>

            {isSeq ? (
              <Section step={2} icon={IconMovie} title="Animation">
                <SegmentedControl
                  fullWidth
                  value={opts.seqOutput}
                  onChange={(v) => set('seqOutput', v as ImageOptions['seqOutput'])}
                  data={[
                    {
                      value: 'gif',
                      label: <ModeLabel icon={IconGif} text="GIF động" />,
                    },
                    {
                      value: 'sheet',
                      label: <ModeLabel icon={IconLayoutGrid} text="Sprite sheet" />,
                    },
                  ]}
                />
                {opts.seqOutput === 'gif' ? (
                  <Group grow gap="sm" align="flex-start">
                    <NumberInput label="Tốc độ" min={1} max={60} suffix=" fps" value={opts.seqFps} onChange={(v) => set('seqFps', Number(v) || 12)} />
                    <GifColorsSelect opts={opts} set={set} />
                  </Group>
                ) : (
                  <>
                    <SheetColumnsInput opts={opts} set={set} />
                    <PngColorsSelect opts={opts} set={set} />
                  </>
                )}
                <FrameStepSelect opts={opts} set={set} />
                <Hint>Ảnh khác kích thước sẽ được đặt giữa khung lớn nhất.</Hint>
              </Section>
            ) : (
              <Section step={2} icon={IconBolt} title="Định dạng & nén">
                {
                  <div>
                    <Text size="sm" fw={500} mb={4}>
                      Xuất ảnh tĩnh dạng
                    </Text>
                    <SegmentedControl
                      fullWidth
                      value={opts.format}
                      onChange={(v) => set('format', v as ImageOptions['format'])}
                      data={[
                        { value: 'keep', label: 'Như gốc' },
                        { value: 'png', label: 'PNG' },
                        { value: 'jpeg', label: 'JPG' },
                        { value: 'webp', label: 'WebP' },
                      ]}
                    />
                    {opts.format === 'jpeg' && <Hint>JPG không có trong suốt — nền sẽ thành màu trắng.</Hint>}
                  </div>
                }
                {qualityApplies && (
                  <div>
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>
                        Chất lượng JPG / WebP
                      </Text>
                      <Badge variant="light" color={tool.color}>
                        {opts.quality}
                      </Badge>
                    </Group>
                    <Slider
                      min={40}
                      max={100}
                      value={opts.quality}
                      onChange={(v) => set('quality', v)}
                      mt={6}
                      mb="md"
                      marks={[
                        { value: 60, label: 'Nhẹ' },
                        { value: 80, label: 'Cân bằng' },
                        { value: 95, label: 'Nét' },
                      ]}
                    />
                  </div>
                )}
                {pngApplies && <PngColorsSelect opts={opts} set={set} />}
              </Section>
            )}

            <Section step={3} icon={IconGauge} title="Giới hạn dung lượng">
              <Switch
                checked={opts.maxKB > 0}
                onChange={(e) => set('maxKB', e.currentTarget.checked ? 200 : 0)}
                label="Nén mỗi file xuống dưới"
                description="Tự hạ chất lượng / số màu cho tới khi đạt. Không đủ thì mới thu nhỏ ảnh (sprite sheet giữ nguyên kích thước)."
              />
              {opts.maxKB > 0 && (
                <Group gap="xs" align="flex-end">
                  <NumberInput w={140} min={1} max={100000} suffix=" KB" value={opts.maxKB} onChange={(v) => set('maxKB', Math.max(1, Number(v) || 1))} />
                  {[50, 100, 200, 500, 1024].map((kb) => (
                    <Button key={kb} size="compact-sm" variant={opts.maxKB === kb ? 'filled' : 'default'} color={tool.color} onClick={() => set('maxKB', kb)}>
                      {kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`}
                    </Button>
                  ))}
                </Group>
              )}
            </Section>

            {!isSeq && (
              <Section step={4} icon={IconGif} title="GIF động" muted={items.length > 0 && !gifs.length} mutedText="không có GIF">
                <SegmentedControl
                  fullWidth
                  value={opts.gifMode}
                  onChange={(v) => set('gifMode', v as ImageOptions['gifMode'])}
                  data={[
                    { value: 'gif', label: 'Giữ GIF động' },
                    { value: 'frames', label: 'Tách frame' },
                    { value: 'sheet', label: 'Sprite sheet' },
                  ]}
                />
                <Group grow gap="sm" align="flex-start">
                  <FrameStepSelect opts={opts} set={set} />
                  {opts.gifMode === 'gif' && <GifColorsSelect opts={opts} set={set} />}
                  {opts.gifMode === 'sheet' && <SheetColumnsInput opts={opts} set={set} />}
                </Group>
                <Hint>
                  {opts.gifMode === 'gif' && 'Giảm số màu / bỏ bớt frame để GIF nhẹ hơn. Bỏ frame vẫn giữ nguyên tổng thời lượng.'}
                  {opts.gifMode === 'frames' && 'Mỗi frame thành 1 file PNG (giữ trong suốt) trong file .zip, kèm .json ghi delay từng frame.'}
                  {opts.gifMode === 'sheet' && 'Ghép các frame thành 1 ảnh PNG dạng lưới. Tên file ghi số cột × hàng và kích thước ô.'}
                </Hint>
              </Section>
            )}
          </SimpleGrid>

          <Pipeline opts={opts} isSeq={isSeq} hasGif={gifs.length > 0} frameCount={seqFrames.length} color={tool.color} />

          <Group mt="md" gap="sm">
            <Button size="md" leftSection={<IconPlayerPlay size={18} />} onClick={run} loading={running} disabled={!canRun} color={tool.color}>
              {isSeq ? `Ghép ${seqFrames.length} ảnh` : `Xử lý ${items.length ? `${items.length} ảnh` : ''}`}
            </Button>
            {!isSeq && done.length > 0 && !running && (
              <Button size="md" variant="light" leftSection={done.length > 1 ? <IconFileZip size={18} /> : <IconDownload size={18} />} onClick={downloadAll}>
                {done.length > 1 ? `Tải tất cả (.zip)` : 'Tải về'}
              </Button>
            )}
            {items.length > 0 && !running && (
              <Button variant="subtle" color="gray" leftSection={<IconTrash size={16} />} onClick={clearAll}>
                Xoá danh sách
              </Button>
            )}
            {!isSeq && totals.before > 0 && <SizeChange before={totals.before} after={totals.after} />}
          </Group>
          {isSeq && items.length > 0 && seqFrames.length < 2 && <Hint>Cần ít nhất 2 ảnh tĩnh (PNG / JPG / WebP) để ghép.</Hint>}
          {isSeq && gifs.length > 0 && <Hint>Bỏ qua {gifs.length} file GIF — chế độ ghép chỉ dùng ảnh tĩnh.</Hint>}
        </Card>

        {isSeq && seq && <SequenceResult seq={seq} frames={seqFrames.length} />}

        {isSeq && seqFrames.length > 1 && (
          <Group justify="space-between" mb={-8}>
            <Group gap={6}>
              <IconGripVertical size={16} color="var(--mantine-color-dimmed)" />
              <Text size="sm" c="dimmed">
                Kéo thả hoặc dùng mũi tên để đổi thứ tự frame{order ? '' : ' — đang xếp theo tên file'}.
              </Text>
            </Group>
            <Group gap="xs">
              <Button size="compact-sm" variant="default" leftSection={<IconArrowsSort size={14} />} disabled={running || !order} onClick={() => setOrder(null)}>
                Sắp theo tên
              </Button>
              <Button size="compact-sm" variant="default" leftSection={<IconArrowsUpDown size={14} />} disabled={running} onClick={() => setOrder(seqFrames.map((it) => it.id).reverse())}>
                Đảo ngược
              </Button>
            </Group>
          </Group>
        )}

        {items.length > 0 && (
          <Card padding={0}>
            <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover>
              <Table.Tbody>
                {(isSeq ? seqFrames : items).map((it, i) => (
                  <ResultRow
                    key={it.id}
                    item={it}
                    order={isSeq ? i + 1 : undefined}
                    showResult={!isSeq}
                    reorder={
                      isSeq && !running
                        ? {
                            first: i === 0,
                            last: i === seqFrames.length - 1,
                            dragging: drag?.from === i,
                            dropLine: drag && drag.over === i && drag.from !== i ? (drag.over < drag.from ? 'top' : 'bottom') : undefined,
                            move: (delta) => moveFrame(i, i + delta),
                            onDragStart: () => setDrag({ from: i, over: i }),
                            onDragEnter: () => setDrag((d) => (d ? { ...d, over: i } : d)),
                            onDrop: () => drag && moveFrame(drag.from, i),
                            onDragEnd: () => setDrag(null),
                          }
                        : undefined
                    }
                    disabled={running}
                    onCompare={() => setCompare(it)}
                    onRemove={() => {
                      revokeItem(it);
                      setItems((l) => l.filter((x) => x.id !== it.id));
                    }}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        )}
      </Stack>

      <CompareModal item={compare} onClose={() => setCompare(null)} />
    </>
  );
}

function revokeItem(it: Item) {
  URL.revokeObjectURL(it.original);
  if (it.preview) URL.revokeObjectURL(it.preview);
}

// ---------------------------------------------------------------- khối giao diện nhỏ

function ModeLabel({ icon: I, text }: { icon: Icon; text: string }) {
  return (
    <Center style={{ gap: 8 }}>
      <I size={16} />
      <span>{text}</span>
    </Center>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" c="dimmed" mt={4}>
      {children}
    </Text>
  );
}

function Section({
  step,
  icon: I,
  title,
  children,
  muted,
  mutedText,
}: {
  step: number;
  icon: Icon;
  title: string;
  children: ReactNode;
  muted?: boolean;
  mutedText?: string;
}) {
  return (
    <Paper withBorder p="md" radius="md" style={{ opacity: muted ? 0.6 : 1 }}>
      <Group gap="xs" mb="sm">
        <ThemeIcon size="sm" radius="xl" variant="filled" color="gray">
          <Text size="xs" fw={700}>
            {step}
          </Text>
        </ThemeIcon>
        <I size={16} />
        <Text fw={600} size="sm">
          {title}
        </Text>
        {muted && mutedText && (
          <Text size="xs" c="dimmed">
            ({mutedText})
          </Text>
        )}
      </Group>
      <Stack gap="sm">{children}</Stack>
    </Paper>
  );
}

type SetOpt = <K extends keyof ImageOptions>(k: K, v: ImageOptions[K]) => void;

function FrameStepSelect({ opts, set }: { opts: ImageOptions; set: SetOpt }) {
  return (
    <Select
      label="Bỏ bớt frame"
      value={String(opts.gifFrameStep)}
      onChange={(v) => v && set('gifFrameStep', Number(v))}
      data={[
        { value: '1', label: 'Giữ tất cả' },
        { value: '2', label: 'Giữ 1/2 frame' },
        { value: '3', label: 'Giữ 1/3 frame' },
        { value: '4', label: 'Giữ 1/4 frame' },
      ]}
      allowDeselect={false}
    />
  );
}

function PngColorsSelect({ opts, set }: { opts: ImageOptions; set: SetOpt }) {
  return (
    <Select
      label="PNG giảm màu (giống TinyPNG)"
      description="Giữ trong suốt, file nhẹ đi 50–70%. 256 màu gần như không thấy khác."
      value={String(opts.pngColors)}
      onChange={(v) => v && set('pngColors', Number(v))}
      data={[
        { value: '0', label: 'Không giảm (lossless)' },
        { value: '256', label: '256 màu — khuyên dùng' },
        { value: '128', label: '128 màu' },
        { value: '64', label: '64 màu' },
        { value: '32', label: '32 màu — nhẹ nhất' },
      ]}
      allowDeselect={false}
    />
  );
}

function GifColorsSelect({ opts, set }: { opts: ImageOptions; set: SetOpt }) {
  return (
    <Select
      label="Số màu GIF"
      value={String(opts.gifColors)}
      onChange={(v) => v && set('gifColors', Number(v))}
      data={['256', '128', '64', '32'].map((v) => ({
        value: v,
        label: `${v} màu`,
      }))}
      allowDeselect={false}
    />
  );
}

function SheetColumnsInput({ opts, set }: { opts: ImageOptions; set: SetOpt }) {
  return (
    <NumberInput
      label="Số cột"
      min={0}
      max={64}
      value={opts.sheetColumns}
      onChange={(v) => set('sheetColumns', Number(v) || 0)}
      placeholder="Tự động"
      description="0 = tự động (gần vuông)"
    />
  );
}

/** Tóm tắt các bước sẽ chạy, đọc từ trái sang phải. */
function Pipeline({ opts: o, isSeq, hasGif, frameCount, color }: { opts: ImageOptions; isSeq: boolean; hasGif: boolean; frameCount: number; color: string }) {
  const steps: string[] = [];
  if (isSeq) steps.push(`Ghép ${frameCount || 'N'} ảnh${o.seqOutput === 'gif' ? ` · ${o.seqFps} fps` : ''}`);
  if (o.trim) steps.push(`Cắt viền${o.trimPadding ? ` (chừa ${o.trimPadding}px)` : ''}`);
  if (o.resizeMode !== 'none') steps.push(`${RESIZE_LABEL[o.resizeMode]} ${o.resizeValue}${o.resizeMode === 'scale' ? '%' : 'px'}`);
  if (isSeq) {
    if (o.gifFrameStep > 1) steps.push(`Giữ 1/${o.gifFrameStep} frame`);
    steps.push(o.seqOutput === 'gif' ? `GIF ${o.gifColors} màu` : `Sprite sheet PNG${o.pngColors ? ` ${o.pngColors} màu` : ''}`);
  } else {
    const fmt = {
      keep: 'Giữ định dạng',
      png: 'PNG',
      jpeg: `JPG q${o.quality}`,
      webp: `WebP q${o.quality}`,
    }[o.format];
    steps.push(o.pngColors && (o.format === 'keep' || o.format === 'png') ? `${fmt} · PNG ${o.pngColors} màu` : fmt);
    if (hasGif)
      steps.push(
        {
          gif: `GIF ${o.gifColors} màu`,
          frames: 'GIF → tách frame',
          sheet: 'GIF → sprite sheet',
        }[o.gifMode],
      );
  }
  if (o.maxKB) steps.push(`≤ ${o.maxKB >= 1024 ? `${(o.maxKB / 1024).toFixed(1)} MB` : `${o.maxKB} KB`}/file`);

  return (
    <Group
      gap={6}
      mt="lg"
      p="sm"
      style={{
        borderRadius: 8,
        background: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))',
      }}
    >
      <Text size="sm" c="dimmed" mr={4}>
        Sẽ làm:
      </Text>
      {steps.map((s, i) => (
        <Group key={s} gap={6} wrap="nowrap">
          {i > 0 && <IconArrowRight size={14} color="var(--mantine-color-dimmed)" />}
          <Badge variant="light" color={color} tt="none" size="lg" fw={500}>
            {s}
          </Badge>
        </Group>
      ))}
    </Group>
  );
}

function SizeChange({ before, after }: { before: number; after: number }) {
  const diff = Math.round((after / before - 1) * 100);
  return (
    <Text size="sm" c="dimmed">
      {formatBytes(before)} → <b>{formatBytes(after)}</b>{' '}
      <Text span fw={700} c={diff <= 0 ? 'green' : 'orange'}>
        ({diff > 0 ? '+' : ''}
        {diff}%)
      </Text>
    </Text>
  );
}

function Thumb({ src, size = 48 }: { src?: string; size?: number }) {
  return src ? (
    <Image src={src} w={size} h={size} fit="contain" radius="sm" className="checker-bg" alt="" />
  ) : (
    <Center w={size} h={size}>
      <IconFileZip size={24} color="var(--mantine-color-dimmed)" />
    </Center>
  );
}

function ResultRow({
  item: it,
  order,
  showResult,
  onRemove,
  onCompare,
  disabled,
  reorder,
}: {
  item: Item;
  order?: number;
  /** Chế độ ghép dãy: kéo thả / mũi tên để đổi thứ tự */
  reorder?: {
    first: boolean;
    last: boolean;
    dragging: boolean;
    dropLine?: 'top' | 'bottom';
    move: (delta: number) => void;
    onDragStart: () => void;
    onDragEnter: () => void;
    onDrop: () => void;
    onDragEnd: () => void;
  };
  showResult: boolean;
  onRemove: () => void;
  onCompare: () => void;
  disabled: boolean;
}) {
  const r = showResult ? it.result : undefined;
  return (
    <Table.Tr
      draggable={!!reorder}
      onDragStart={
        reorder &&
        ((e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', it.id); // Firefox cần dữ liệu mới cho kéo
          reorder.onDragStart();
        })
      }
      onDragEnter={reorder && (() => reorder.onDragEnter())}
      onDragOver={reorder && ((e) => e.preventDefault())}
      onDrop={
        reorder &&
        ((e) => {
          e.preventDefault();
          reorder.onDrop();
        })
      }
      onDragEnd={reorder && (() => reorder.onDragEnd())}
      className={reorder ? 'frame-row' : undefined}
      data-dragging={reorder?.dragging || undefined}
      data-drop={reorder?.dropLine}
    >
      {order !== undefined && (
        <Table.Td w={64}>
          <Group gap={4} wrap="nowrap">
            {reorder && <IconGripVertical size={16} className="frame-grip" />}
            <Text size="xs" c="dimmed" fw={600}>
              #{order}
            </Text>
          </Group>
        </Table.Td>
      )}
      <Table.Td w={r ? 140 : 64}>
        <Tooltip label="Bấm để so sánh trước / sau" disabled={!r?.blob.type.startsWith('image/')}>
          <UnstyledButton onClick={onCompare} disabled={!r?.blob.type.startsWith('image/')}>
            <Group gap={6} wrap="nowrap">
              <Thumb src={it.original} />
              {r && (
                <>
                  <IconArrowRight size={14} color="var(--mantine-color-dimmed)" />
                  <Thumb src={it.preview} />
                </>
              )}
            </Group>
          </UnstyledButton>
        </Tooltip>
      </Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={500} truncate maw={260} title={it.file.name}>
            {r?.name ?? it.file.name}
          </Text>
          {isGif(it.file) && (
            <Badge size="xs" variant="light" color="grape">
              GIF
            </Badge>
          )}
        </Group>
        {r?.info && (
          <Text size="xs" c="dimmed">
            {r.info}
          </Text>
        )}
        {r?.warning && (
          <Group gap={4} wrap="nowrap">
            <IconAlertTriangle size={13} color="var(--mantine-color-orange-6)" />
            <Text size="xs" c="orange">
              {r.warning}
            </Text>
          </Group>
        )}
        {it.status === 'running' && showResult && <Progress value={it.progress * 100} size="xs" mt={4} animated />}
        {it.error && showResult && (
          <Text size="xs" c="red">
            {it.error}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Text size="xs" c="dimmed">
          {r ? <SizeChange before={it.file.size} after={r.blob.size} /> : formatBytes(it.file.size)}
        </Text>
        {r && (
          <Text size="xs" c="dimmed">
            {r.width}×{r.height}
          </Text>
        )}
      </Table.Td>
      <Table.Td w={reorder ? 130 : 90} ta="right">
        <Group gap={4} justify="flex-end" wrap="nowrap">
          {reorder && (
            <>
              <Tooltip label="Lên trước">
                <ActionIcon variant="subtle" color="gray" onClick={() => reorder.move(-1)} disabled={reorder.first} aria-label="Lên trước">
                  <IconChevronUp size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Xuống sau">
                <ActionIcon variant="subtle" color="gray" onClick={() => reorder.move(1)} disabled={reorder.last} aria-label="Xuống sau">
                  <IconChevronDown size={16} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
          {r && (
            <Tooltip label="Tải về">
              <ActionIcon variant="light" onClick={() => downloadBlob(r.blob, r.name)} aria-label="Tải về">
                <IconDownload size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Bỏ khỏi danh sách">
            <ActionIcon variant="subtle" color="gray" onClick={onRemove} disabled={disabled} aria-label="Bỏ">
              <IconX size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function SequenceResult({ seq, frames }: { seq: SeqState; frames: number }) {
  const r = seq.result;
  return (
    <Card padding="lg">
      <Group align="flex-start" wrap="nowrap" gap="lg">
        <Box className="checker-bg" style={{ borderRadius: 8, flexShrink: 0 }}>
          {seq.preview ? (
            <Image src={seq.preview} mah={220} maw={320} fit="contain" alt="" />
          ) : (
            <Center w={160} h={120}>
              <IconMovie size={32} color="var(--mantine-color-dimmed)" />
            </Center>
          )}
        </Box>
        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
          {seq.status === 'running' && (
            <>
              <Text fw={600}>Đang ghép {frames} ảnh…</Text>
              <Progress value={seq.progress * 100} animated />
            </>
          )}
          {seq.error && (
            <Text c="red" size="sm">
              {seq.error}
            </Text>
          )}
          {r && (
            <>
              <Text fw={600} truncate>
                {r.name}
              </Text>
              <Text size="sm" c="dimmed">
                {r.width}×{r.height} · {formatBytes(r.blob.size)}
              </Text>
              {r.info && (
                <Text size="sm" c="dimmed">
                  {r.info}
                </Text>
              )}
              {r.warning && (
                <Text size="sm" c="orange">
                  {r.warning}
                </Text>
              )}
              <Group mt="xs">
                <Button leftSection={<IconDownload size={16} />} onClick={() => downloadBlob(r.blob, r.name)}>
                  Tải về
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

function CompareModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const r = item?.result;
  const [origDims, setOrigDims] = useState('');
  return (
    <Modal opened={!!item && !!r} onClose={onClose} size="xl" title={<Text fw={600}>So sánh trước / sau — {item?.file.name}</Text>}>
      {item && r && (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {[
            { label: 'Gốc', src: item.original, size: item.file.size, dims: origDims },
            { label: 'Sau khi xử lý', src: item.preview, size: r.blob.size, dims: `${r.width}×${r.height}` },
          ].map((side, i) => (
            <Stack key={side.label} gap={6}>
              <Group justify="space-between">
                <Text fw={600} size="sm">
                  {side.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {side.dims && `${side.dims} · `}
                  {formatBytes(side.size)}
                </Text>
              </Group>
              {/* Hiện đúng kích thước thật (không phóng to) để so sánh công bằng */}
              <Center className="checker-bg" mih={200} style={{ borderRadius: 8, overflow: 'hidden' }}>
                <img
                  src={side.src}
                  alt=""
                  style={{ maxWidth: '100%', maxHeight: '60vh', display: 'block' }}
                  onLoad={i === 0 ? (e) => setOrigDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`) : undefined}
                />
              </Center>
            </Stack>
          ))}
        </SimpleGrid>
      )}
      {r?.info && (
        <Text size="sm" c="dimmed" mt="sm">
          {r.info}
        </Text>
      )}
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          Đóng
        </Button>
        {r && (
          <Button leftSection={<IconDownload size={16} />} onClick={() => downloadBlob(r.blob, r.name)}>
            Tải về
          </Button>
        )}
      </Group>
    </Modal>
  );
}
