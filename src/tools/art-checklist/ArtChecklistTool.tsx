import { Alert, Badge, Button, Card, Checkbox, Group, ScrollArea, SimpleGrid, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCircleCheck,
  IconExternalLink,
  IconListSearch,
  IconPlayerStop,
  IconRocket,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useAppConfig } from '../../app-config/ConfigProvider';
import { EngineNotice } from '../../components/EngineNotice';
import { DriveInput } from '../../components/DriveInput';
import { LogPanel } from '../../components/LogPanel';
import { ToolHeader } from '../../components/ToolHeader';
import { extractId } from '../../google/drive';
import { useTask } from '../../lib/taskStore';
import { useSessionState } from '../../lib/useSessionState';
import type { ToolDef } from '../registry';
import { listArtTabs, runArtChecklist, type ArtTab } from './artChecklist';

type Form = { uiFolder: string; artSource: string; sheet: string };

export default function ArtChecklistTool({ tool }: { tool: ToolDef }) {
  const { config } = useAppConfig();
  // Lưu theo tab trình duyệt: chuyển trang rồi quay lại vẫn còn
  const [form, setForm] = useSessionState<Form>(`${tool.id}.form`, { uiFolder: '', artSource: '', sheet: '' });
  const [tabs, setTabs] = useSessionState<ArtTab[] | null>(`${tool.id}.tabs`, null);
  const [selected, setSelected] = useSessionState<string[]>(`${tool.id}.selected`, []);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const task = useTask<{ ok: number; failed: number; sheetUrl: string }>(tool.id);
  const doneUrl = task.result?.sheetUrl ?? null;
  const busy = task.running || loadingTabs;

  const setVal = (key: keyof Form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key !== 'sheet') setTabs(null); // đổi folder → phải lấy lại danh sách tab
  };

  function validate() {
    const ids = { ui: extractId(form.uiFolder), art: extractId(form.artSource), sheet: extractId(form.sheet) };
    const next = {
      uiFolder: form.uiFolder.trim() && !ids.ui ? 'Link không hợp lệ' : undefined,
      artSource:
        form.artSource.trim() && !ids.art
          ? 'Link không hợp lệ'
          : !ids.ui && !ids.art
            ? 'Cần ít nhất 1 trong 2 folder'
            : undefined,
      sheet: ids.sheet ? undefined : 'Link Sheet không hợp lệ',
    };
    setErrors(next);
    return Object.values(next).some(Boolean) ? null : ids;
  }

  async function onGetTabs() {
    const ids = validate();
    if (!ids) return;
    setLoadingTabs(true);
    setListError(null);
    task.clearResult();
    try {
      const list = await listArtTabs(ids.ui, ids.art);
      setTabs(list);
      setSelected(list.map((t) => t.folderId));
    } catch (e) {
      setTabs(null);
      setListError((e as Error).message);
    } finally {
      setLoadingTabs(false);
    }
  }

  async function onRun() {
    const ids = validate();
    if (!ids || !tabs) return;
    const chosen = tabs.filter((t) => selected.includes(t.folderId));
    if (chosen.length === 0) return;
    const res = await task.run(async (ctx) => ({
      ...(await runArtChecklist({ spreadsheetId: ids.sheet!, tabs: chosen, config }, ctx)),
      sheetUrl: `https://docs.google.com/spreadsheets/d/${ids.sheet}/edit`,
    }));
    if (!res) return;
    notifications.show({
      color: res.failed ? 'orange' : 'green',
      title: 'Cập nhật checklist xong',
      message: `${res.ok} tab thành công${res.failed ? `, ${res.failed} tab lỗi` : ''}`,
    });
  }

  return (
    <>
      <ToolHeader tool={tool} />
      <EngineNotice />

      <Stack gap="lg">
        <Card padding="xl">
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <DriveInput
                kind="folder"
                label="Folder UI Assets"
                description="Folder tổng — mỗi folder con là 1 tab"
                placeholder="https://drive.google.com/drive/folders/..."
                value={form.uiFolder}
                onValueChange={setVal('uiFolder')}
                error={errors.uiFolder}
                disabled={busy}
              />
              <DriveInput
                kind="folder"
                label="Folder Art Source"
                description="Folder PSD (không bắt buộc)"
                placeholder="https://drive.google.com/drive/folders/..."
                value={form.artSource}
                onValueChange={setVal('artSource')}
                error={errors.artSource}
                disabled={busy}
              />
            </SimpleGrid>
            <DriveInput
                kind="spreadsheet"
                searchQuery="UI Checklist"
              label="Google Sheet Checklist"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={form.sheet}
              onValueChange={setVal('sheet')}
              error={errors.sheet}
              disabled={busy}
            />
            <Group>
              <Button variant="light" leftSection={<IconListSearch size={18} />} onClick={onGetTabs} loading={loadingTabs} disabled={task.running}>
                Lấy danh sách tab
              </Button>
            </Group>
            {listError && <Alert color="red" variant="light">{listError}</Alert>}
          </Stack>
        </Card>

        {tabs && (
          <Card padding="xl">
            <Group justify="space-between" mb="sm">
              <Group gap="xs">
                <Text fw={600}>Chọn tab để cập nhật</Text>
                <Badge variant="light" radius="sm">
                  {selected.length}/{tabs.length}
                </Badge>
              </Group>
              <Group gap="xs">
                <Button size="compact-sm" variant="subtle" onClick={() => setSelected(tabs.map((t) => t.folderId))} disabled={task.running}>
                  Chọn tất cả
                </Button>
                <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setSelected([])} disabled={task.running}>
                  Bỏ chọn
                </Button>
              </Group>
            </Group>

            <ScrollArea.Autosize mah={280}>
              <Checkbox.Group value={selected} onChange={setSelected}>
                <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="xs">
                  {tabs.map((t) => (
                    <Checkbox
                      key={t.folderId}
                      value={t.folderId}
                      disabled={task.running}
                      label={
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm" truncate>
                            {t.sheetName}
                          </Text>
                          {t.isPSD && (
                            <Badge size="xs" color="red" variant="light">
                              PSD
                            </Badge>
                          )}
                        </Group>
                      }
                    />
                  ))}
                </SimpleGrid>
              </Checkbox.Group>
            </ScrollArea.Autosize>

            <Group mt="lg" gap="sm">
              <Button
                size="md"
                color={tool.color}
                leftSection={<IconRocket size={18} />}
                onClick={onRun}
                loading={task.running}
                disabled={selected.length === 0 || !config.engine.scriptId}
              >
                Cập nhật checklist
              </Button>
              {task.running && (
                <Button variant="subtle" color="red" size="md" leftSection={<IconPlayerStop size={18} />} onClick={task.cancel}>
                  Dừng sau tab hiện tại
                </Button>
              )}
            </Group>
          </Card>
        )}

        {doneUrl && (
          <Alert color="green" variant="light" icon={<IconCircleCheck />} title="Đã cập nhật checklist">
            <Button component="a" href={doneUrl} target="_blank" rel="noreferrer" size="xs" color="green" rightSection={<IconExternalLink size={14} />}>
              Mở Google Sheet
            </Button>
          </Alert>
        )}

        <LogPanel logs={task.logs} running={task.running} />
      </Stack>
    </>
  );
}
