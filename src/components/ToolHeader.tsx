import { Badge, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { ToolDef } from '../tools/registry';

/** Tiêu đề trang tool — lấy icon/màu/mô tả từ registry. */
export function ToolHeader({ tool }: { tool: ToolDef }) {
  return (
    <Group gap="md" mb="xl" wrap="nowrap" align="flex-start">
      <ThemeIcon size={52} radius="lg" variant="light" color={tool.color}>
        <tool.icon size={28} stroke={1.6} />
      </ThemeIcon>
      <Stack gap={4}>
        <Group gap="xs">
          <Title order={2} fz={{ base: 22, sm: 26 }}>
            {tool.title}
          </Title>
          <Badge variant="light" color={tool.color} radius="sm">
            {tool.category}
          </Badge>
        </Group>
        <Text c="dimmed">{tool.description}</Text>
      </Stack>
    </Group>
  );
}
