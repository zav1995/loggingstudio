import { useEffect, useState } from 'react';
import { Badge, Card, Code, Group, Stack, Text, Title } from '@mantine/core';

type HealthResponse = { ok: boolean; db: string; ts: string };
type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; data: HealthResponse }
  | { status: 'error'; message: string };

export function Studio() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as HealthResponse;
      })
      .then((data) => setHealth({ status: 'ok', data }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setHealth({
          status: 'error',
          message: err instanceof Error ? err.message : 'unknown error',
        });
      });
    return () => controller.abort();
  }, []);

  const dbOK = health.status === 'ok' && health.data.db === 'ok';

  return (
    <Stack>
      <Title order={2}>Studio</Title>
      <Text c="dimmed">Studio view — placeholder.</Text>
      <Card withBorder padding="md" radius="md" bg="#161616" maw={640}>
        <Title order={5} mb="xs">
          Backend health
        </Title>
        {health.status === 'loading' && <Text>checking…</Text>}
        {health.status === 'ok' && (
          <Stack gap="xs">
            <Group gap="xs">
              <Badge color="scoreplay-green">api ok</Badge>
              <Badge color={dbOK ? 'scoreplay-green' : 'red'}>
                db {dbOK ? 'ok' : 'down'}
              </Badge>
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
  );
}
