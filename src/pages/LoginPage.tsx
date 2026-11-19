import { Alert, Box, Button, Center, Group, Loader, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconAlertTriangle, IconBolt, IconBrandGoogle, IconShieldLock, IconUsers } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import { ENV } from '../env';

const FEATURES = [
  { icon: IconBolt, title: 'Tự động hoá', text: 'Clone folder, chuyển owner, định dạng Sheet chỉ với vài cú click.' },
  { icon: IconShieldLock, title: 'Chạy bằng tài khoản của bạn', text: 'Tool chỉ thao tác trên dữ liệu bạn có quyền truy cập.' },
  { icon: IconUsers, title: 'Chỉ dùng nội bộ', text: 'Chỉ tài khoản trong tổ chức mới đăng nhập được.' },
];

export function LoginPage() {
  const { status, error, signIn } = useAuth();

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0} mih="100vh">
      <Box className="login-brand" p={{ base: 32, md: 56 }} visibleFrom="md">
        <Stack justify="space-between" h="100%">
          <Logo inverted />
          <div>
            <Title order={1} c="white" fz={36} lh={1.2} maw={420}>
              Bộ công cụ nội bộ cho Google Drive &amp; Sheets
            </Title>
            <Stack gap="lg" mt={40}>
              {FEATURES.map((f) => (
                <Group key={f.title} wrap="nowrap" align="flex-start" gap="md">
                  <ThemeIcon size={40} radius="md" variant="white" color="brand">
                    <f.icon size={20} />
                  </ThemeIcon>
                  <div>
                    <Text fw={600} c="white">
                      {f.title}
                    </Text>
                    <Text size="sm" c="rgba(255,255,255,.75)">
                      {f.text}
                    </Text>
                  </div>
                </Group>
              ))}
            </Stack>
          </div>
          <Text size="xs" c="rgba(255,255,255,.6)">
            © P.E.A.K Team
          </Text>
        </Stack>
      </Box>

      <Center p="xl" style={{ background: 'var(--app-surface)' }}>
        <Stack w="100%" maw={380} gap="lg">
          <Box hiddenFrom="md">
            <Logo />
          </Box>
          <div>
            <Title order={2}>Đăng nhập</Title>
            <Text c="dimmed" mt={6}>
              Dùng tài khoản Google {ENV.orgDomain ? <b>@{ENV.orgDomain}</b> : 'công ty'} để tiếp tục.
            </Text>
          </div>

          {!ENV.googleClientId ? (
            <Alert color="red" variant="light" icon={<IconAlertTriangle />} title="Thiếu cấu hình">
              Chưa đặt biến <code>VITE_GOOGLE_CLIENT_ID</code> (file .env.local hoặc GitHub Variables).
            </Alert>
          ) : status === 'loading' ? (
            <Center py="md">
              <Loader size="sm" />
            </Center>
          ) : (
            <Button size="lg" variant="default" leftSection={<IconBrandGoogle size={20} />} onClick={signIn} fullWidth>
              Đăng nhập với Google
            </Button>
          )}

          {error && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle />}>
              {error}
            </Alert>
          )}

          <Text size="xs" c="dimmed">
            Lần đầu đăng nhập, Google sẽ hỏi quyền truy cập Drive và Sheets. Bạn có thể chọn tài khoản khác bất cứ lúc
            nào trong menu tài khoản.
          </Text>
        </Stack>
      </Center>
    </SimpleGrid>
  );
}
