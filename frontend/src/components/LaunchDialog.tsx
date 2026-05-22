import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Code,
  Divider,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';

import { ApiError, api } from '../api/client';
import { type Media, mediaSchema } from '../api/schemas';
import { useActiveMediaId } from '../lib/active-media';

type Props = {
  opened: boolean;
  onClose: () => void;
};

const TC_RE = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d:\d{2}$/;

export function LaunchDialog({ opened, onClose }: Props) {
  const [_, setActiveMediaID] = useActiveMediaId();

  const [mediaId, setMediaId] = useState('');
  const [hlsUrl, setHlsUrl] = useState('');
  const [startedAtTC, setStartedAtTC] = useState('');
  const [frameRate, setFrameRate] = useState<number>(25);
  const [label, setLabel] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [stored, setStored] = useState<Media | null>(null);

  // Reset transient state whenever the dialog is reopened.
  useEffect(() => {
    if (!opened) return;
    setError('');
    setStored(null);
  }, [opened]);

  const tcValid = TC_RE.test(startedAtTC);
  const canSubmit =
    mediaId.trim() !== '' &&
    hlsUrl.trim() !== '' &&
    tcValid &&
    frameRate >= 1 &&
    frameRate <= 120;

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setStored(null);
    try {
      const result = await api.post<Media>(
        '/media',
        {
          media_id: mediaId.trim(),
          hls_url: hlsUrl.trim(),
          started_at_tc: startedAtTC,
          frame_rate: frameRate,
          label: label.trim() || undefined,
        },
        mediaSchema,
      );
      setActiveMediaID(result.id);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { stored?: Media } | undefined;
        if (body?.stored) {
          setStored(body.stored);
        }
        setError(err.message);
      } else if (err instanceof ApiError) {
        setError(
          err.detail
            ? `${err.message} — ${err.detail}`
            : err.message,
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('unknown error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchToStored = () => {
    if (!stored) return;
    setActiveMediaID(stored.id);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Set active media"
      size="lg"
      centered
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Logging Studio needs a media to anchor logs against. If the id
          already exists on the server with matching inputs, you'll be
          attached to it; if it exists with different inputs, you'll be
          offered the stored version.
        </Text>

        <TextInput
          label="Media ID"
          placeholder="e.g. asset-rg26-court13"
          value={mediaId}
          onChange={(e) => setMediaId(e.currentTarget.value)}
          required
        />
        <TextInput
          label="HLS URL"
          placeholder="https://cdn.example.com/stream.m3u8"
          value={hlsUrl}
          onChange={(e) => setHlsUrl(e.currentTarget.value)}
          required
        />
        <TextInput
          label="Started at TC (SMPTE)"
          placeholder="HH:MM:SS:FF"
          value={startedAtTC}
          onChange={(e) => setStartedAtTC(e.currentTarget.value)}
          required
          error={
            startedAtTC !== '' && !tcValid
              ? 'expected HH:MM:SS:FF (24-hour)'
              : undefined
          }
        />
        <NumberInput
          label="Frame rate"
          min={1}
          max={120}
          value={frameRate}
          onChange={(v) =>
            setFrameRate(typeof v === 'number' ? v : Number(v) || 25)
          }
          required
        />
        <TextInput
          label="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
        />

        {error && !stored && (
          <Alert color="red" title="Submission failed">
            {error}
          </Alert>
        )}

        {stored && (
          <Alert color="yellow" title="Media exists with different inputs">
            <Stack gap="xs">
              <Text size="sm">{error}</Text>
              <Divider />
              <Text size="xs" c="dimmed">
                Stored values:
              </Text>
              <Code block>{JSON.stringify(stored, null, 2)}</Code>
              <Group>
                <Button size="sm" variant="light" onClick={switchToStored}>
                  Switch to existing
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting} disabled={!canSubmit}>
            Use this media
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
