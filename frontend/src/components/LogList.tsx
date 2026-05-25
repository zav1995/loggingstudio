import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Card,
  Collapse,
  Group,
  ScrollArea,
  Select,
  Stack,
  Text,
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

  const activeFilterCount =
    (filters.tagID ? 1 : 0) +
    (filters.source ? 1 : 0) +
    (filters.sessionID ? 1 : 0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <Card withBorder padding="xs" radius="md" bg="#161616" h="100%">
      <Stack gap={6} h="100%">
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Group gap={6} wrap="nowrap">
            <Text size="sm" fw={600}>
              Logs
            </Text>
            <Badge variant="default" color="gray" size="sm">
              {logs.length}
            </Badge>
          </Group>
          <ActionIcon
            variant={activeFilterCount > 0 ? 'light' : 'subtle'}
            color={activeFilterCount > 0 ? 'scoreplay-green' : 'gray'}
            size="sm"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-label="toggle filters"
            title={`${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}`}
          >
            ▾
          </ActionIcon>
        </Group>
        <Collapse in={filtersOpen}>
          <Stack gap={4}>
            <Select
              size="xs"
              placeholder="tag"
              data={tagOptions}
              value={filters.tagID}
              onChange={(v) => onFiltersChange({ ...filters, tagID: v })}
              clearable
              searchable
            />
            <Select
              size="xs"
              placeholder="source"
              data={sourceOptions}
              value={filters.source}
              onChange={(v) => onFiltersChange({ ...filters, source: v })}
              clearable
            />
            <Select
              size="xs"
              placeholder="session"
              data={sessionOptions}
              value={filters.sessionID}
              onChange={(v) => onFiltersChange({ ...filters, sessionID: v })}
              clearable
              searchable
            />
          </Stack>
        </Collapse>
        <ScrollArea h={620} type="hover" offsetScrollbars>
          <Stack gap={4}>
            {logs.length === 0 && (
              <Text c="dimmed" size="xs">
                No logs.
              </Text>
            )}
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
    <div
      onClick={() => log.id && onSelect(log.id)}
      style={{
        cursor: 'pointer',
        background: selected ? '#1a1a1a' : '#101010',
        borderTop: '1px solid #232323',
        borderBottom: '1px solid #232323',
        borderRight: selected ? '1px solid #FAFAFA' : '1px solid #232323',
        borderLeft: `3px solid ${color}`,
        padding: '4px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Group gap={6} justify="space-between" wrap="nowrap">
        <Text size="xs" ff="monospace">
          {msToRelativeTC(log.offset_in, frameRate)}
          {log.offset_out !== null && log.offset_out !== undefined
            ? ` → ${msToRelativeTC(log.offset_out, frameRate)}`
            : ''}
        </Text>
        <Group gap={2} wrap="nowrap">
          <Text size="9px" c="dimmed" style={{ fontSize: 9 }}>
            {log.source}
          </Text>
          <Tooltip label="Edit">
            <ActionIcon
              size="xs"
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
        <Group gap={3}>
          {tagNames.map((n) => (
            <Badge
              key={n}
              size="xs"
              variant="light"
              styles={{ root: { height: 14, padding: '0 4px', fontSize: 9 } }}
            >
              {n}
            </Badge>
          ))}
          {extraTagCount > 0 && (
            <Text size="9px" c="dimmed" style={{ fontSize: 9 }}>
              +{extraTagCount}
            </Text>
          )}
        </Group>
      )}
    </div>
  );
}
