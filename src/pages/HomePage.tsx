import { Badge, Card, Group, Kbd, SimpleGrid, Stack, Text, TextInput, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconArrowUpRight, IconClockHour4, IconMoodEmpty, IconSearch } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { AuthorCredit } from '../components/AuthorCredit';
import { getRecentTools } from '../lib/recentTools';
import { hrefOf } from '../lib/router';
import { TOOLS, toolsByCategory, type ToolDef } from '../tools/registry';

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/** So khớp không dấu, không phân biệt hoa thường: "nhan ban" khớp "Nhân bản". */
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');

export function HomePage() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ').slice(-1)[0] ?? '';
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [recent] = useState(() =>
    getRecentTools()
      .map((id) => TOOLS.find((t) => t.id === id))
      .filter((t): t is ToolDef => Boolean(t)),
  );

  // Phím "/" → nhảy vào ô tìm kiếm
  useHotkeys([['/', () => searchRef.current?.focus()]], []);

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    return toolsByCategory()
      .map(([category, tools]) => [
        category,
        tools.filter((t) => !q || normalize(`${t.title} ${t.description} ${category}`).includes(q)),
      ] as const)
      .filter(([, tools]) => tools.length > 0);
  }, [query]);

  return (
    <Stack gap="xl">
      {/* Banner gọn: lời chào + tìm kiếm */}
      <div className="hero hero-compact">
        <Group justify="space-between" align="center" gap="md" wrap="wrap">
          <div>
            <Text size="sm" fw={500} style={{ opacity: 0.85 }}>
              {greeting()}, {firstName} 👋
            </Text>
            <Title order={2} c="white" fz={{ base: 22, sm: 26 }} mt={2}>
              P.E.A.K Internal Tools
            </Title>
          </div>
          <TextInput
            ref={searchRef}
            placeholder={`Tìm trong ${TOOLS.length} công cụ...`}
            leftSection={<IconSearch size={16} />}
            rightSection={query ? undefined : <Kbd size="xs">/</Kbd>}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              // Enter → mở tool đầu tiên khớp
              const first = groups[0]?.[1][0];
              if (e.key === 'Enter' && first) window.location.hash = hrefOf(first.id);
              if (e.key === 'Escape') setQuery('');
            }}
            radius="md"
            size="md"
            w={{ base: '100%', sm: 320 }}
            aria-label="Tìm công cụ"
          />
        </Group>
      </div>

      {/* Dùng gần đây */}
      {!query && recent.length > 0 && (
        <div>
          <SectionLabel icon={<IconClockHour4 size={14} />} label="Dùng gần đây" />
          <Group gap="xs">
            {recent.map((t) => (
              <UnstyledButton key={t.id} component="a" href={hrefOf(t.id)} className="recent-chip">
                <Group gap={8} wrap="nowrap">
                  <ThemeIcon size={22} radius="sm" variant="light" color={t.color}>
                    <t.icon size={14} stroke={1.8} />
                  </ThemeIcon>
                  <Text size="sm" fw={500}>
                    {t.title}
                  </Text>
                </Group>
              </UnstyledButton>
            ))}
          </Group>
        </div>
      )}

      {/* Danh sách tool theo nhóm */}
      {groups.length === 0 ? (
        <Stack align="center" py={40} gap="xs">
          <ThemeIcon size={44} radius="xl" variant="light" color="gray">
            <IconMoodEmpty size={24} />
          </ThemeIcon>
          <Text c="dimmed" size="sm">
            Không có công cụ nào khớp “{query}”.
          </Text>
        </Stack>
      ) : (
        groups.map(([category, tools]) => (
          <div key={category}>
            <SectionLabel label={category} count={tools.length} />
            <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 4 }} spacing="sm" verticalSpacing="sm">
              {tools.map((t) => (
                <ToolCard key={t.id} tool={t} />
              ))}
            </SimpleGrid>
          </div>
        ))
      )}

      <AuthorCredit />
    </Stack>
  );
}

function SectionLabel({ label, count, icon }: { label: string; count?: number; icon?: React.ReactNode }) {
  return (
    <Group gap={6} mb="xs">
      {icon && <Text c="dimmed" component="span" style={{ display: 'flex' }}>{icon}</Text>}
      <Text fw={600} size="xs" c="dimmed" tt="uppercase" lts={0.6}>
        {label}
      </Text>
      {count !== undefined && (
        <Badge size="xs" variant="light" color="gray" radius="sm">
          {count}
        </Badge>
      )}
    </Group>
  );
}

/** Card ngang, gọn: icon trái — tên + mô tả (tối đa 2 dòng) phải. */
function ToolCard({ tool: t }: { tool: ToolDef }) {
  return (
    <Card component="a" href={hrefOf(t.id)} padding="sm" radius="md" className="tool-card tool-card-compact">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon size={40} radius="md" variant="light" color={t.color} style={{ flexShrink: 0 }}>
          <t.icon size={22} stroke={1.7} />
        </ThemeIcon>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Group gap={4} wrap="nowrap" justify="space-between">
            <Text fw={600} size="sm" truncate>
              {t.title}
            </Text>
            <IconArrowUpRight size={16} className="tool-card-cta" color={`var(--mantine-color-${t.color}-6)`} />
          </Group>
          <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
            {t.description}
          </Text>
        </div>
      </Group>
    </Card>
  );
}
