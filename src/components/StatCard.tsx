import { Paper, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  color,
  size = 26,
  wrap = false,
}: {
  label: string;
  value: ReactNode;
  color?: string;
  /** Cỡ chữ của giá trị (px) — giảm khi giá trị dài, vd "1920×1080" */
  size?: number;
  /** Cho phép xuống dòng thay vì cắt "…" */
  wrap?: boolean;
}) {
  return (
    <Paper withBorder p="md" miw={0}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.5} truncate>
        {label}
      </Text>
      <Text fz={size} fw={700} c={color} mt={2} truncate={!wrap} title={typeof value === 'string' ? value : undefined}>
        {value}
      </Text>
    </Paper>
  );
}
