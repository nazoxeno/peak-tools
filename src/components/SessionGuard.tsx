import { Alert, Button, Group, Modal, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconClockExclamation, IconRefresh } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthProvider';

/**
 * - Sắp hết hạn: banner nhỏ gợi ý gia hạn.
 * - Đã hết hạn: hộp thoại chặn — mọi request đang TẠM DỪNG, bấm "Gia hạn" để chạy tiếp.
 */
export function SessionGuard() {
  const { reauth, renewSession, signOut, user, error } = useAuth();

  return (
    <>
      {reauth === 'soon' && (
        <Alert color="yellow" variant="light" icon={<IconClockExclamation />} mb="lg">
          <Group justify="space-between" gap="sm" wrap="wrap">
            <Text size="sm">
              Phiên đăng nhập sẽ hết hạn sau vài phút — tác vụ đang chạy sẽ tạm dừng nếu chưa gia hạn.
            </Text>
            <Button size="xs" variant="light" color="yellow" leftSection={<IconRefresh size={14} />} onClick={renewSession}>
              Gia hạn ngay
            </Button>
          </Group>
        </Alert>
      )}

      <Modal
        opened={reauth === 'required'}
        onClose={() => {}}
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        centered
        radius="lg"
      >
        <Stack align="center" ta="center" gap="md" py="sm">
          <ThemeIcon size={56} radius="xl" variant="light" color="yellow">
            <IconClockExclamation size={30} />
          </ThemeIcon>
          <div>
            <Text fw={700} size="lg">
              Phiên đăng nhập đã hết hạn
            </Text>
            <Text c="dimmed" size="sm" mt={4}>
              Tác vụ đang chạy (nếu có) được tạm dừng. Gia hạn để tiếp tục từ chỗ đang dừng.
            </Text>
            <Text size="xs" c="dimmed" mt={6}>
              Tài khoản: {user?.emailAddress}
            </Text>
          </div>
          {error && (
            <Text size="xs" c="red">
              {error}
            </Text>
          )}
          <Button fullWidth size="md" leftSection={<IconRefresh size={18} />} onClick={renewSession}>
            Gia hạn &amp; tiếp tục
          </Button>
          <Button fullWidth variant="subtle" color="red" onClick={signOut}>
            Đăng xuất (huỷ tác vụ)
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
