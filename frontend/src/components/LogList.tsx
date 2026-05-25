import { useMemo } from 'react';
import {
  ActionIcon,
  Badge,
  Card,
  Group,
  ScrollArea,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';

import type { Log, Session, Tag, TagGroup } from '../api/schemas';
import { logColor } from '../lib/log-color';
import { msToRelativeTC } from '../lib/timecode';

export type LogFilters = {
  tagID: string | null;
  source: string | null;
  sessionID: string | null;
};

type Props = {
  logs: Log[];
  tags: Tag[];
  groups: TagGroup[];
  sessions: Session[];
  filters: LogFilters;
  onFiltersChange: (next: LogFilters) => void;
  selectedLogID: string | null;
  frameRate: number;
  onSelect: (logID: string) => void;
  onEdit: (logID: string) => void;
};

export function LogList({
  logs,
  tags,
  groups,
  sessions,
  filters,
  onFiltersChange,
  selectedLogID,
  frameRate,
  onSelect,
  onEdit,
}: Props) {
  const tagOptions = useMemo(
    () =>
      tags
        .filter((t): t is Tag & { id: string } => Boolean(t.id))
        .map((t) => ({ value: t.id, label: t.name })),
    [tags],
  );
  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) set.add(l.source);
    return Array.from(set).map((s) => ({ value: s, label: s }));
  }, [logs]);
  const sessionOptions = useMemo(
    () =>
      sessions
        .filter((s): s is Session & { id: string } => Boolean(s.id))
        .map((s) => ({ value: s.id, label: s.name })),
    [sessions],
  );

  return (
    <Card withBorder padding="sm" radius="md" bg="#161616" h="100%">
      <Stack gap="sm" h="100%">
        <Group justify="space-between">
          <Title order={5}>Logs</Title>
          <Badge variant="default" color="gray">
            {logs.length}
          </Badge>
        </Group>
        <Stack gap="xs">
          <Select
            placeholder="Filter by tag"
            data={tagOptions}
            value={filters.tagID}
            onChange={(v) => onFiltersChange({ ...filters, tagID: v })}
            clearable
            searchable
          />
          <Select
            placeholder="Filter by source"
            data={sourceOptions}
            value={filters.source}
            onChange={(v) => onFiltersChange({ ...filters, source: v })}
            clearable
          />
          <Select
            placeholder="Filter by session"
            data={sessionOptions}
            value={filters.sessionID}
            onChange={(v) => onFiltersChange({ ...filters, sessionID: v })}
            clearable
            searchable
          />
        </Stack>
        <ScrollArea h={520} type="hover" offsetScrollbars>
          <Stack gap="xs">
            {logs.length === 0 && <Text c="dimmed" size="sm">No logs.</Text>}
            {logs.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                tags={tags}
                groups={groups}
                frameRate={frameRate}
                selected={log.id === selectedLogID}
                onSelect={onSelect}
                onEdit={onEdit}
              />
            ))}
          </Stack>
        </ScrollArea>
      </Stack>
    </Card>
  );
}

function LogRow({
  log,
  tags,
  groups,
  frameRate,
  selected,
  onSelect,
  onEdit,
}: {
  log: Log;
  tags: Tag[];
  groups: TagGroup[];
  frameRate: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const color = logColor(log, tags, groups);
  const tagNames = log.tags
    .map((id) => tags.find((t) => t.id === id)?.name ?? id.slice(0, 8))
    .slice(0, 3);
  const extraTagCount = Math.max(0, log.tags.length - tagNames.length);

  return (
    <Card
      withBorder
      padding="xs"
      radius="sm"
      onClick={() => log.id && onSelect(log.id)}
      style={{
        cursor: 'pointer',
        background: selected ? '#1a1a1a' : '#101010',
        borderColor: selected ? '#FAFAFA' : '#2a2a2a',
        borderLeft: `4px solid ${color}`,
      }}
    >
      <Stack gap={2}>
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="sm" ff="monospace">
            {msToRelativeTC(log.offset_in, frameRate)}
            {log.offset_out !== null && log.offset_out !== undefined
              ? ` → ${msToRelativeTC(log.offset_out, frameRate)}`
              : ''}
          </Text>
          <Group gap={4} wrap="nowrap">
            <Badge size="xs" variant="default" color="gray">
              {log.source}
            </Badge>
            <Tooltip label="Edit">
              <ActionIcon
                size="sm"
                variant="subtle"
                aria-label="edit log"
                onClick={(e) => {
                  e.stopPropagation();
                  if (log.id) onEdit(log.id);
                }}
              >
                ✎
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        {(tagNames.length > 0 || extraTagCount > 0) && (
          <Group gap={4}>
            {tagNames.map((n) => (
              <Badge key={n} size="xs" variant="light">
                {n}
              </Badge>
            ))}
            {extraTagCount > 0 && (
              <Text size="xs" c="dimmed">
                +{extraTagCount}
              </Text>
            )}
          </Group>
        )}
      </Stack>
    </Card>
  );
}
