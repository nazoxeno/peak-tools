import { ActionIcon, Box, Group, Loader, Paper, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core';
import { IconExternalLink, IconMaximize, IconRefresh } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import type { ToolDef } from '../registry';

/** Trang Spine preview được nhúng (cho phép iframe — không có X-Frame-Options / frame-ancestors). */
const SPINE_PREVIEW_URL = 'https://quylaokame.github.io/spine-preview/';

export default function SpineReviewTool({ tool }: { tool: ToolDef }) {
  const frameBox = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  // Đổi key để tải lại iframe
  const [reloadKey, setReloadKey] = useState(0);

  function reload() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap" align="center">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={40} radius="md" variant="light" color={tool.color}>
            <tool.icon size={22} stroke={1.6} />
          </ThemeIcon>
          <div>
            <Title order={3}>{tool.title}</Title>
            <Text size="sm" c="dimmed">
              {tool.description}
            </Text>
          </div>
        </Group>

        <Group gap={6} wrap="nowrap">
          <Tooltip label="Tải lại">
            <ActionIcon variant="default" size="lg" onClick={reload} aria-label="Tải lại">
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Toàn màn hình">
            <ActionIcon
              variant="default"
              size="lg"
              onClick={() => frameBox.current?.requestFullscreen?.()}
              aria-label="Toàn màn hình"
            >
              <IconMaximize size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Mở trong tab mới">
            <ActionIcon
              component="a"
              href={SPINE_PREVIEW_URL}
              target="_blank"
              rel="noreferrer"
              variant="default"
              size="lg"
              aria-label="Mở trong tab mới"
            >
              <IconExternalLink size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Paper
        ref={frameBox}
        withBorder
        radius="lg"
        style={{ position: 'relative', overflow: 'hidden', height: 'calc(100vh - 190px)', minHeight: 480, background: '#000' }}
      >
        {loading && (
          <Box
            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Loader color="gray" />
          </Box>
        )}
        <iframe
          key={reloadKey}
          src={SPINE_PREVIEW_URL}
          title={tool.title}
          onLoad={() => setLoading(false)}
          allow="fullscreen; clipboard-read; clipboard-write"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      </Paper>
    </Stack>
  );
}
