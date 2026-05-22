import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Stack,
  Text,
} from '@mantine/core';

import { ApiError, api } from '../api/client';
import { type Log, type Tag, logSchema } from '../api/schemas';
import { msToRelativeTC } from '../lib/timecode';

type Props = {
  log: Log | null;
  tags: Tag[];
  frameRate: number;
  opened: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
};

export function LogEditor({
  log,
  tags,
  frameRate,
  opened,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [inMs, setInMs] = useState<number>(0);
  const [outMs, setOutMs] = useState<number | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!log) return;
    setInMs(log.offset_in);
    setOutMs(log.offset_out ?? null);
    setTagIds(log.tags);
    setError('');
  }, [log]);

  const tagOptions = useMemo(
    () =>
      tags
        .filter((t): t is Tag & { id: string } => Boolean(t.id))
        .map((t) => ({ value: t.id, label: t.name })),
    [tags],
  );

  if (!log) return null;

  const save = async () => {
    if (outMs !== null && outMs < inMs) {
      setError('offset_out must be >= offset_in');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(
        `/logs/${log.id}`,
        {
          offset_in: Math.round(inMs),
          offset_out: outMs === null ? undefined : Math.round(outMs),
          tags: tagIds,
        },
        logSchema,
      );
      await onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.detail ? `${e.message} — ${e.detail}` : e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this log?')) return;
    setSaving(true);
    try {
      await api.delete(`/logs/${log.id}`);
      await onDeleted();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Edit log" size="md" centered>
      <Stack>
        <Text size="sm" c="dimmed">
          {log.source} · {msToRelativeTC(inMs, frameRate)}
          {outMs !== null ? ` → ${msToRelativeTC(outMs, frameRate)}` : ''}
        </Text>
        <NumberInput
          label="In (ms)"
          value={inMs}
          min={0}
          onChange={(v) => setInMs(typeof v === 'number' ? v : Number(v) || 0)}
          required
        />
        <NumberInput
          label="Out (ms)"
          placeholder="(point-in-time log)"
          value={outMs === null ? '' : outMs}
          min={0}
          onChange={(v) => {
            if (v === '' || v === undefined || v === null) {
              setOutMs(null);
              return;
            }
            setOutMs(typeof v === 'number' ? v : Number(v));
          }}
        />
        <MultiSelect
          label="Tags"
          data={tagOptions}
          value={tagIds}
          onChange={setTagIds}
          searchable
          clearable
        />
        {error && (
          <Alert color="red" title="Couldn't save">
            {error}
          </Alert>
        )}
        <Group justify="space-between">
          <Button variant="subtle" color="red" onClick={remove} loading={saving}>
            Delete
          </Button>
          <Group>
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
