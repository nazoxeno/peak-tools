import { Alert, Avatar, Button, Center, Group, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconLock, IconLogout, IconRefresh, IconSwitchHorizontal } from '@tabler/icons-react';
import { useAppConfig } from '../app-config/ConfigProvider';
import { useAuth } from '../auth/AuthProvider';
import { CONTACT } from '../branding';

/** Hiện khi tài khoản đã đăng nhập nhưng không đọc được Sheet cấu hình. */
export function AccessDeniedPage() {
  const { user, signIn, signOut } = useAuth();
  const { status, error, reload } = useAppConfig();
  const noAccess = error?.kind === 'noAccess';

  return (
    <Center mih="100vh" p="md" style={{ background: 'var(--app-bg)' }}>
      <Paper withBorder p="xl" maw={460} w="100%" shadow="sm">
        <Stack align="center" ta="center" gap="md">
          <ThemeIcon size={64} radius="xl" variant="light" color={noAccess ? 'orange' : 'red'}>
            <IconLock size={32} />
          </ThemeIcon>

          <div>
            <Title order={3}>{noAccess ? 'Bạn chưa có quyền truy cập' : 'Không thể tải ứng dụng'}</Title>
            <Text c="dimmed" size="sm" mt={6}>
              {noAccess
                ? `Tài khoản này chưa được cấp quyền sử dụng P.E.A.K Tools. ${CONTACT} để được thêm vào danh sách.`
                : error?.message}
            </Text>
          </div>

          <Group gap="sm" wrap="nowrap" p="sm" w="100%" style={{ border: '1px solid var(--app-border)', borderRadius: 'var(--mantine-radius-md)' }}>
            <Avatar src={user?.photoLink} radius="xl" size={36} color="brand">
              {user?.displayName?.[0]}
            </Avatar>
            <div style={{ minWidth: 0, textAlign: 'left' }}>
              <Text size="sm" fw={600} truncate>
                {user?.displayName}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {user?.emailAddress}
              </Text>
            </div>
          </Group>

          {noAccess && (
            <Alert variant="light" color="gray" w="100%" ta="left" p="sm">
              <Text size="xs">
                Nếu bạn đăng nhập nhiều tài khoản Google, có thể bạn đang chọn nhầm tài khoản — bấm “Đổi tài khoản”.
              </Text>
            </Alert>
          )}

          <Stack gap="xs" w="100%">
            <Button leftSection={<IconSwitchHorizontal size={18} />} onClick={signIn} fullWidth>
              Đổi tài khoản
            </Button>
            <Group grow gap="xs">
              <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={reload} loading={status === 'loading'}>
                Thử lại
              </Button>
              <Button variant="subtle" color="red" leftSection={<IconLogout size={16} />} onClick={signOut}>
                Đăng xuất
              </Button>
            </Group>
          </Stack>
        </Stack>
      </Paper>
    </Center>
  );
}
