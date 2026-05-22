import { useEffect, useState } from 'react';
import { Alert, Badge, Card, Code, Group, Loader, Stack, Text, Title } from '@mantine/core';

import { ApiError, api } from '../api/client';
import { type Health, type Media, healthSchema, mediaSchema } from '../api/schemas';
import { useActiveMediaId } from '../lib/active-media';
import { HLSPlayer } from '../components/HLSPlayer';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; data: Health }
  | { status: 'error'; message: string };

type MediaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: Media }
  | { status: 'error'; message: string };

export function Studio() {
  const [activeMediaID] = useActiveMediaId();
  const [media, setMedia] = useState<MediaState>({ status: 'idle' });
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api
      .get('/health', healthSchema)
      .then((data) => {
        if (!cancelled) setHealth({ status: 'ok', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? `${err.message}${err.detail ? ` — ${err.detail}` : ''}`
            : err instanceof Error
              ? err.message
              : 'unknown error';
        setHealth({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeMediaID) {
      setMedia({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setMedia({ status: 'loading' });
    api
      .get(`/media/${encodeURIComponent(activeMediaID)}`, mediaSchema)
      .then((data) => {
        if (!cancelled) setMedia({ status: 'ok', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? `${err.message}${err.detail ? ` — ${err.detail}` : ''}`
            : err instanceof Error
              ? err.message
              : 'unknown error';
        setMedia({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [activeMediaID]);

  const dbOK = health.status === 'ok' && health.data.db === 'ok';

  return (
    <Stack>
      <Title order={2}>Studio</Title>

      {media.status === 'idle' && (
        <Text c="dimmed">
          Set an active media via the header to load the player.
        </Text>
      )}
      {media.status === 'loading' && <Loader />}
      {media.status === 'error' && (
        <Alert color="red" title="Failed to load media">
          {media.message}
        </Alert>
      )}
      {media.status === 'ok' && (
        <Stack>
          <Group gap="sm">
            <Badge color="scoreplay-green" variant="light">
              {media.data.id}
            </Badge>
            <Text size="sm" c="dimmed">
              {media.data.frame_rate} fps · anchored at {media.data.started_at_tc}
            </Text>
          </Group>
          <HLSPlayer
            src={media.data.hls_url}
            startedAtTC={media.data.started_at_tc}
            frameRate={media.data.frame_rate}
          />
        </Stack>
      )}

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
