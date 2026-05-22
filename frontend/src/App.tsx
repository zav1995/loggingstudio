import { useEffect, useState } from 'react';
import { AppShell, Badge, Card, Code, Group, Stack, Text, Title } from '@mantine/core';

type HealthResponse = {
  ok: boolean;
  ts: string;
};

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; data: HealthResponse }
  | { status: 'error'; message: string };

export function App() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as HealthResponse;
      })
      .then((data) => setHealth({ status: 'ok', data }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'unknown error';
        setHealth({ status: 'error', message });
      });
    return () => controller.abort();
  }, []);

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header
        px="md"
        style={{ display: 'flex', alignItems: 'center', background: '#161616' }}
      >
        <Group justify="space-between" w="100%">
          <Title order={4} c="white">
            Logging Studio
          </Title>
          <Badge color="scoreplay-green" variant="light">
            skeleton
          </Badge>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Stack maw={640}>
          <Title order={2}>Backend health</Title>
          <Text c="dimmed">
            GET <Code>/api/health</Code> (proxied to backend <Code>:8080</Code>)
          </Text>
          <Card withBorder padding="md" radius="md" bg="#161616">
            {health.status === 'loading' && <Text>checking…</Text>}
            {health.status === 'ok' && (
              <Stack gap="xs">
                <Group gap="xs">
                  <Badge color="scoreplay-green">ok</Badge>
                  <Text size="sm" c="dimmed">
                    {health.data.ts}
                  </Text>
                </Group>
                <Code block>{JSON.stringify(health.data, null, 2)}</Code>
              </Stack>
            )}
            {health.status === 'error' && (
              <Stack gap="xs">
                <Badge color="red">error</Badge>
                <Text size="sm">{health.message}</Text>
              </Stack>
            )}
          </Card>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
