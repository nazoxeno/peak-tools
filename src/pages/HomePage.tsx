import { Badge, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthProvider';
import { hrefOf } from '../lib/router';
import { TOOLS, toolsByCategory } from '../tools/registry';

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function HomePage() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ').slice(-1)[0] ?? '';

  return (
    <Stack gap={40}>
      <div className="hero">
        <Text size="sm" fw={500} style={{ opacity: 0.85 }}>
          {greeting()}, {firstName} 👋
        </Text>
        <Title order={1} fz={{ base: 26, sm: 32 }} mt={6} c="white">
          P.E.A.K Internal Tools
        </Title>
        <Text mt={8} maw={520} style={{ opacity: 0.85 }}>
          Bộ công cụ tự động hoá Google Drive &amp; Sheets. Chọn một công cụ bên dưới để bắt đầu.
        </Text>
        <Group gap="xs" mt="lg">
          <Badge variant="white" color="dark" radius="sm" size="lg">
            {TOOLS.length} công cụ
          </Badge>
          <Badge variant="outline" color="white" radius="sm" size="lg" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)' }}>
            {user?.emailAddress}
          </Badge>
        </Group>
      </div>

      {toolsByCategory().map(([category, tools]) => (
        <div key={category}>
          <Text fw={600} size="sm" c="dimmed" tt="uppercase" lts={0.6} mb="md">
            {category}
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {tools.map((t) => (
              <Card key={t.id} component="a" href={hrefOf(t.id)} padding="lg" className="tool-card">
                <ThemeIcon size={46} radius="md" variant="light" color={t.color} mb="md">
                  <t.icon size={24} stroke={1.7} />
                </ThemeIcon>
                <Text fw={600} size="lg" mb={6}>
                  {t.title}
                </Text>
                <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                  {t.description}
                </Text>
                <Group gap={6} mt="lg" c={`${t.color}.6`}>
                  <Text size="sm" fw={600} c="inherit">
                    Mở công cụ
                  </Text>
                  <IconArrowRight size={16} className="tool-card-cta" />
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        </div>
      ))}
    </Stack>
  );
}
