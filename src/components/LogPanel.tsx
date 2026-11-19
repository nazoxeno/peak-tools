import { ActionIcon, CopyButton, Group, ScrollArea, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import type { LogEntry, LogLevel } from '../lib/taskStore';

const COLORS: Record<LogLevel, string> = {
  info: '#c9cbd6',
  success: '#5fd4a8',
  warn: '#f0c674',
  error: '#ff8a80',
};

export function LogPanel({ logs, running }: { logs: LogEntry[]; running: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
  }, [logs.length]);

  if (logs.length === 0 && !running) return null;

  const text = logs.map((l) => `[${l.time.toLocaleTimeString('vi-VN')}] ${l.message}`).join('\n');
  const counts = logs.reduce<Record<LogLevel, number>>(
    (acc, l) => ({ ...acc, [l.level]: acc[l.level] + 1 }),
    { info: 0, success: 0, warn: 0, error: 0 },
  );

  return (
    <div className="terminal" style={{ borderRadius: 'var(--mantine-radius-lg)' }}>
      <Group className="terminal-head" justify="space-between" px="md" py={8} wrap="nowrap">
        <Group gap={8} wrap="nowrap">
          <span className="terminal-dot" style={{ background: '#ff5f57' }} />
          <span className="terminal-dot" style={{ background: '#febc2e' }} />
          <span className="terminal-dot" style={{ background: '#28c840' }} />
          <Text size="xs" c="#8b8fa3" ff="monospace" ml={6}>
            live-log
          </Text>
          {running && <span className="pulse" />}
        </Group>

        <Group gap="sm" wrap="nowrap">
          <Text size="xs" ff="monospace" c="#8b8fa3">
            {logs.length} dòng
            {counts.warn > 0 && <span style={{ color: COLORS.warn }}> · {counts.warn} cảnh báo</span>}
            {counts.error > 0 && <span style={{ color: COLORS.error }}> · {counts.error} lỗi</span>}
          </Text>
          <CopyButton value={text}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Đã copy' : 'Copy log'}>
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={copy} aria-label="Copy log">
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      </Group>

      <ScrollArea h={300} viewportRef={viewport} px="md" py="sm" type="auto">
        {logs.map((l) => (
          <div key={l.id} className="terminal-line" style={{ color: COLORS[l.level] }}>
            <span style={{ color: '#5c6070' }}>{l.time.toLocaleTimeString('vi-VN')} </span>
            {l.message}
          </div>
        ))}
        {running && (
          <div className="terminal-line" style={{ color: '#5c6070' }}>
            ▍
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
