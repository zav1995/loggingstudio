import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Grid, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { z } from 'zod';

import { ApiError, api } from '../api/client';
import {
  type Log,
  type Media,
  type Session,
  type Tag,
  type TagGroup,
  logSchema,
  mediaSchema,
  sessionSchema,
  tagGroupSchema,
  tagSchema,
} from '../api/schemas';
import { useActiveMediaId } from '../lib/active-media';
import { HLSPlayer, type HLSPlayerHandle } from '../components/HLSPlayer';
import { Timeline } from '../components/Timeline';
import { LogList, type LogFilters } from '../components/LogList';
import { LogEditor } from '../components/LogEditor';
import { TagPalette } from '../components/TagPalette';

const logListSchema = z.array(logSchema);
const tagListSchema = z.array(tagSchema);
const groupListSchema = z.array(tagGroupSchema);
const sessionListSchema = z.array(sessionSchema);

type MediaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: Media }
  | { status: 'error'; message: string };

export function Studio() {
  const [activeMediaID] = useActiveMediaId();
  const [media, setMedia] = useState<MediaState>({ status: 'idle' });
  const [logs, setLogs] = useState<Log[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [groups, setGroups] = useState<TagGroup[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedLogID, setSelectedLogID] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [filters, setFilters] = useState<LogFilters>({
    tagID: null,
    source: null,
    sessionID: null,
  });
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [loadError, setLoadError] = useState('');

  const playerRef = useRef<HLSPlayerHandle>(null);

  // Load media on activeMediaID change.
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

  // Load logs + tags + groups + sessions whenever the media changes.
  const refreshAll = useCallback(async () => {
    if (!activeMediaID) return;
    setLoadError('');
    try {
      const [logs, tags, groups, sessions] = await Promise.all([
        api.get(`/logs?media_id=${encodeURIComponent(activeMediaID)}`, logListSchema),
        api.get('/tags', tagListSchema),
        api.get('/tag-groups', groupListSchema),
        api.get(`/sessions?media_id=${encodeURIComponent(activeMediaID)}`, sessionListSchema),
      ]);
      setLogs(logs);
      setTags(tags);
      setGroups(groups);
      setSessions(sessions);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.message}${err.detail ? ` — ${err.detail}` : ''}`
          : err instanceof Error
            ? err.message
            : 'unknown error';
      setLoadError(msg);
    }
  }, [activeMediaID]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Client-side filtering: keep timeline + list in lockstep.
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filters.tagID && !log.tags.includes(filters.tagID)) return false;
      if (filters.source && log.source !== filters.source) return false;
      if (filters.sessionID) {
        const session = sessions.find((s) => s.id === filters.sessionID);
        if (!session || !log.created_at || !session.started_at) return false;
        const logTime = Date.parse(log.created_at);
        const startTime = Date.parse(session.started_at);
        if (logTime < startTime) return false;
        if (session.ended_at) {
          const endTime = Date.parse(session.ended_at);
          if (logTime > endTime) return false;
        }
      }
      return true;
    });
  }, [logs, sessions, filters]);

  const selectedLog = useMemo(
    () => filteredLogs.find((l) => l.id === selectedLogID) ?? null,
    [filteredLogs, selectedLogID],
  );

  // Selecting a log = open editor + seek player to its in-point.
  const selectLog = useCallback(
    (id: string) => {
      setSelectedLogID(id);
      const log = logs.find((l) => l.id === id);
      if (log && playerRef.current) {
        playerRef.current.seek(log.offset_in);
      }
      setEditorOpen(true);
    },
    [logs],
  );

  // Backspace deletes the selected log (with confirm + input-focus guard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }
      if (!selectedLogID || editorOpen) return;
      e.preventDefault();
      if (!confirm('Delete the selected log?')) return;
      void api
        .delete(`/logs/${selectedLogID}`)
        .then(() => {
          setSelectedLogID(null);
          void refreshAll();
        });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedLogID, editorOpen, refreshAll]);

  const onPlayerTimeUpdate = useCallback((ms: number, dur: number) => {
    setCurrentMs(ms);
    if (dur > 0) setDurationMs(dur);
  }, []);

  const onTimelineSeek = useCallback((ms: number) => {
    playerRef.current?.seek(ms);
  }, []);

  if (media.status === 'idle') {
    return (
      <Stack>
        <Title order={2}>Studio</Title>
        <Text c="dimmed">
          Set an active media via the header to load the player.
        </Text>
      </Stack>
    );
  }
  if (media.status === 'loading') {
    return (
      <Stack>
        <Title order={2}>Studio</Title>
        <Loader />
      </Stack>
    );
  }
  if (media.status === 'error') {
    return (
      <Stack>
        <Title order={2}>Studio</Title>
        <Alert color="red" title="Failed to load media">
          {media.message}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack>
      <Group gap="sm" justify="space-between">
        <Group gap="sm">
          <Title order={2}>Studio</Title>
          <Badge color="scoreplay-green" variant="light">
            {media.data.id}
          </Badge>
          <Text size="sm" c="dimmed">
            {media.data.frame_rate} fps · anchored at {media.data.started_at_tc}
          </Text>
        </Group>
        {loadError && (
          <Text c="red" size="sm">
            {loadError}
          </Text>
        )}
      </Group>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack>
            <HLSPlayer
              ref={playerRef}
              src={media.data.hls_url}
              startedAtTC={media.data.started_at_tc}
              frameRate={media.data.frame_rate}
              onTimeUpdate={onPlayerTimeUpdate}
            />
            <Timeline
              logs={filteredLogs}
              tags={tags}
              groups={groups}
              durationMs={durationMs}
              currentMs={currentMs}
              selectedLogID={selectedLogID}
              frameRate={media.data.frame_rate}
              onSeek={onTimelineSeek}
              onSelect={selectLog}
            />
            <TagPalette tags={tags} groups={groups} />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <LogList
            logs={filteredLogs}
            tags={tags}
            groups={groups}
            sessions={sessions}
            filters={filters}
            onFiltersChange={setFilters}
            selectedLogID={selectedLogID}
            frameRate={media.data.frame_rate}
            onSelect={selectLog}
          />
        </Grid.Col>
      </Grid>

      <LogEditor
        log={selectedLog}
        tags={tags}
        frameRate={media.data.frame_rate}
        opened={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={refreshAll}
        onDeleted={async () => {
          setSelectedLogID(null);
          await refreshAll();
        }}
      />
    </Stack>
  );
}
