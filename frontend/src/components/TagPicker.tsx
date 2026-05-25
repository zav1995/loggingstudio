import { useMemo } from 'react';
import { Button, Card, Chip, ColorSwatch, Group, Stack, Text, Title } from '@mantine/core';

import type { Tag, TagGroup } from '../api/schemas';

type Props = {
  tags: Tag[];
  groups: TagGroup[];
  selectedTagIDs: string[];
  onToggle: (tagID: string) => void;
  onPopOut?: () => void;
  onCopyControlsURL?: () => void;
};

// TagPicker replaces the old read-only TagPalette. Every tag is a Mantine
// Chip sized for fingertip use — checked state mirrors the in-progress log
// so the operator sees exactly which tags are about to be committed.
// Optimized for ease of clicking, not vertical compactness — per the manual-
// logging UX requirements.
export function TagPicker({
  tags,
  groups,
  selectedTagIDs,
  onToggle,
  onPopOut,
  onCopyControlsURL,
}: Props) {
  const groupedTags = useMemo(() => {
    return groups
      .map((g) => ({
        group: g,
        tags: tags
          .filter((t) => t.group_id === g.id)
          .sort((a, b) => a.display_order - b.display_order),
      }))
      .filter((entry) => entry.tags.length > 0);
  }, [tags, groups]);

  if (tags.length === 0) {
    return (
      <Card withBorder padding="md" radius="md" bg="#161616">
        <Text size="sm" c="dimmed">
          No tags defined yet — head to the Tags view to create some.
        </Text>
      </Card>
    );
  }

  return (
    <Card withBorder padding="md" radius="md" bg="#161616">
      <Stack gap="lg">
        <Group justify="space-between">
          <Group gap="sm">
            <Title order={5}>Tag picker</Title>
            <Text size="xs" c="dimmed">
              click to {selectedTagIDs.length > 0 ? 'add / remove' : 'start a log'}
            </Text>
          </Group>
          <Group gap="xs">
            {onCopyControlsURL && (
              <Button size="xs" variant="default" onClick={onCopyControlsURL}>
                Copy controls URL 📋
              </Button>
            )}
            {onPopOut && (
              <Button size="xs" variant="default" onClick={onPopOut}>
                Pop out ↗
              </Button>
            )}
          </Group>
        </Group>
        <Stack gap="md">
          {groupedTags.map(({ group, tags: groupTags }) => (
            <Stack key={group.id} gap={6}>
              <Group gap={6} align="center">
                <ColorSwatch color={group.color} size={14} />
                <Text size="sm" fw={600} c={group.color}>
                  {group.name}
                </Text>
              </Group>
              <Group gap="xs" wrap="wrap">
                {groupTags.map((t) => {
                  const id = t.id ?? '';
                  const checked = id !== '' && selectedTagIDs.includes(id);
                  return (
                    <Chip
                      key={id}
                      size="lg"
                      checked={checked}
                      onChange={() => id && onToggle(id)}
                      color={group.color}
                      variant={checked ? 'filled' : 'light'}
                      styles={{
                        label: {
                          paddingInline: 16,
                          fontSize: 15,
                          height: 40,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        },
                      }}
                    >
                      <span>{t.name}</span>
                      {t.hotkey && (
                        <Text
                          component="span"
                          size="xs"
                          ff="monospace"
                          c={checked ? 'white' : 'dimmed'}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: checked ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.06)',
                          }}
                        >
                          {t.hotkey.toUpperCase()}
                        </Text>
                      )}
                    </Chip>
                  );
                })}
              </Group>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}
