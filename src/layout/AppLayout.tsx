import { Alert, Anchor, AppShell, Avatar, Burger, Group, Menu, NavLink, ScrollArea, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconAlertTriangle, IconHome, IconLogout, IconSelector, IconSettings, IconSwitchHorizontal } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useAppConfig } from '../app-config/ConfigProvider';
import { useAuth } from '../auth/AuthProvider';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle';
import { Logo } from '../components/Logo';
import { hrefOf } from '../lib/router';
import { TOOLS, toolsByCategory } from '../tools/registry';

/** Khung chung: sidebar navigator (tự sinh từ TOOLS) + header. */
export function AppLayout({ route, children }: { route: string; children: ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const current = TOOLS.find((t) => t.id === route);
  const { error: configError } = useAppConfig();

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
                  {route === 'settings' ? 'Cấu hình' : 'Trang chủ'}
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
                  active={route === t.id}
                  onClick={close}
                />
              ))}
            </div>
          ))}
        </AppShell.Section>

        <AppShell.Section p="sm">
          <NavLink
            className="nav-link"
            href={hrefOf('settings')}
            label="Cấu hình"
            leftSection={<IconSettings size={18} stroke={1.7} />}
            active={route === 'settings'}
            onClick={close}
            mb="xs"
          />
          <UserMenu />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 'var(--mantine-spacing-md) var(--mantine-spacing-md) 64px' }}>
          {configError && route !== 'settings' && (
            <Alert color="orange" variant="light" icon={<IconAlertTriangle />} mb="lg">
              {configError.message} Đang dùng cấu hình mặc định —{' '}
              <Anchor href={hrefOf('settings')} size="sm">
                xem trang Cấu hình
              </Anchor>
              .
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
        <Menu.Item leftSection={<IconSwitchHorizontal size={16} />} onClick={signIn}>
          Đổi tài khoản
        </Menu.Item>
        <Menu.Item leftSection={<IconLogout size={16} />} color="red" onClick={signOut}>
          Đăng xuất
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
