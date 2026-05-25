import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Grid, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
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
import { TagPicker } from '../components/TagPicker';
import { InProgressBar, type InProgressLog } from '../components/InProgressBar';
import { useSSEEvents } from '../lib/sse-bus';
import type { PickerMessage, PickerState } from '../lib/picker-channel';
import { usePickerSession } from '../lib/picker-net';
import {
  getOrCreatePickerSessionID,
  pickerControlsURL,
} from '../lib/picker-session';

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
  const [inProgress, setInProgress] = useState<InProgressLog | null>(null);
  const [inProgressError, setInProgressError] = useState('');
  // Bumped on every 'requestState' message so the state-publish effect fires
  // even when none of the source-of-truth values changed (popup just opened).
  const [publishTick, setPublishTick] = useState(0);

  const playerRef = useRef<HLSPlayerHandle>(null);
  // Refs let the global keydown handler read the freshest state without
  // re-registering itself on every keystroke.
  const inProgressRef = useRef<InProgressLog | null>(null);
  inProgressRef.current = inProgress;
  const editorOpenRef = useRef(editorOpen);
  editorOpenRef.current = editorOpen;

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

  // Subscribe to log.* and ingest.* events from the app-level SSE bus.
  // Any time a log mutates or an ingestion lands, refresh the timeline +
  // list so the studio stays in lockstep with the server (including changes
  // from other clients and from the watch loop).
  useSSEEvents((evt) => {
    if (
      evt.type === 'log.created' ||
      evt.type === 'log.updated' ||
      evt.type === 'log.deleted' ||
      evt.type === 'ingest.processed'
    ) {
      void refreshAll();
    }
  });

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

  // jumpToLog: select + seek + play, no editor. This is the row/bar click
  // path — the user wants to scrub here and watch what they tagged.
  const jumpToLog = useCallback(
    (id: string) => {
      setSelectedLogID(id);
      const log = logs.find((l) => l.id === id);
      if (log && playerRef.current) {
        playerRef.current.seekAndPlay(log.offset_in);
      }
    },
    [logs],
  );

  // openEditor: explicit edit-icon path — select + open modal. We seek too
  // so the player is at the right frame while editing, but stay paused so
  // the user can scrub by frame in the editor without fighting playback.
  const openEditor = useCallback(
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

  // commitInProgress / discardInProgress are stable so the keydown effect
  // doesn't need to re-register on every state change.
  const commitInProgress = useCallback(async () => {
    const ip = inProgressRef.current;
    if (!ip || !activeMediaID) return;
    setInProgressError('');
    try {
      await api.post('/logs', {
        media_id: activeMediaID,
        offset_in: ip.offsetIn,
        offset_out: ip.offsetOut ?? undefined,
        tags: ip.tags,
        source: 'manual',
      });
      setInProgress(null);
      await refreshAll();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.message}${err.detail ? ` — ${err.detail}` : ''}`
          : err instanceof Error
            ? err.message
            : 'commit failed';
      setInProgressError(msg);
    }
  }, [activeMediaID, refreshAll]);

  const discardInProgress = useCallback(() => {
    setInProgress(null);
    setInProgressError('');
  }, []);

  // toggleTag is the shared write path for both keyboard hotkeys and the
  // clickable TagPicker. No in-progress log → starts one at currentMs with
  // the tag attached. In-progress with the tag absent → appends. In-progress
  // with the tag present → removes it. Toggle is symmetric on both input
  // surfaces, so an accidental press can be undone with another press/click.
  const toggleTag = useCallback((tagID: string) => {
    const nowMs = playerRef.current?.currentMs() ?? 0;
    setInProgressError('');
    setInProgress((p) => {
      if (!p) {
        return { offsetIn: nowMs, offsetOut: null, tags: [tagID] };
      }
      if (p.tags.includes(tagID)) {
        return { ...p, tags: p.tags.filter((id) => id !== tagID) };
      }
      return { ...p, tags: [...p.tags, tagID] };
    });
  }, []);

  const setInToCurrent = useCallback(() => {
    const nowMs = playerRef.current?.currentMs() ?? 0;
    setInProgressError('');
    setInProgress((p) =>
      p
        ? { ...p, offsetIn: nowMs }
        : { offsetIn: nowMs, offsetOut: null, tags: [] },
    );
  }, []);

  const setOutToCurrent = useCallback(() => {
    const nowMs = playerRef.current?.currentMs() ?? 0;
    setInProgressError('');
    setInProgress((p) =>
      p
        ? { ...p, offsetOut: nowMs }
        : { offsetIn: nowMs, offsetOut: nowMs, tags: [] },
    );
  }, []);

  // Network bridge to any popped-out picker on this device or another one
  // on the LAN. Studio is the publisher; popups apply actions back through
  // the same toggleTag / setIn / setOut / commit / discard surfaces. The
  // session id is stored in localStorage so a reload keeps the same channel
  // and any open popups stay in sync without re-pairing.
  const pickerSessionID = useMemo(() => getOrCreatePickerSessionID(), []);
  const onPickerMsg = useCallback(
    (msg: PickerMessage) => {
      switch (msg.kind) {
        case 'requestState':
          // Bump the tick so the publish effect re-fires even if none of the
          // source values changed since the last publish.
          setPublishTick((t) => t + 1);
          break;
        case 'toggleTag':
          toggleTag(msg.tagID);
          break;
        case 'setIn':
          setInToCurrent();
          break;
        case 'setOut':
          setOutToCurrent();
          break;
        case 'commit':
          void commitInProgress();
          break;
        case 'discard':
          discardInProgress();
          break;
        case 'state':
          // We publish 'state'; any echo would arrive here too. Cheap to
          // ignore.
          break;
      }
    },
    [toggleTag, setInToCurrent, setOutToCurrent, commitInProgress, discardInProgress],
  );
  const { publish: publishPicker } = usePickerSession(pickerSessionID, onPickerMsg);

  // Republish the picker state whenever anything the popup needs changes
  // or when a popup explicitly asks for it (publishTick).
  useEffect(() => {
    const state: PickerState = {
      tags,
      groups,
      inProgress,
      frameRate: media.status === 'ok' ? media.data.frame_rate : 25,
      mediaID: activeMediaID,
    };
    publishPicker({ kind: 'state', state });
  }, [tags, groups, inProgress, media, activeMediaID, publishTick, publishPicker]);

  const openPopOut = useCallback(() => {
    const url = pickerControlsURL(pickerSessionID);
    window.open(
      url,
      'loggingstudio-picker',
      'width=720,height=900,menubar=no,toolbar=no,location=no',
    );
  }, [pickerSessionID]);

  const copyControlsURL = useCallback(async () => {
    const url = pickerControlsURL(pickerSessionID);
    try {
      await navigator.clipboard.writeText(url);
      notifications.show({
        color: 'scoreplay-green',
        title: 'Controls URL copied',
        message: url.includes('localhost')
          ? `${url} — replace localhost with your machine's LAN IP to open on another device`
          : url,
      });
    } catch {
      notifications.show({
        color: 'red',
        title: 'Could not copy',
        message: url,
      });
    }
  }, [pickerSessionID]);

  // Unified keyboard handler: Backspace (delete selected), tag hotkeys (start
  // / add tag to in-progress), I/O (set in/out), Enter (commit), Esc
  // (discard). Skipped while focus is in any input or the editor modal is
  // open. Tag-hotkey matching is case-sensitive against the stored hotkey;
  // I/O/Enter/Esc handlers also tolerate uppercase via explicit checks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }
      if (editorOpenRef.current) return;

      // Backspace: delete selected log (no in-progress interference).
      if (e.key === 'Backspace') {
        if (!selectedLogID) return;
        e.preventDefault();
        if (!confirm('Delete the selected log?')) return;
        void api.delete(`/logs/${selectedLogID}`).then(() => {
          setSelectedLogID(null);
          void refreshAll();
        });
        return;
      }

      // Tag hotkey: toggles the tag on the in-progress log (creates one if
      // none yet). Same code path as a TagPicker click.
      const tagHit = tags.find((t) => t.hotkey && t.hotkey === e.key);
      if (tagHit && tagHit.id) {
        e.preventDefault();
        toggleTag(tagHit.id);
        return;
      }

      const key = e.key.toLowerCase();

      if (key === 'i') {
        e.preventDefault();
        setInToCurrent();
        return;
      }
      if (key === 'o') {
        e.preventDefault();
        setOutToCurrent();
        return;
      }
      if (e.key === 'Enter') {
        if (!inProgressRef.current) return;
        e.preventDefault();
        void commitInProgress();
        return;
      }
      if (e.key === 'Escape') {
        if (!inProgressRef.current) return;
        e.preventDefault();
        discardInProgress();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    tags,
    selectedLogID,
    refreshAll,
    commitInProgress,
    discardInProgress,
    toggleTag,
    setInToCurrent,
    setOutToCurrent,
  ]);

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
    <Stack gap="xs">
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {media.data.frame_rate} fps · anchored at {media.data.started_at_tc}
          </Text>
        </Group>
        {loadError && (
          <Text c="red" size="xs">
            {loadError}
          </Text>
        )}
      </Group>

      <Grid gutter="xs">
        <Grid.Col span={{ base: 12, md: 9 }}>
          <Stack gap={4}>
            <HLSPlayer
              ref={playerRef}
              src={media.data.hls_url}
              startedAtTC={media.data.started_at_tc}
              frameRate={media.data.frame_rate}
              onTimeUpdate={onPlayerTimeUpdate}
            />
            {inProgress && (
              <InProgressBar
                log={inProgress}
                tags={tags}
                frameRate={media.data.frame_rate}
                onCommit={commitInProgress}
                onDiscard={discardInProgress}
                error={inProgressError}
              />
            )}
            <Timeline
              logs={filteredLogs}
              tags={tags}
              groups={groups}
              durationMs={durationMs}
              currentMs={currentMs}
              selectedLogID={selectedLogID}
              frameRate={media.data.frame_rate}
              onSeek={onTimelineSeek}
              onSelect={jumpToLog}
            />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <LogList
            logs={filteredLogs}
            tags={tags}
            groups={groups}
            sessions={sessions}
            filters={filters}
            onFiltersChange={setFilters}
            selectedLogID={selectedLogID}
            frameRate={media.data.frame_rate}
            onSelect={jumpToLog}
            onEdit={openEditor}
          />
        </Grid.Col>
      </Grid>

      {/* Full-width below the grid: spacious, fingertip-friendly. */}
      <TagPicker
        tags={tags}
        groups={groups}
        selectedTagIDs={inProgress?.tags ?? []}
        onToggle={toggleTag}
        onPopOut={openPopOut}
        onCopyControlsURL={copyControlsURL}
      />

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
