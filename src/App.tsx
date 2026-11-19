import { Anchor, Center, Loader, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { Suspense, useEffect } from 'react';
import { ConfigProvider, useAppConfig } from './app-config/ConfigProvider';
import { useAuth } from './auth/AuthProvider';
import { CONTACT } from './branding';
import { AppLayout } from './layout/AppLayout';
import { hrefOf, useRoute } from './lib/router';
import { useRunningTasks } from './lib/taskStore';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { TOOLS } from './tools/registry';

export default function App() {
  const { status, user } = useAuth();
  if (status !== 'signedIn') return <LoginPage />;

  return (
    // key theo email → đổi tài khoản là tải lại cấu hình & kiểm tra quyền từ đầu
    <ConfigProvider key={user?.emailAddress}>
      <SignedInApp />
    </ConfigProvider>
  );
}

/** Người không có quyền sửa Sheet cấu hình vào thẳng #/settings. */
const NoPermission = () => (
  <Stack align="center" ta="center" py={80} gap="sm">
    <ThemeIcon size={56} radius="xl" variant="light" color="gray">
      <IconLock size={28} />
    </ThemeIcon>
    <Title order={3}>Không có quyền xem cấu hình</Title>
    <Text c="dimmed" size="sm" maw={420}>
      Chỉ người có quyền chỉnh sửa Google Sheet cấu hình mới xem được trang này. {CONTACT} nếu bạn cần quyền.
    </Text>
    <Anchor href={hrefOf('home')} size="sm">
      Về trang chủ
    </Anchor>
  </Stack>
);

const PageLoader = () => (
  <Center py={80}>
    <Loader />
  </Center>
);

/** Cảnh báo của trình duyệt khi đóng/tải lại tab lúc đang có tác vụ chạy. */
function useWarnBeforeUnload() {
  const running = useRunningTasks().length > 0;
  useEffect(() => {
    if (!running) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [running]);
}

function SignedInApp() {
  useWarnBeforeUnload();
  const route = useRoute();
  const { status, error, canEditConfig } = useAppConfig();
  const tool = TOOLS.find((t) => t.id === route);

  /**
   * Chỉ cho vào khi đọc được Sheet cấu hình (= được share Sheet).
   * Ngoại lệ: chạy local mà chưa đặt VITE_CONFIG_SHEET_ID → cho vào để tạo Sheet mẫu.
   */
  const allowSetup = import.meta.env.DEV && error?.kind === 'notConfigured';
  if (error && !allowSetup) return <AccessDeniedPage />; // giữ màn hình chặn cả khi đang "Thử lại"
  if (status === 'loading' && !error) return <PageLoader />;

  let page;
  if (status === 'loading') page = <PageLoader />;
  else if (route === 'home') page = <HomePage />;
  else if (route === 'settings') page = canEditConfig ? <SettingsPage /> : <NoPermission />;
  else if (tool)
    page = (
      <Suspense fallback={<PageLoader />}>
        <tool.component tool={tool} />
      </Suspense>
    );
  else
    page = (
      <Title order={3} ta="center" c="dimmed" py="xl">
        404 – Không tìm thấy trang
      </Title>
    );

  return <AppLayout route={route}>{page}</AppLayout>;
}
