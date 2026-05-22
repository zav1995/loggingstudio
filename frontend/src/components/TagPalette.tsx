import { Badge, Card, Group, Stack, Text, Title } from '@mantine/core';

import type { Tag, TagGroup } from '../api/schemas';

type Props = {
  tags: Tag[];
  groups: TagGroup[];
};

export function TagPalette({ tags, groups }: Props) {
  if (tags.length === 0) {
    return (
      <Card withBorder padding="sm" radius="md" bg="#161616">
        <Text size="sm" c="dimmed">
          No tags defined yet — head to the Tags view to create some.
        </Text>
      </Card>
    );
  }

  return (
    <Card withBorder padding="sm" radius="md" bg="#161616">
      <Stack gap="xs">
        <Title order={6} c="dimmed">
          Tag palette
        </Title>
        <Group gap="md" wrap="wrap">
          {groups.map((group) => {
            const groupTags = tags
              .filter((t) => t.group_id === group.id)
              .sort((a, b) => a.display_order - b.display_order);
            if (groupTags.length === 0) return null;
            return (
              <Stack key={group.id} gap={4}>
                <Group gap={4}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: group.color,
                    }}
                  />
                  <Text size="xs" c="dimmed">
                    {group.name}
                  </Text>
                </Group>
                <Group gap={4}>
                  {groupTags.map((t) => (
                    <Badge
                      key={t.id}
                      size="sm"
                      variant="light"
                      leftSection={
                        t.hotkey ? (
                          <Text size="xs" ff="monospace">
                            {t.hotkey.toUpperCase()}
                          </Text>
                        ) : null
                      }
                    >
                      {t.name}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            );
          })}
        </Group>
      </Stack>
    </Card>
  );
}
