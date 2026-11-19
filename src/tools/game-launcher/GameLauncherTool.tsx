import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Center,
  Group,
  Kbd,
  Loader,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconClockHour4,
  IconExternalLink,
  IconMoodEmpty,
  IconRefresh,
  IconSearch,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppConfig } from '../../app-config/ConfigProvider';
import { useAuth } from '../../auth/AuthProvider';
import { CONTACT } from '../../branding';
import { ToolHeader } from '../../components/ToolHeader';
import { hrefOf } from '../../lib/router';
import { useLocalState } from '../../lib/useLocalState';
import { useSessionState } from '../../lib/useSessionState';
import type { ToolDef } from '../registry';
import { buildGameUrl, GAME_TAB, loadGames, needsToken, parsePrefixes, TOKEN_TAB, type Game, type GameCredentials } from './gameLauncher';

type Data = { games: Game[]; credentials: GameCredentials };
/** Lịch sử mở game (lưu trên trình duyệt): id → lần mở gần nhất + số lần mở */
type History = Record<string, { last: number; count: number }>;
type SortMode = 'id' | 'most' | 'recent';

const RECENT_LIMIT = 6;

/** "vừa xong", "5 phút trước", "3 ngày trước"… */
function timeAgo(t: number) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} ngày trước`;
  return new Date(t).toLocaleDateString('vi-VN');
}

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
  const [favorites, setFavorites] = useLocalState<string[]>(`${tool.id}.favorites`, []);
  const [history, setHistory] = useLocalState<History>(`${tool.id}.history`, {});
  const [sort, setSort] = useLocalState<SortMode>(`${tool.id}.sort`, 'id');
  const searchRef = useRef<HTMLInputElement>(null);

  const isFav = useCallback((id: string) => favorites.includes(id), [favorites]);
  const toggleFav = (id: string) => setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const markOpened = (id: string) => setHistory((h) => ({ ...h, [id]: { last: Date.now(), count: (h[id]?.count ?? 0) + 1 } }));

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

  const q = query.trim().toLowerCase();
  const matches = useCallback((g: Game) => !q || g.id.toLowerCase().includes(q) || g.name.toLowerCase().includes(q), [q]);

  // Đã đánh dấu: hiện cả game đang không hoạt động để biết mà bỏ đánh dấu; giữ thứ tự lúc đánh dấu
  const favGames = useMemo(() => {
    const byId = new Map((data?.games ?? []).map((g) => [g.id, g]));
    return favorites.map((id) => byId.get(id)).filter((g): g is Game => !!g && matches(g));
  }, [data, favorites, matches]);

  const others = useMemo(() => {
    const list = (data?.games ?? []).filter((g) => g.active && !isFav(g.id) && matches(g));
    if (sort === 'most') return [...list].sort((a, b) => (history[b.id]?.count ?? 0) - (history[a.id]?.count ?? 0));
    if (sort === 'recent') return [...list].sort((a, b) => (history[b.id]?.last ?? 0) - (history[a.id]?.last ?? 0));
    return list;
  }, [data, isFav, matches, sort, history]);

  const recent = useMemo(() => {
    const byId = new Map((data?.games ?? []).filter((g) => g.active).map((g) => [g.id, g]));
    return Object.entries(history)
      .sort((a, b) => b[1].last - a[1].last)
      .map(([id]) => byId.get(id))
      .filter((g): g is Game => !!g)
      .slice(0, RECENT_LIMIT);
  }, [data, history]);

  // Phím tắt: "/" để tìm, Enter trong ô tìm → mở game đầu tiên
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeCount = data?.games.filter((g) => g.active).length ?? 0;
  const missingToken = Boolean(data) && needsToken(template) && !data?.credentials?.token;
  const urlOf = (g: Game) => (template && !missingToken ? buildGameUrl(template, g.id, data?.credentials ?? null, prefixes) : null);
  const firstHit = [...favGames.filter((g) => g.active), ...others][0];

  function openFirst() {
    const href = firstHit && urlOf(firstHit);
    if (!href) return;
    markOpened(firstHit.id);
    window.open(href, '_blank', 'noreferrer');
  }

  const card = (g: Game) => (
    <GameCard
      key={g.id}
      game={g}
      href={urlOf(g)}
      favorite={isFav(g.id)}
      stats={history[g.id]}
      onToggleFav={() => toggleFav(g.id)}
      onOpen={() => markOpened(g.id)}
    />
  );

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
                trang Settings
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
            ref={searchRef}
            placeholder="Tìm theo ID hoặc tên game..."
            leftSection={<IconSearch size={16} />}
            rightSection={query ? undefined : <Kbd size="xs">/</Kbd>}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') openFirst();
              if (e.key === 'Escape') setQuery('');
            }}
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
      ) : favGames.length + others.length === 0 ? (
        <Stack align="center" py={60} gap="xs">
          <ThemeIcon size={48} radius="xl" variant="light" color="gray">
            <IconMoodEmpty size={26} />
          </ThemeIcon>
          <Text c="dimmed" size="sm">
            {query ? 'Không có game nào khớp từ khoá.' : 'Chưa có game nào.'}
          </Text>
        </Stack>
      ) : (
        <Stack gap="lg">
          {query && firstHit && urlOf(firstHit) && (
            <Text size="xs" c="dimmed" mt={-6}>
              Nhấn <Kbd size="xs">Enter</Kbd> để mở <b>{firstHit.id}</b> {firstHit.name && `— ${firstHit.name}`}
            </Text>
          )}

          {!query && recent.length > 0 && (
            <Group gap={8}>
              <Group gap={4} c="dimmed">
                <IconClockHour4 size={15} />
                <Text size="sm" fw={500}>
                  Mở gần đây:
                </Text>
              </Group>
              {recent.map((g) => {
                const href = urlOf(g);
                return (
                  <Tooltip key={g.id} label={`${g.name || g.id} · ${timeAgo(history[g.id].last)}`}>
                    <UnstyledButton
                      component="a"
                      href={href ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="recent-chip"
                      onClick={() => markOpened(g.id)}
                      style={{ padding: '4px 12px', pointerEvents: href ? undefined : 'none' }}
                    >
                      <Text size="sm" fw={500} ff="monospace">
                        {g.id}
                      </Text>
                    </UnstyledButton>
                  </Tooltip>
                );
              })}
            </Group>
          )}

          {favGames.length > 0 && (
            <Section icon={<IconStarFilled size={16} color="var(--mantine-color-yellow-5)" />} title="Đã đánh dấu" count={favGames.length}>
              <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
                {favGames.map(card)}
              </SimpleGrid>
            </Section>
          )}

          {others.length > 0 && (
            <Section
              title={favGames.length ? 'Game khác' : 'Tất cả game'}
              count={others.length}
              right={
                <SegmentedControl
                  size="xs"
                  value={sort}
                  onChange={(v) => setSort(v as SortMode)}
                  data={[
                    { value: 'id', label: 'Theo ID' },
                    { value: 'most', label: 'Mở nhiều' },
                    { value: 'recent', label: 'Mở gần nhất' },
                  ]}
                />
              }
            >
              <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
                {others.map(card)}
              </SimpleGrid>
            </Section>
          )}

          {favorites.length === 0 && !query && (
            <Text size="xs" c="dimmed" ta="center">
              Mẹo: bấm <IconStar size={12} style={{ verticalAlign: -1 }} /> trên game hay dùng để ghim lên đầu — lưu trên trình duyệt này.
            </Text>
          )}
        </Stack>
      )}
    </>
  );
}

function Section({ icon, title, count, right, children }: { icon?: ReactNode; title: string; count: number; right?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <Group justify="space-between" mb="xs" gap="sm">
        <Group gap={6}>
          {icon}
          <Text fw={600} size="sm">
            {title}
          </Text>
          <Badge variant="light" color="gray" size="sm" radius="sm">
            {count}
          </Badge>
        </Group>
        {right}
      </Group>
      {children}
    </div>
  );
}

function GameCard({
  game,
  href,
  favorite,
  stats,
  onToggleFav,
  onOpen,
}: {
  game: Game;
  href: string | null;
  favorite: boolean;
  stats?: { last: number; count: number };
  onToggleFav: () => void;
  onOpen: () => void;
}) {
  const disabled = !href || !game.active;
  return (
    <Paper
      component="a"
      href={disabled ? undefined : href}
      target="_blank"
      // noreferrer: không gửi URL (chứa token) qua header Referer
      rel="noreferrer"
      onClick={disabled ? (e: React.MouseEvent) => e.preventDefault() : onOpen}
      onAuxClick={disabled ? undefined : (e: React.MouseEvent) => e.button === 1 && onOpen()}
      withBorder
      p="sm"
      radius="md"
      className="tool-card"
      style={{
        opacity: game.active ? 1 : 0.6,
        cursor: disabled ? 'default' : undefined,
        borderColor: favorite ? 'var(--mantine-color-yellow-4)' : undefined,
      }}
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
            {game.name || (
              <Text span c="dimmed" fs="italic" size="sm">
                (chưa có tên)
              </Text>
            )}
          </Text>
          {!game.active && game.status ? (
            <Text size="xs" c="dimmed" truncate title={game.status}>
              {game.status}
            </Text>
          ) : (
            stats && (
              <Text size="xs" c="dimmed" truncate>
                Mở {stats.count} lần · {timeAgo(stats.last)}
              </Text>
            )
          )}
        </div>
        <Stack gap={4} align="center">
          <Tooltip label={favorite ? 'Bỏ đánh dấu' : 'Đánh dấu — ghim lên đầu'}>
            <ActionIcon
              variant="subtle"
              color={favorite ? 'yellow' : 'gray'}
              aria-label={favorite ? 'Bỏ đánh dấu' : 'Đánh dấu'}
              onClick={(e) => {
                // Nằm trong thẻ <a> → chặn mở game
                e.preventDefault();
                e.stopPropagation();
                onToggleFav();
              }}
            >
              {favorite ? <IconStarFilled size={18} /> : <IconStar size={18} />}
            </ActionIcon>
          </Tooltip>
          <ThemeIcon variant="light" color={disabled ? 'gray' : 'cyan'} radius="md" size="md">
            <IconExternalLink size={16} />
          </ThemeIcon>
        </Stack>
      </Group>
    </Paper>
  );
}
