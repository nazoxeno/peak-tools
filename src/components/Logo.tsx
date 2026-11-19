import { Group, Text } from '@mantine/core';

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="peak-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b6cff" />
          <stop offset="1" stopColor="#8b3dff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#peak-g)" />
      <path d="M14 46 L28 22 L36 34 L42 26 L50 46 Z" fill="#fff" />
      <circle cx="44" cy="18" r="4" fill="#fff" opacity=".85" />
    </svg>
  );
}

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Group gap={10} wrap="nowrap">
      <LogoMark />
      <div style={{ lineHeight: 1.1 }}>
        <Text fw={700} size="md" c={inverted ? 'white' : undefined}>
          P.E.A.K Tools
        </Text>
        <Text size="xs" c={inverted ? 'rgba(255,255,255,0.7)' : 'dimmed'}>
          Internal toolkit
        </Text>
      </div>
    </Group>
  );
}
