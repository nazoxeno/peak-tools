import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  ColorSwatch,
  CopyButton,
  Group,
  List,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconFileSpreadsheet,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useAppConfig } from '../app-config/ConfigProvider';
import { createConfigTemplate } from '../app-config/sheetConfig';
import { useAuth } from '../auth/AuthProvider';
import { CONTACT } from '../branding';
import { ENV } from '../env';

const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

export function SettingsPage() {
  const { status, config, error, reload } = useAppConfig();

  return (
    <>
      <Group gap="md" mb="xl" wrap="nowrap" align="flex-start">
        <ThemeIcon size={52} radius="lg" variant="light" color="gray">
          <IconSettings size={28} stroke={1.6} />
        </ThemeIcon>
        <Stack gap={4}>
          <Title order={2} fz={{ base: 22, sm: 26 }}>
            Cấu hình
          </Title>
          <Text c="dimmed">Cấu hình được đọc từ Google Sheet — sửa trực tiếp trên Sheet rồi bấm “Tải lại”.</Text>
        </Stack>
      </Group>

      <Stack gap="lg">
        <Card padding="lg">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" color="green" size="lg">
                <IconFileSpreadsheet size={20} />
              </ThemeIcon>
              <div>
                <Text fw={600}>Google Sheet cấu hình</Text>
                <Text size="sm" c="dimmed">
                  {ENV.configSheetId ? <Code>{ENV.configSheetId}</Code> : 'Chưa thiết lập'}
                </Text>
              </div>
            </Group>
            <Group gap="xs">
              <StatusBadge status={status} />
              {ENV.configSheetId && (
                <Button
                  component="a"
                  href={sheetUrl(ENV.configSheetId)}
                  target="_blank"
                  rel="noreferrer"
                  variant="default"
                  size="xs"
                  rightSection={<IconExternalLink size={14} />}
                >
                  Mở Sheet
                </Button>
              )}
              <Button variant="light" size="xs" leftSection={<IconRefresh size={14} />} onClick={reload} loading={status === 'loading'}>
                Tải lại
              </Button>
            </Group>
          </Group>

          {error && (
            <Alert mt="md" color={error.kind === 'noAccess' ? 'orange' : 'red'} variant="light" icon={<IconAlertTriangle />}>
              {error.message}{' '}
              {error.kind === 'noAccess' && `${CONTACT} để được chia sẻ Sheet.`}
              {error.kind !== 'noAccess' && 'Đang dùng cấu hình mặc định.'}
            </Alert>
          )}
        </Card>

        {error?.kind === 'notConfigured' && <SetupGuide />}

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Card padding="lg">
            <Title order={5} mb="sm">
              Clone Folder
            </Title>
            <Table verticalSpacing={6}>
              <Table.Tbody>
                <Row k="Template Game ID" v={config.clone.template.gameId} />
                <Row k="Template Game Name" v={config.clone.template.gameName} />
                <Row k="Tự chuyển owner cho" v={config.clone.newOwnerEmail || '—'} />
                <Row k="Email mặc định (Ownership)" v={config.changeOwner.defaultEmail || '—'} />
                <Row k="Engine Script ID" v={config.engine.scriptId ? `${config.engine.scriptId.slice(0, 12)}…` : '—'} />
                <Row k="Mẫu URL game" v={config.game.urlTemplate ? 'Đã cấu hình' : '—'} />
                <Row k="Prefix theo độ dài ID" v={config.game.idPrefixes || '—'} />
              </Table.Tbody>
            </Table>
            <Text size="sm" fw={600} mt="md" mb={4}>
              Phân quyền theo folder
            </Text>
            {config.clone.permissions.length === 0 ? (
              <Text size="sm" c="dimmed">
                Không có
              </Text>
            ) : (
              <List size="sm" spacing={4}>
                {config.clone.permissions.map((p) => (
                  <List.Item key={p.suffix}>
                    <Code>{p.suffix}</Code> → {p.emails.join(', ')}
                  </List.Item>
                ))}
              </List>
            )}
          </Card>

          <Card padding="lg">
            <Title order={5} mb="sm">
              Màu dropdown
            </Title>
            <ColorList title="Type" colors={config.typeColors} />
            <ColorList title="Status" colors={config.statusColors} />
          </Card>
        </SimpleGrid>
      </Stack>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ready') return <Badge color="green" variant="light">Đã tải</Badge>;
  if (status === 'loading') return <Badge color="gray" variant="light">Đang tải…</Badge>;
  return <Badge color="orange" variant="light">Mặc định</Badge>;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <Table.Tr>
      <Table.Td c="dimmed" w="50%">
        {k}
      </Table.Td>
      <Table.Td fw={500}>{v}</Table.Td>
    </Table.Tr>
  );
}

function ColorList({ title, colors }: { title: string; colors: Record<string, string> }) {
  return (
    <>
      <Text size="sm" fw={600} mt="xs" mb={6}>
        {title}
      </Text>
      <Group gap="xs" mb="sm">
        {Object.entries(colors).map(([name, color]) => (
          <Badge key={name} variant="default" radius="sm" tt="none" leftSection={<ColorSwatch color={color} size={12} />}>
            {name}
          </Badge>
        ))}
      </Group>
    </>
  );
}

/** Hướng dẫn + nút tạo Sheet mẫu khi chưa có VITE_CONFIG_SHEET_ID. */
function SetupGuide() {
  const { user } = useAuth();
  const domain = ENV.orgDomain || user?.emailAddress?.split('@')[1] || '';
  const [share, setShare] = useState(true);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onCreate() {
    setCreating(true);
    setErr(null);
    try {
      setCreated(await createConfigTemplate(share ? domain : undefined));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card padding="lg" style={{ borderColor: 'var(--mantine-color-brand-3)' }}>
      <Title order={4} mb="xs">
        Thiết lập Sheet cấu hình
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Tạo một Google Sheet mẫu trong Drive của bạn, sau đó điền email nội bộ vào Sheet (không đưa vào code).
      </Text>

      {!created ? (
        <Stack gap="sm">
          {domain && (
            <Checkbox
              checked={share}
              onChange={(e) => setShare(e.currentTarget.checked)}
              label={`Chia sẻ quyền xem cho mọi người trong ${domain}`}
              description="Cần thiết để đồng nghiệp đọc được cấu hình khi dùng tool."
            />
          )}
          <Group>
            <Button leftSection={<IconFileSpreadsheet size={18} />} onClick={onCreate} loading={creating}>
              Tạo Sheet mẫu
            </Button>
          </Group>
          {err && (
            <Alert color="red" variant="light">
              {err}
            </Alert>
          )}
        </Stack>
      ) : (
        <Stack gap="sm">
          <Alert color="green" variant="light" icon={<IconCheck />} title="Đã tạo Sheet">
            <Button
              component="a"
              href={created.url}
              target="_blank"
              rel="noreferrer"
              size="xs"
              color="green"
              rightSection={<IconExternalLink size={14} />}
            >
              Mở Sheet để điền email
            </Button>
          </Alert>
          <Text size="sm" fw={600}>
            Bước tiếp theo — đặt Sheet ID vào biến môi trường:
          </Text>
          <Group gap="xs">
            <Code fz="sm">VITE_CONFIG_SHEET_ID={created.id}</Code>
            <CopyButton value={`VITE_CONFIG_SHEET_ID=${created.id}`}>
              {({ copied, copy }) => (
                <Button size="compact-xs" variant="subtle" onClick={copy} leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />}>
                  {copied ? 'Đã copy' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          </Group>
          <List size="sm" spacing={4}>
            <List.Item>
              Local: thêm dòng trên vào file <Code>.env.local</Code> rồi chạy lại <Code>npm run dev</Code>.
            </List.Item>
            <List.Item>
              GitHub: <b>Settings → Secrets and variables → Actions → Variables</b>, tạo biến{' '}
              <Code>VITE_CONFIG_SHEET_ID</Code>.
            </List.Item>
          </List>
        </Stack>
      )}
    </Card>
  );
}
