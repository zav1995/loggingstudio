import { useMemo } from 'react';
import { Box, Stack, Text } from '@mantine/core';

import type { Log, Tag, TagGroup } from '../api/schemas';
import { logColor } from '../lib/log-color';
import { msToRelativeTC } from '../lib/timecode';

type Props = {
  logs: Log[];
  tags: Tag[];
  groups: TagGroup[];
  durationMs: number;
  currentMs: number;
  selectedLogID: string | null;
  frameRate: number;
  onSeek: (ms: number) => void;
  onSelect: (logID: string) => void;
};

const TRACK_HEIGHT = 56;
const POINT_LOG_PX = 3;

export function Timeline({
  logs,
  tags,
  groups,
  durationMs,
  currentMs,
  selectedLogID,
  frameRate,
  onSeek,
  onSelect,
}: Props) {
  // If the player hasn't reported a duration yet, fall back to the latest
  // log's out (or in) so the timeline still renders something usable.
  const effectiveDuration = useMemo(() => {
    if (durationMs > 0) return durationMs;
    let maxMs = 0;
    for (const l of logs) {
      const end = l.offset_out ?? l.offset_in;
      if (end > maxMs) maxMs = end;
    }
    return Math.max(maxMs, 60_000);
  }, [durationMs, logs]);

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(effectiveDuration, ratio * effectiveDuration)));
  };

  const playheadLeft = `${(currentMs / effectiveDuration) * 100}%`;

  return (
    <Stack gap={4}>
      <Box
        onClick={onTrackClick}
        style={{
          position: 'relative',
          height: TRACK_HEIGHT,
          background: '#0F0F0F',
          border: '1px solid #2a2a2a',
          borderRadius: 4,
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        {logs.map((log) => {
          const color = logColor(log, tags, groups);
          const left = (log.offset_in / effectiveDuration) * 100;
          const widthPct = log.offset_out
            ? Math.max(
                0.4,
                ((log.offset_out - log.offset_in) / effectiveDuration) * 100,
              )
            : null;
          const selected = log.id === selectedLogID;
          return (
            <Box
              key={log.id}
              onClick={(e) => {
                e.stopPropagation();
                if (log.id) onSelect(log.id);
              }}
              title={`${msToRelativeTC(log.offset_in, frameRate)}${
                log.offset_out
                  ? ` → ${msToRelativeTC(log.offset_out, frameRate)}`
                  : ''
              }`}
              style={{
                position: 'absolute',
                top: 6,
                bottom: 6,
                left: `${left}%`,
                width: widthPct !== null ? `${widthPct}%` : POINT_LOG_PX,
                background: color,
                borderRadius: 2,
                outline: selected ? '2px solid #FAFAFA' : 'none',
                outlineOffset: 1,
                cursor: 'pointer',
              }}
            />
          );
        })}
        {/* playhead */}
        <Box
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: playheadLeft,
            width: 2,
            background: '#FAFAFA',
            pointerEvents: 'none',
          }}
        />
      </Box>
      <Text size="xs" c="dimmed">
        {logs.length} log{logs.length === 1 ? '' : 's'} · click an empty area to
        seek · click a bar to select
      </Text>
    </Stack>
  );
}
