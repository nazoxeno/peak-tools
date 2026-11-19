import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Center,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconExternalLink, IconMoodEmpty, IconRefresh, IconSearch } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppConfig } from '../../app-config/ConfigProvider';
import { useAuth } from '../../auth/AuthProvider';
import { CONTACT } from '../../branding';
import { ToolHeader } from '../../components/ToolHeader';
import { hrefOf } from '../../lib/router';
import { useSessionState } from '../../lib/useSessionState';
import type { ToolDef } from '../registry';
import { buildGameUrl, GAME_TAB, loadGames, needsToken, parsePrefixes, TOKEN_TAB, type Game, type GameCredentials } from './gameLauncher';

type Data = { games: Game[]; credentials: GameCredentials };

export default function GameLauncherTool({ tool }: { tool: ToolDef }) {
  const { config, canEditConfig } = useAppConfig();
  const { user } = useAuth();
  const template = config.game.urlTemplate;
  const prefixes = useMemo(() => parsePrefixes(config.game.idPrefixes), [config.game.idPrefixes]);
  const email = user?.emailAddress ?? '';

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useSessionState(`${tool.id}.query`, '');

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadGames(email));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    reload();
  }, [reload]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.games ?? [])
      .filter((g) => g.active)
      .filter((g) => !q || g.id.toLowerCase().includes(q) || g.name.toLowerCase().includes(q));
  }, [data, query]);

  const activeCount = data?.games.filter((g) => g.active).length ?? 0;
  const missingToken = Boolean(data) && needsToken(template) && !data?.credentials?.token;

  return (
    <>
      <ToolHeader tool={tool} />

      {!template && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle />} mb="lg" title="Chưa có mẫu URL game">
          {canEditConfig ? (
            <>
              Thêm key <b>game.urlTemplate</b> vào tab <b>settings</b> của Sheet cấu hình (vd{' '}
              <code>https://…/{'{id}'}/?token={'{token}'}</code>) — xem{' '}
              <Anchor href={hrefOf('settings')} size="sm">
                trang Cấu hình
              </Anchor>
              .
            </>
          ) : (
            `${CONTACT} để thiết lập.`
          )}
        </Alert>
      )}

      {missingToken && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle />} mb="lg" title="Chưa có token của bạn">
          Không tìm thấy token cho <b>{email}</b> trong tab <b>{TOKEN_TAB}</b>. {CONTACT} để được thêm token.
        </Alert>
      )}

      <Group justify="space-between" mb="md" gap="sm" wrap="wrap">
        <Group gap="sm" wrap="wrap" style={{ flex: 1 }}>
          <TextInput
            placeholder="Tìm theo ID hoặc tên game..."
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            size="sm"
            style={{ flex: 1, minWidth: 200, maxWidth: 360 }}
          />
          <Badge variant="light" color="cyan" size="lg" radius="sm">
            {activeCount} game đang hoạt động
          </Badge>
        </Group>
        <Tooltip label={`Tải lại từ tab ${GAME_TAB}`}>
          <ActionIcon variant="default" size="lg" onClick={reload} loading={loading} aria-label="Tải lại">
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {error && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle />} mb="lg">
          {error}
        </Alert>
      )}

      {loading && !data ? (
        <Center py={60}>
          <Loader />
        </Center>
      ) : visible.length === 0 ? (
        <Stack align="center" py={60} gap="xs">
          <ThemeIcon size={48} radius="xl" variant="light" color="gray">
            <IconMoodEmpty size={26} />
          </ThemeIcon>
          <Text c="dimmed" size="sm">
            {query ? 'Không có game nào khớp từ khoá.' : 'Chưa có game nào.'}
          </Text>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
          {visible.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              href={template && !missingToken ? buildGameUrl(template, g.id, data?.credentials ?? null, prefixes) : null}
            />
          ))}
        </SimpleGrid>
      )}
    </>
  );
}

function GameCard({ game, href }: { game: Game; href: string | null }) {
  const disabled = !href;
  return (
    <Paper
      component="a"
      href={href ?? undefined}
      target="_blank"
      // noreferrer: không gửi URL (chứa token) qua header Referer
      rel="noreferrer"
      withBorder
      p="sm"
      radius="md"
      className="tool-card"
      style={{ opacity: game.active ? 1 : 0.6, pointerEvents: disabled ? 'none' : undefined }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <div style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Badge variant="light" color="cyan" radius="sm" size="sm" ff="monospace">
              {game.id}
            </Badge>
            {!game.active && (
              <Badge variant="light" color="red" radius="sm" size="xs">
                Không hoạt động
              </Badge>
            )}
          </Group>
          <Text fw={600} size="sm" mt={6} truncate title={game.name}>
            {game.name || <Text span c="dimmed" fs="italic" size="sm">(chưa có tên)</Text>}
          </Text>
          {!game.active && game.status && (
            <Text size="xs" c="dimmed" truncate title={game.status}>
              {game.status}
            </Text>
          )}
        </div>
        <ThemeIcon variant="light" color={disabled ? 'gray' : 'cyan'} radius="md" size="lg">
          <IconExternalLink size={18} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}
