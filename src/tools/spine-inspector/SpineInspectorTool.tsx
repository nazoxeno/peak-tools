import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Group,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconArrowRight, IconCheck, IconCopy, IconSearch, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { FileDropzone } from '../../components/FileDropzone';
import { StatCard } from '../../components/StatCard';
import { ToolHeader } from '../../components/ToolHeader';
import type { ToolDef } from '../registry';
import { diffSpine, fmtSeconds, parseSpine, type ListDiff, type SpineInfo } from './spine';

export default function SpineInspectorTool({ tool }: { tool: ToolDef }) {
  const [files, setFiles] = useState<SpineInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState('0');

  async function onFiles(list: File[]) {
    setError(null);
    try {
      const parsed = await Promise.all(list.slice(0, 2).map(async (f) => parseSpine(await f.text(), f.name)));
      // Tối đa 2 file: file mới thêm vào thay file cũ nhất
      setFiles((prev) => [...prev, ...parsed].slice(-2));
      setActive('0');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const tabs = [
    ...files.map((f, i) => ({ value: String(i), label: f.fileName })),
    ...(files.length === 2 ? [{ value: 'diff', label: 'So sánh' }] : []),
  ];

  return (
    <>
      <ToolHeader tool={tool} />
      <Stack gap="lg">
        <FileDropzone
          accept=".json"
          onFiles={onFiles}
          title="Kéo thả file Spine .json vào đây (hoặc bấm để chọn)"
          hint="Thả 2 file (bản cũ và bản mới) để so sánh. File chỉ đọc trên trình duyệt, không tải lên đâu cả."
        />

        {error && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle />}>
            {error}
          </Alert>
        )}

        {files.length > 0 && (
          <Group justify="space-between" wrap="wrap" gap="sm">
            <SegmentedControl value={active} onChange={setActive} data={tabs} />
            <Button variant="subtle" color="gray" size="xs" leftSection={<IconTrash size={14} />} onClick={() => setFiles([])}>
              Xoá file
            </Button>
          </Group>
        )}

        {active === 'diff' && files.length === 2 ? (
          <DiffView before={files[0]} after={files[1]} />
        ) : (
          files[Number(active)] && <InfoView info={files[Number(active)]} />
        )}
      </Stack>
    </>
  );
}

function InfoView({ info }: { info: SpineInfo }) {
  const [query, setQuery] = useState('');
  const animations = useMemo(
    () => info.animations.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase())),
    [info, query],
  );
  const c = info.constraints;

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <StatCard label="Spine" value={info.version} size={20} />
        <StatCard label="Kích thước" value={info.width ? `${Math.round(info.width)} × ${Math.round(info.height)}` : '—'} size={20} wrap />
        <StatCard label="Animation" value={info.animations.length} color="grape" />
        <StatCard label="Skin" value={info.skins.length} />
        <StatCard label="Bone" value={info.bones.length} />
        <StatCard label="Slot" value={info.slots.length} />
        <StatCard label="Ảnh" value={info.images.length} />
      </SimpleGrid>
      {(c.ik || c.transform || c.path || c.physics) > 0 && (
        <Text size="xs" c="dimmed">
          Constraint: IK {c.ik} · Transform {c.transform} · Path {c.path} · Physics {c.physics}
        </Text>
      )}

      <Card padding="lg">
        <Group justify="space-between" mb="sm" wrap="wrap" gap="sm">
          <Title order={5}>Animation ({info.animations.length})</Title>
          <Group gap="xs">
            <TextInput
              size="xs"
              placeholder="Tìm animation..."
              leftSection={<IconSearch size={14} />}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
            <CopyList label="Copy tên" items={info.animations.map((a) => a.name)} />
          </Group>
        </Group>
        <ScrollArea.Autosize mah={420}>
          <Table striped highlightOnHover verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Tên</Table.Th>
                <Table.Th w={100}>Thời lượng</Table.Th>
                <Table.Th w={80}>Bone</Table.Th>
                <Table.Th w={80}>Slot</Table.Th>
                <Table.Th>Event</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {animations.map((a) => (
                <Table.Tr key={a.name}>
                  <Table.Td ff="monospace" fz="sm">
                    {a.name}
                  </Table.Td>
                  <Table.Td>{fmtSeconds(a.duration)}</Table.Td>
                  <Table.Td c="dimmed">{a.bones}</Table.Td>
                  <Table.Td c="dimmed">{a.slots}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {a.events.map((e) => (
                        <Badge key={e} size="xs" variant="light" color="orange" tt="none">
                          {e}
                        </Badge>
                      ))}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
        <Card padding="lg">
          <Group justify="space-between" mb="sm">
            <Title order={5}>Skin ({info.skins.length})</Title>
            <CopyList label="Copy tên" items={info.skins.map((s) => s.name)} />
          </Group>
          <Group gap={6}>
            {info.skins.map((s) => (
              <Badge key={s.name} variant="light" color="pink" tt="none" rightSection={<Text span size="xs" c="dimmed">{s.attachments}</Text>}>
                {s.name}
              </Badge>
            ))}
          </Group>
          <Text size="xs" c="dimmed" mt="xs">
            Số bên cạnh = số attachment trong skin.
          </Text>
        </Card>
        <Card padding="lg">
          <Group justify="space-between" mb="sm">
            <Title order={5}>Event ({info.events.length})</Title>
            <CopyList label="Copy tên" items={info.events} />
          </Group>
          {info.events.length ? (
            <Group gap={6}>
              {info.events.map((e) => (
                <Badge key={e} variant="light" color="orange" tt="none">
                  {e}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Không có event.
            </Text>
          )}
        </Card>
        <Card padding="lg">
          <Group justify="space-between" mb="sm">
            <Title order={5}>Ảnh ({info.images.length})</Title>
            <CopyList label="Copy tên ảnh" items={info.images} />
          </Group>
          <ScrollArea.Autosize mah={180}>
            <Group gap={6}>
              {info.images.map((img) => (
                <Badge key={img} variant="light" color="gray" tt="none">
                  {img}
                </Badge>
              ))}
            </Group>
          </ScrollArea.Autosize>
          <Text size="xs" c="dimmed" mt="xs">
            Tên region trong atlas mà các attachment dùng.
          </Text>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

function DiffView({ before, after }: { before: SpineInfo; after: SpineInfo }) {
  const d = useMemo(() => diffSpine(before, after), [before, after]);

  return (
    <Stack gap="lg">
      <Group gap="xs">
        <Badge variant="light" color="gray" tt="none">
          Cũ: {before.fileName}
        </Badge>
        <IconArrowRight size={14} />
        <Badge variant="light" color="grape" tt="none">
          Mới: {after.fileName}
        </Badge>
        <Text size="xs" c="dimmed">
          (thứ tự theo lúc thả file)
        </Text>
      </Group>

      {d.identical ? (
        <Alert color="green" variant="light" icon={<IconCheck />}>
          Hai file giống nhau: animation (cả keyframe), skin, ảnh, bone, slot, event, kích thước và constraint.
        </Alert>
      ) : (
        <>
          {d.versionChanged && (
            <Alert color="yellow" variant="light">
              Phiên bản Spine khác nhau: {before.version} → {after.version}
            </Alert>
          )}
          {(d.size || d.constraints) && (
            <Alert color="blue" variant="light">
              <Stack gap={2}>
                {d.size && (
                  <Text size="sm">
                    Kích thước: {d.size.before} → <b>{d.size.after}</b>
                  </Text>
                )}
                {d.constraints && (
                  <Text size="sm">
                    Constraint: {d.constraints.before} → <b>{d.constraints.after}</b>
                  </Text>
                )}
              </Stack>
            </Alert>
          )}
          <Card padding="lg">
            <Title order={5} mb="sm">
              Animation
            </Title>
            <DiffLists diff={d.animations} />
            {d.animations.changed.length > 0 && (
              <>
                <Text size="sm" fw={600} mt="md" mb={4}>
                  Đổi thời lượng ({d.animations.changed.length})
                </Text>
                <Table verticalSpacing={4}>
                  <Table.Tbody>
                    {d.animations.changed.map((x) => (
                      <Table.Tr key={x.name}>
                        <Table.Td ff="monospace" fz="sm">
                          {x.name}
                        </Table.Td>
                        <Table.Td>
                          {fmtSeconds(x.before)} → <b>{fmtSeconds(x.after)}</b>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </>
            )}
            {d.animations.contentChanged.length > 0 && (
              <>
                <Text size="sm" fw={600} mt="md" mb={4}>
                  Sửa keyframe, thời lượng giữ nguyên ({d.animations.contentChanged.length})
                </Text>
                <Group gap={4}>
                  {d.animations.contentChanged.map((x) => (
                    <Badge key={x} size="sm" color="blue" variant="light" tt="none">
                      {x}
                    </Badge>
                  ))}
                </Group>
              </>
            )}
            {d.animations.eventChanges.length > 0 && (
              <>
                <Text size="sm" fw={600} mt="md" mb={4}>
                  Đổi event trong animation ({d.animations.eventChanges.length})
                </Text>
                <Table verticalSpacing={4}>
                  <Table.Tbody>
                    {d.animations.eventChanges.map((x) => (
                      <Table.Tr key={x.name}>
                        <Table.Td ff="monospace" fz="sm" w="40%">
                          {x.name}
                        </Table.Td>
                        <Table.Td>
                          <DiffLists diff={x} />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </>
            )}
          </Card>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            {(['images', 'skins', 'events', 'bones', 'slots'] as const).map((k) => (
              <Card key={k} padding="lg">
                <Title order={5} mb="sm">
                  {{ images: 'Ảnh (attachment)', skins: 'Skin', events: 'Event', bones: 'Bone', slots: 'Slot' }[k]}
                </Title>
                <DiffLists diff={d[k]} />
              </Card>
            ))}
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}

function DiffLists({ diff }: { diff: ListDiff }) {
  if (!diff.added.length && !diff.removed.length) {
    return (
      <Text size="sm" c="dimmed">
        Không thay đổi
      </Text>
    );
  }
  return (
    <Stack gap={6}>
      {diff.added.length > 0 && (
        <Group gap={4}>
          <Text size="xs" c="green" fw={600} w={60}>
            + Thêm
          </Text>
          {diff.added.map((x) => (
            <Badge key={x} size="sm" color="green" variant="light" tt="none">
              {x}
            </Badge>
          ))}
        </Group>
      )}
      {diff.removed.length > 0 && (
        <Group gap={4}>
          <Text size="xs" c="red" fw={600} w={60}>
            − Bỏ
          </Text>
          {diff.removed.map((x) => (
            <Badge key={x} size="sm" color="red" variant="light" tt="none" td="line-through">
              {x}
            </Badge>
          ))}
        </Group>
      )}
    </Stack>
  );
}

function CopyList({ label, items }: { label: string; items: string[] }) {
  return (
    <CopyButton value={items.join('\n')}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? 'Đã copy' : `${label} (mỗi dòng 1 tên)`}>
          <ActionIcon variant="default" size="md" onClick={copy} disabled={!items.length} aria-label={label}>
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}
