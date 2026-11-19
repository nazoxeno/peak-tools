import { Alert, Button, Card, Checkbox, Group, SimpleGrid, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCircleCheck,
  IconExternalLink,
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
import { runAnimChecklist } from './animChecklist';

type Form = { anim: string; demo: string; sheet: string };

export default function AnimChecklistTool({ tool }: { tool: ToolDef }) {
  const { config } = useAppConfig();
  // Lưu theo tab trình duyệt: chuyển trang rồi quay lại vẫn còn
  const [form, setForm] = useSessionState<Form>(`${tool.id}.form`, { anim: '', demo: '', sheet: '' });
  const [insertInCell, setInsertInCell] = useSessionState(`${tool.id}.inCell`, true);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const task = useTask<{ rows: number; demoMatched: number; sheetUrl: string }>(tool.id);
  const doneUrl = task.result?.sheetUrl ?? null;

  const setVal = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function onRun() {
    const ids = { anim: extractId(form.anim), demo: extractId(form.demo), sheet: extractId(form.sheet) };
    const next = {
      anim: form.anim.trim() && !ids.anim ? 'Link không hợp lệ' : undefined,
      demo:
        form.demo.trim() && !ids.demo ? 'Link không hợp lệ' : !ids.anim && !ids.demo ? 'Cần ít nhất 1 trong 2 folder' : undefined,
      sheet: ids.sheet ? undefined : 'Link Sheet không hợp lệ',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const res = await task.run(async (ctx) => ({
      ...(await runAnimChecklist(
        { spreadsheetId: ids.sheet!, animFolderId: ids.anim, demoFolderId: ids.demo, insertInCell, config },
        ctx,
      )),
      sheetUrl: `https://docs.google.com/spreadsheets/d/${ids.sheet}/edit`,
    }));
    if (!res) return;
    notifications.show({
      color: 'green',
      title: 'Cập nhật Anim checklist xong',
      message: [ids.anim && `${res.rows} dòng animation`, ids.demo && `${res.demoMatched} ảnh demo`].filter(Boolean).join(' · '),
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
                label="Folder Animation"
                description="Quét lại toàn bộ tab Anim_Source"
                placeholder="https://drive.google.com/drive/folders/..."
                value={form.anim}
                onValueChange={setVal('anim')}
                error={errors.anim}
                disabled={task.running}
              />
              <DriveInput
                kind="folder"
                label="Folder Demo"
                description="Chèn ảnh/GIF demo khớp theo tên"
                placeholder="https://drive.google.com/drive/folders/..."
                value={form.demo}
                onValueChange={setVal('demo')}
                error={errors.demo}
                disabled={task.running}
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
              disabled={task.running}
            />
            <Checkbox
              checked={insertInCell}
              onChange={(e) => setInsertInCell(e.currentTarget.checked)}
              disabled={task.running}
              label="Chèn ảnh Demo vào trong ô (in-cell)"
              description="Bỏ chọn để chèn ảnh nổi (over-cell), tự canh giữa ô."
            />

            <Group gap="sm" mt="xs">
              <Button
                size="md"
                color={tool.color}
                leftSection={<IconRocket size={18} />}
                onClick={onRun}
                loading={task.running}
                disabled={!config.engine.scriptId}
              >
                Chạy cập nhật
              </Button>
              {task.running && (
                <Button variant="subtle" color="red" size="md" leftSection={<IconPlayerStop size={18} />} onClick={task.cancel}>
                  Dừng
                </Button>
              )}
            </Group>
          </Stack>
        </Card>

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
