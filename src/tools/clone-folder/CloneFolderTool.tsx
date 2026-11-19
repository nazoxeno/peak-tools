import { Alert, Button, Card, Code, Divider, Group, List, ScrollArea, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconExternalLink,
  IconId,
  IconPlayerStop,
  IconRocket,
  IconTag,
} from '@tabler/icons-react';
import { useState } from 'react';
import { DriveInput } from '../../components/DriveInput';
import { LogPanel } from '../../components/LogPanel';
import { ToolHeader } from '../../components/ToolHeader';
import { useAppConfig } from '../../app-config/ConfigProvider';
import { extractId } from '../../google/drive';
import { useTask } from '../../lib/taskStore';
import { useSessionState } from '../../lib/useSessionState';
import type { ToolDef } from '../registry';
import { cloneFolder, renameFromTemplate, type CloneResult } from './cloneFolder';

type Form = { gameId: string; gameName: string; source: string; target: string };
type Errors = Partial<Record<keyof Form, string>>;

export default function CloneFolderTool({ tool }: { tool: ToolDef }) {
  const [form, setForm] = useSessionState<Form>(`${tool.id}.form`, { gameId: '', gameName: '', source: '', target: '' });
  const [errors, setErrors] = useState<Errors>({});
  const task = useTask<CloneResult>(tool.id);
  const result = task.result;
  const { config } = useAppConfig();
  const { template } = config.clone;

  const setVal = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setVal(key)(e.currentTarget.value);

  const sample = `${template.gameId}-${template.gameName}-01-Document`;
  const preview = renameFromTemplate(sample, template, form.gameId.trim() || '????', form.gameName.trim() || '????');

  async function onClone() {
    const sourceFolderId = extractId(form.source);
    const targetParentId = extractId(form.target);
    const next: Errors = {
      gameId: form.gameId.trim() ? undefined : 'Bắt buộc',
      gameName: form.gameName.trim() ? undefined : 'Bắt buộc',
      source: sourceFolderId ? undefined : 'Link folder không hợp lệ',
      target: targetParentId ? undefined : 'Link folder không hợp lệ',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean) || !sourceFolderId || !targetParentId) return;

    const res = await task.run((ctx) =>
      cloneFolder({ config: config.clone, gameId: form.gameId.trim(), gameName: form.gameName.trim(), sourceFolderId, targetParentId }, ctx),
    );
    if (!res) return;
    setForm((f) => ({ ...f, gameId: '', gameName: '' }));
    notifications.show({
      color: res.failed.length ? 'orange' : 'green',
      title: res.failed.length ? `Clone xong, ${res.failed.length} mục lỗi` : 'Clone thành công',
      message: `${res.folders} folder, ${res.files} file`,
    });
  }

  return (
    <>
      <ToolHeader tool={tool} />

      <Stack gap="lg">
        <Card padding="xl">
          <Stack gap="lg">
            <div>
              <Text fw={600} mb="sm">
                1. Thông tin game
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput
                  label="Game ID"
                  placeholder="1234"
                  leftSection={<IconId size={18} />}
                  value={form.gameId}
                  onChange={set('gameId')}
                  error={errors.gameId}
                  disabled={task.running}
                />
                <TextInput
                  label="Game Name"
                  placeholder="ABC"
                  leftSection={<IconTag size={18} />}
                  value={form.gameName}
                  onChange={set('gameName')}
                  error={errors.gameName}
                  disabled={task.running}
                />
              </SimpleGrid>
              <Group gap="xs" mt="sm" wrap="wrap">
                <Text size="xs" c="dimmed">
                  Ví dụ đổi tên:
                </Text>
                <Code>{sample}</Code>
                <IconArrowRight size={14} color="var(--mantine-color-dimmed)" />
                <Code style={{ background: 'var(--mantine-color-teal-light)', color: 'var(--mantine-color-teal-light-color)' }}>{preview}</Code>
              </Group>
            </div>

            <Divider />

            <div>
              <Text fw={600} mb="sm">
                2. Thư mục
              </Text>
              <Stack gap="md">
                <DriveInput
                kind="folder"
                  label="Folder mẫu (source)"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={form.source}
                  onValueChange={setVal('source')}
                  error={errors.source}
                  disabled={task.running}
                />
                <DriveInput
                kind="folder"
                  label="Folder đích (target)"
                  description="Bản clone sẽ được tạo bên trong folder này"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={form.target}
                  onValueChange={setVal('target')}
                  error={errors.target}
                  disabled={task.running}
                />
              </Stack>
            </div>

            <Group gap="sm">
              <Button size="md" color="teal" leftSection={<IconRocket size={18} />} onClick={onClone} loading={task.running}>
                Bắt đầu clone
              </Button>
              {task.running && (
                <Button variant="subtle" color="red" size="md" leftSection={<IconPlayerStop size={18} />} onClick={task.cancel}>
                  Dừng
                </Button>
              )}
            </Group>
          </Stack>
        </Card>

        {result && (
          <Alert
            color={result.failed.length ? 'orange' : 'teal'}
            variant="light"
            icon={result.failed.length ? <IconAlertTriangle /> : <IconCircleCheck />}
            title={result.failed.length ? `Clone xong nhưng có ${result.failed.length} mục lỗi` : 'Clone thành công!'}
          >
            <Group justify="space-between" wrap="wrap" gap="sm">
              <Text size="sm">
                Đã tạo {result.folders} folder và {result.files} file.
              </Text>
              <Button
                component="a"
                href={result.url}
                target="_blank"
                rel="noreferrer"
                size="xs"
                color="teal"
                rightSection={<IconExternalLink size={14} />}
              >
                Mở thư mục mới
              </Button>
            </Group>
            {result.failed.length > 0 && (
              <ScrollArea.Autosize mah={180} mt="sm">
                <List size="xs" spacing={2}>
                  {result.failed.map((f) => (
                    <List.Item key={f.path}>
                      <Code>{f.path}</Code> — {f.error}
                    </List.Item>
                  ))}
                </List>
              </ScrollArea.Autosize>
            )}
          </Alert>
        )}

        <LogPanel logs={task.logs} running={task.running} />
      </Stack>
    </>
  );
}
