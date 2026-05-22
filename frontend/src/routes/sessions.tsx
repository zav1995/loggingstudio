import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { z } from 'zod';

import { ApiError, api } from '../api/client';
import { type Session, sessionSchema } from '../api/schemas';
import { useActiveMediaId } from '../lib/active-media';

const sessionListSchema = z.array(sessionSchema);

export function Sessions() {
  const [mediaID, setMediaID] = useActiveMediaId();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!mediaID) {
      setStatus('idle');
      setSessions([]);
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const data = await api.get(
        `/sessions?media_id=${encodeURIComponent(mediaID)}`,
        sessionListSchema,
      );
      setSessions(data);
      setStatus('ready');
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.message}${err.detail ? ` — ${err.detail}` : ''}`
          : err instanceof Error
            ? err.message
            : 'unknown error';
      setError(msg);
      setStatus('error');
    }
  }, [mediaID]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Stack>
      <Title order={2}>Sessions</Title>
      <Text c="dimmed">
        Logging contexts for the active media. End a session when the operator
        ends their shift.
      </Text>

      {!mediaID ? (
        <NoActiveMediaPrompt onSet={setMediaID} />
      ) : (
        <Stack>
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              Active media:
            </Text>
            <Badge variant="default" color="gray">
              {mediaID}
            </Badge>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setMediaID(null)}
            >
              clear
            </Button>
          </Group>
          <CreateSessionForm mediaID={mediaID} onCreated={refresh} />
          {status === 'loading' && <Loader />}
          {status === 'error' && (
            <Alert color="red" title="Failed to load">
              {error}
            </Alert>
          )}
          {status === 'ready' && sessions.length === 0 && (
            <Text c="dimmed">No sessions yet.</Text>
          )}
          {status === 'ready' &&
            sessions.map((s) => (
              <SessionCard key={s.id} session={s} onChanged={refresh} />
            ))}
        </Stack>
      )}
    </Stack>
  );
}

function NoActiveMediaPrompt({
  onSet,
}: {
  onSet: (id: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <Card withBorder padding="md" radius="md" bg="#161616" maw={640}>
      <Stack gap="sm">
        <Title order={5}>No active media</Title>
        <Text size="sm" c="dimmed">
          Sessions are scoped to a media. Enter an existing media id, or set
          one via the (upcoming) launch dialog.
        </Text>
        <Group>
          <TextInput
            value={value}
            placeholder="asset-..."
            onChange={(e) => setValue(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button
            onClick={() => value.trim() && onSet(value.trim())}
            disabled={!value.trim()}
          >
            Use
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function CreateSessionForm({
  mediaID,
  onCreated,
}: {
  mediaID: string;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setErr('');
    try {
      await api.post('/sessions', {
        media_id: mediaID,
        name: name.trim(),
        notes: notes.trim(),
      });
      setName('');
      setNotes('');
      await onCreated();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        setErr(`validation failed${e.detail ? ` — ${e.detail}` : ''}`);
      } else {
        setErr(e instanceof Error ? e.message : 'create failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card withBorder padding="md" radius="md" bg="#161616">
      <Stack gap="sm">
        <Title order={5}>New session</Title>
        <TextInput
          label="Name"
          placeholder="e.g. Court 13 morning"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group>
          <Button onClick={submit} loading={submitting} disabled={!name.trim()}>
            Start session
          </Button>
        </Group>
        {err && (
          <Text c="red" size="sm">
            {err}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

function SessionCard({
  session,
  onChanged,
}: {
  session: Session;
  onChanged: () => Promise<void>;
}) {
  const [ending, setEnding] = useState(false);
  const ended = Boolean(session.ended_at);

  const endNow = async () => {
    setEnding(true);
    try {
      await api.patch(`/sessions/${session.id}`, {
        ended_at: new Date().toISOString(),
      });
      await onChanged();
    } finally {
      setEnding(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete session "${session.name}"?`)) return;
    await api.delete(`/sessions/${session.id}`);
    await onChanged();
  };

  return (
    <Card withBorder padding="md" radius="md" bg="#161616">
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="sm">
            <Title order={5}>{session.name}</Title>
            {ended ? (
              <Badge color="gray">ended</Badge>
            ) : (
              <Badge color="scoreplay-green">active</Badge>
            )}
          </Group>
          <Group gap="xs">
            {!ended && (
              <Button size="xs" variant="light" onClick={endNow} loading={ending}>
                End now
              </Button>
            )}
            <Button size="xs" variant="subtle" color="red" onClick={remove}>
              Delete
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed">
          started {session.started_at ?? '—'}
          {session.ended_at ? ` · ended ${session.ended_at}` : ''}
        </Text>
        {session.notes && <Text size="sm">{session.notes}</Text>}
      </Stack>
    </Card>
  );
}
