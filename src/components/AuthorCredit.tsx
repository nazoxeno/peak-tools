import { Group, Text } from '@mantine/core';
import { IconHeartFilled } from '@tabler/icons-react';
import { AUTHOR } from '../branding';

/** Dòng "Crafted with ♥ by NazoX - 723" — dùng ở sidebar, trang đăng nhập, trang chủ. */
export function AuthorCredit({ inverted = false }: { inverted?: boolean }) {
  const muted = inverted ? 'rgba(255,255,255,.65)' : 'dimmed';

  return (
    // nowrap: không để chữ tự bẻ dòng giữa chừng khi khung hẹp (vd sidebar)
    <Group gap={4} justify="center" wrap="nowrap" style={{ whiteSpace: 'nowrap' }}>
      <Text size="xs" c={muted}>
        Crafted with
      </Text>
      <IconHeartFilled size={12} color="var(--mantine-color-pink-5)" style={{ flexShrink: 0 }} />
      <Text size="xs" c={muted}>
        by
      </Text>
      <Text size="xs" fw={700} className={inverted ? undefined : 'author-name'} c={inverted ? 'white' : undefined}>
        {AUTHOR}
      </Text>
    </Group>
  );
}
