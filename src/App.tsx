import { Center, Loader, Title } from '@mantine/core';
import { Suspense } from 'react';
import { ConfigProvider, useAppConfig } from './app-config/ConfigProvider';
import { useAuth } from './auth/AuthProvider';
import { AppLayout } from './layout/AppLayout';
import { useRoute } from './lib/router';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { TOOLS } from './tools/registry';

export default function App() {
  const { status } = useAuth();
  if (status !== 'signedIn') return <LoginPage />;

  return (
    <ConfigProvider>
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
  const { status } = useAppConfig();
  const tool = TOOLS.find((t) => t.id === route);

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
