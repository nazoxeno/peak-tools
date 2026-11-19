import { Center, Loader, Title } from '@mantine/core';
import { Suspense } from 'react';
import { ConfigProvider, useAppConfig } from './app-config/ConfigProvider';
import { useAuth } from './auth/AuthProvider';
import { AppLayout } from './layout/AppLayout';
import { useRoute } from './lib/router';
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

const PageLoader = () => (
  <Center py={80}>
    <Loader />
  </Center>
);

function SignedInApp() {
  const route = useRoute();
  const { status, error } = useAppConfig();
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
  else if (route === 'settings') page = <SettingsPage />;
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
