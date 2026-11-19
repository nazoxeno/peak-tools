import { Alert, Badge, Button, Card, Group, ScrollArea, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconAt,
  IconCircleCheck,
  IconPlayerStop,
  IconRocket,
  IconSearch,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useAppConfig } from '../../app-config/ConfigProvider';
import { DriveInput } from '../../components/DriveInput';
import { LogPanel } from '../../components/LogPanel';
import { StatCard } from '../../components/StatCard';
import { ToolHeader } from '../../components/ToolHeader';
import { extractId } from '../../google/drive';
import { useTask } from '../../lib/taskStore';
import { useSessionState } from '../../lib/useSessionState';
import type { ToolDef } from '../registry';
import { checkOwnership, transferFolderOwnership, type OwnershipReport } from './changeOwner';

type Result =
  | { kind: 'check'; email: string; report: OwnershipReport }
  | { kind: 'transfer'; email: string; transferred: number; skipped: number; failed: number };

export default function ChangeOwnerTool({ tool }: { tool: ToolDef }) {
  const { config } = useAppConfig();
  // Lưu theo tab trình duyệt: chuyển trang rồi quay lại vẫn còn
  const [folderUrl, setFolderUrl] = useSessionState(`${tool.id}.folder`, '');
  const [email, setEmail] = useSessionState(`${tool.id}.email`, config.changeOwner.defaultEmail);
  const [errors, setErrors] = useState<{ folder?: string; email?: string }>({});
  const [confirming, setConfirming] = useState(false);
  // Tác vụ + kết quả nằm trong store chung → không mất khi chuyển trang
  const task = useTask<Result>(tool.id);
  const result = task.result;

  function validate() {
    const folderId = extractId(folderUrl);
    const next = {
      folder: folderId ? undefined : 'Link folder không hợp lệ',
      email: /^\S+@\S+\.\S+$/.test(email.trim()) ? undefined : 'Email không hợp lệ',
    };
    setErrors(next);
    return next.folder || next.email ? null : folderId;
  }

  async function onCheck() {
    const folderId = validate();
    if (!folderId) return;
    const target = email.trim();
    const res = await task.run(async (ctx) => ({
      kind: 'check',
      email: target,
      report: await checkOwnership(folderId, target, ctx),
    }));
    if (res?.kind !== 'check') return;
    const { report } = res;
    notifications.show({
      color: report.mismatches.length ? 'orange' : 'green',
      title: 'Kiểm tra xong',
      message: report.mismatches.length
        ? `${report.mismatches.length} item không thuộc ${target}`
        : `Toàn bộ ${report.total} item đều thuộc ${target}`,
    });
  }

  function onTransferClick() {
    if (validate()) setConfirming(true);
  }

  async function onTransferConfirmed() {
    setConfirming(false);
    const folderId = validate();
    if (!folderId) return;
    const target = email.trim();
    const res = await task.run(async (ctx) => ({
      kind: 'transfer',
      email: target,
      ...(await transferFolderOwnership(folderId, target, ctx)),
    }));
    if (res?.kind !== 'transfer') return;
    notifications.show({
      color: res.failed ? 'orange' : 'green',
      title: 'Chuyển owner hoàn tất',
      message: `Đã chuyển ${res.transferred}, bỏ qua ${res.skipped}, lỗi ${res.failed}`,
    });
  }

  return (
    <>
      <ToolHeader tool={tool} />

      <Stack gap="lg">
        <Card padding="xl">
          <Stack gap="md">
            <DriveInput
                kind="folder"
              label="Folder Drive"
              description="Dán link hoặc ID của folder cần kiểm tra"
              placeholder="https://drive.google.com/drive/folders/..."
              value={folderUrl}
              onValueChange={setFolderUrl}
              error={errors.folder}
              disabled={task.running}
            />
            <TextInput
              label="Email owner mới"
              description="Khi kiểm tra: email owner mong muốn · Khi chuyển: email sẽ nhận quyền sở hữu"
              placeholder="owner@company.com"
              leftSection={<IconAt size={18} />}
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              error={errors.email}
              disabled={task.running}
            />

            {confirming ? (
              <Alert color="orange" variant="light" icon={<IconAlertTriangle />} title="Xác nhận chuyển quyền sở hữu?">
                <Text size="sm">
                  Mọi file/folder bạn đang sở hữu trong folder này sẽ được chuyển cho <b>{email.trim()}</b>. Sau khi
                  chuyển, bạn sẽ không thể tự lấy lại quyền owner.
                </Text>
                <Group mt="md" gap="sm">
                  <Button color="orange" onClick={onTransferConfirmed}>
                    Xác nhận chuyển
                  </Button>
                  <Button variant="default" onClick={() => setConfirming(false)}>
                    Huỷ
                  </Button>
                </Group>
              </Alert>
            ) : (
              <Group mt="xs" gap="sm">
                <Button leftSection={<IconSearch size={18} />} variant="light" onClick={onCheck} disabled={task.running} size="md">
                  Kiểm tra owner
                </Button>
                <Button leftSection={<IconRocket size={18} />} onClick={onTransferClick} disabled={task.running} size="md">
                  Chuyển owner
                </Button>
                {task.running && (
                  <Button variant="subtle" color="red" leftSection={<IconPlayerStop size={18} />} onClick={task.cancel} size="md">
                    Dừng
                  </Button>
                )}
              </Group>
            )}
          </Stack>
        </Card>

        {result && <ResultView result={result} />}
        <LogPanel logs={task.logs} running={task.running} />
      </Stack>
    </>
  );
}

function ResultView({ result }: { result: Result }) {
  if (result.kind === 'transfer') {
    return (
      <SimpleGrid cols={{ base: 1, xs: 3 }}>
        <StatCard label="Đã chuyển" value={result.transferred} color="green" />
        <StatCard label="Bỏ qua" value={result.skipped} />
        <StatCard label="Lỗi" value={result.failed} color={result.failed ? 'red' : undefined} />
      </SimpleGrid>
    );
  }

  const { report, email } = result;
  const ok = report.mismatches.length === 0;

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, xs: 3 }}>
        <StatCard label="Tổng item" value={report.total} />
        <StatCard label="Đúng owner" value={report.total - report.mismatches.length} color="green" />
        <StatCard label="Khác owner" value={report.mismatches.length} color={ok ? undefined : 'orange'} />
      </SimpleGrid>

      {ok ? (
        <Alert color="green" variant="light" icon={<IconCircleCheck />} title="Tất cả hợp lệ">
          Toàn bộ file/folder đều thuộc sở hữu của {email}.
        </Alert>
      ) : (
        <Card padding="lg">
          <Group justify="space-between" mb="md">
            <Title order={4}>Item không thuộc {email}</Title>
            <Group gap={6}>
              {report.owners.map((o) => (
                <Badge key={o} variant="light" color="gray" radius="sm" tt="none">
                  {o}
                </Badge>
              ))}
            </Group>
          </Group>
          <ScrollArea.Autosize mah={360}>
            <Table striped highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tên</Table.Th>
                  <Table.Th w={110}>Loại</Table.Th>
                  <Table.Th>Owner hiện tại</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {report.mismatches.map((m, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{m.name}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={m.isFolder ? 'yellow' : 'blue'} radius="sm" size="sm">
                        {m.isFolder ? 'Folder' : 'File'}
                      </Badge>
                    </Table.Td>
                    <Table.Td c="dimmed">{m.owner}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        </Card>
      )}
    </Stack>
  );
}
