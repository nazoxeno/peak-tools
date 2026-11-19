import { Paper, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export function StatCard({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <Paper withBorder p="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.5}>
        {label}
      </Text>
      <Text fz={26} fw={700} c={color} mt={2}>
        {value}
      </Text>
    </Paper>
  );
}
