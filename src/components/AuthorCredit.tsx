import { Group, Text, Tooltip } from '@mantine/core';
import { IconHeartFilled } from '@tabler/icons-react';
import { APP_VERSION, AUTHOR, BUILD_DATE } from '../branding';

/** Dòng "Crafted with ♥ by NazoX - 723" — dùng ở sidebar, trang đăng nhập, trang chủ. */
export function AuthorCredit({ inverted = false, showVersion = false }: { inverted?: boolean; showVersion?: boolean }) {
  const muted = inverted ? 'rgba(255,255,255,.65)' : 'dimmed';

  return (
    <Group gap={4} justify="center" wrap="nowrap">
      <Text size="xs" c={muted}>
        Crafted with
      </Text>
      <IconHeartFilled size={12} color="var(--mantine-color-pink-5)" />
      <Text size="xs" c={muted}>
        by
      </Text>
      <Text size="xs" fw={700} className={inverted ? undefined : 'author-name'} c={inverted ? 'white' : undefined}>
        {AUTHOR}
      </Text>
      {showVersion && (
        <Tooltip label={`Build ${BUILD_DATE}`}>
          <Text size="xs" c={muted} ff="monospace" ml={4}>
            · {APP_VERSION}
          </Text>
        </Tooltip>
      )}
    </Group>
  );
}
