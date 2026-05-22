import { Badge, Button, Card, Code, Group, Stack, Text } from '@mantine/core';

import type { Tag } from '../api/schemas';
import { msToRelativeTC } from '../lib/timecode';

export type InProgressLog = {
  offsetIn: number;
  offsetOut: number | null;
  tags: string[];
};

type Props = {
  log: InProgressLog;
  tags: Tag[];
  frameRate: number;
  onCommit: () => void;
  onDiscard: () => void;
  error?: string;
};

export function InProgressBar({
  log,
  tags,
  frameRate,
  onCommit,
  onDiscard,
  error,
}: Props) {
  const tagNames = log.tags.map((id) => {
    const t = tags.find((x) => x.id === id);
    return { id, name: t?.name ?? id.slice(0, 6), hotkey: t?.hotkey };
  });

  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      bg="#1a1a1a"
      style={{ borderColor: '#00FF87' }}
    >
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="wrap">
            <Badge color="scoreplay-green">recording</Badge>
            <Text size="sm" ff="monospace">
              in {msToRelativeTC(log.offsetIn, frameRate)}
              {log.offsetOut !== null
                ? ` → out ${msToRelativeTC(log.offsetOut, frameRate)}`
                : ''}
            </Text>
            {tagNames.length === 0 && (
              <Text size="xs" c="dimmed">
                no tags yet — press a tag hotkey
              </Text>
            )}
            {tagNames.map((t) => (
              <Badge key={t.id} size="sm" variant="light">
                {t.hotkey ? `${t.hotkey.toUpperCase()} · ` : ''}
                {t.name}
              </Badge>
            ))}
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Button size="xs" onClick={onCommit}>
              Commit
            </Button>
            <Button size="xs" variant="subtle" onClick={onDiscard}>
              Discard
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed">
          <Code>I</Code> sets in · <Code>O</Code> sets out · <Code>Enter</Code> commits
          · <Code>Esc</Code> discards · additional tag hotkeys add tags
        </Text>
        {error && (
          <Text c="red" size="xs">
            {error}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
