import { Alert, Anchor, AppShell, Avatar, Burger, Group, Loader, Menu, NavLink, ScrollArea, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconAlertTriangle, IconHome, IconLogout, IconSelector, IconSettings, IconSwitchHorizontal } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useAppConfig } from '../app-config/ConfigProvider';
import { useAuth } from '../auth/AuthProvider';
import { AuthorCredit } from '../components/AuthorCredit';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle';
import { Logo } from '../components/Logo';
import { SessionGuard } from '../components/SessionGuard';
import { useRunningTasks } from '../lib/taskStore';
import { hrefOf } from '../lib/router';
import { TOOLS, toolsByCategory } from '../tools/registry';

/** Khung chung: sidebar navigator (tự sinh từ TOOLS) + header. */
export function AppLayout({ route, children }: { route: string; children: ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const current = TOOLS.find((t) => t.id === route);
  const { error: configError, canEditConfig } = useAppConfig();
  const running = useRunningTasks();

  return (
    <AppShell
      layout="alt"
      header={{ height: 60 }}
      navbar={{ width: 264, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={0}
    >
      <AppShell.Header style={{ background: 'var(--app-bg)', borderBottom: 'none' }}>
        <Group h="100%" px={{ base: 'md', sm: 'xl' }} justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text size="sm" c="dimmed" visibleFrom="xs">
              {current ? (
                <>
                  {current.category} <span style={{ opacity: 0.5 }}>/</span>{' '}
                  <Text span fw={600} c="var(--mantine-color-text)">
                    {current.title}
                  </Text>
                </>
              ) : (
                <Text span fw={600} c="var(--mantine-color-text)">
                  {route === 'settings' ? 'Settings' : 'Trang chủ'}
                </Text>
              )}
            </Text>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
        <AppShell.Section p="md" pb="xs">
          <Group justify="space-between" wrap="nowrap">
            <a href={hrefOf('home')} style={{ textDecoration: 'none', color: 'inherit' }} onClick={close}>
              <Logo />
            </a>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          </Group>
        </AppShell.Section>

        <AppShell.Section grow component={ScrollArea} px="sm">
          <NavLink
            className="nav-link"
            href={hrefOf('home')}
            label="Trang chủ"
            leftSection={<IconHome size={18} stroke={1.7} />}
            active={route === 'home'}
            onClick={close}
          />

          {toolsByCategory().map(([category, tools]) => (
            <div key={category}>
              <div className="nav-section-label">{category}</div>
              {tools.map((t) => (
                <NavLink
                  key={t.id}
                  className="nav-link"
                  href={hrefOf(t.id)}
                  label={t.title}
                  leftSection={<t.icon size={18} stroke={1.7} />}
                  rightSection={
                    running.includes(t.id) ? (
                      <Tooltip label="Đang chạy">
                        <Loader size={12} />
                      </Tooltip>
                    ) : undefined
                  }
                  active={route === t.id}
                  onClick={close}
                />
              ))}
            </div>
          ))}
        </AppShell.Section>

        <AppShell.Section p="sm">
          {/* Chỉ người có quyền sửa Sheet cấu hình mới thấy trang Settings */}
          {canEditConfig && (
            <NavLink
              className="nav-link"
              href={hrefOf('settings')}
              label="Settings"
              leftSection={<IconSettings size={18} stroke={1.7} />}
              active={route === 'settings'}
              onClick={close}
              mb="xs"
            />
          )}
          <UserMenu />
          <div style={{ marginTop: 10 }}>
            <AuthorCredit showVersion />
          </div>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <div style={{ maxWidth: current?.fullWidth ? '100%' : route === 'home' ? 1200 : 960, margin: '0 auto', padding: 'var(--mantine-spacing-md) var(--mantine-spacing-md) 64px' }}>
          <SessionGuard />
          {configError && route !== 'settings' && (
            <Alert color="orange" variant="light" icon={<IconAlertTriangle />} mb="lg">
              {configError.message} Đang dùng cấu hình mặc định
              {canEditConfig ? (
                <>
                  {' '}—{' '}
                  <Anchor href={hrefOf('settings')} size="sm">
                    xem trang Settings
                  </Anchor>
                  .
                </>
              ) : (
                '.'
              )}
            </Alert>
          )}
          {children}
        </div>
      </AppShell.Main>
    </AppShell>
  );
}

function UserMenu() {
  const { user, signIn, signOut } = useAuth();
  // Đổi tài khoản / đăng xuất khi đang chạy tác vụ sẽ làm hỏng tác vụ → khoá lại
  const busy = useRunningTasks().length > 0;

  return (
    <Menu position="top-start" width="target" withinPortal>
      <Menu.Target>
        <UnstyledButton className="user-card">
          <Group gap="sm" wrap="nowrap">
            <Avatar src={user?.photoLink} radius="xl" size={34} alt={user?.displayName} color="brand">
              {user?.displayName?.[0]}
            </Avatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} truncate>
                {user?.displayName}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {user?.emailAddress}
              </Text>
            </div>
            <IconSelector size={16} color="var(--mantine-color-dimmed)" />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {busy && <Menu.Label>Đang có tác vụ chạy — chờ xong hoặc bấm Dừng</Menu.Label>}
        <Menu.Item leftSection={<IconSwitchHorizontal size={16} />} onClick={signIn} disabled={busy}>
          Đổi tài khoản
        </Menu.Item>
        <Menu.Item leftSection={<IconLogout size={16} />} color="red" onClick={signOut} disabled={busy}>
          Đăng xuất
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
