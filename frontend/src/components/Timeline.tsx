import { useMemo, useRef, useState } from 'react';
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

const RULER_HEIGHT = 18;
const TRACK_HEIGHT = 64;
const POINT_LOG_PX = 3;

// tickIntervalMs returns the ms-step between tick marks for a given total
// duration — chosen so a 1080-wide timeline has roughly 8–15 ticks across.
function tickIntervalMs(durationMs: number): number {
  if (durationMs <= 0) return 60_000;
  if (durationMs < 5 * 60_000) return 30_000; // < 5 min → every 30s
  if (durationMs < 30 * 60_000) return 60_000; // < 30 min → every 1 min
  if (durationMs < 60 * 60_000) return 5 * 60_000; // < 1 h → every 5 min
  if (durationMs < 3 * 3600_000) return 10 * 60_000; // < 3 h → every 10 min
  return 30 * 60_000; // very long → every 30 min
}

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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

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

  const ticks = useMemo(() => {
    const step = tickIntervalMs(effectiveDuration);
    const out: number[] = [];
    for (let t = 0; t <= effectiveDuration; t += step) {
      out.push(t);
    }
    return out;
  }, [effectiveDuration]);

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(effectiveDuration, ratio * effectiveDuration)));
  };

  const onTrackMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    setHoverX(x);
    setHoverMs(ratio * effectiveDuration);
  };

  const onTrackLeave = () => setHoverMs(null);

  const playheadLeft = `${(currentMs / effectiveDuration) * 100}%`;

  return (
    <Stack gap={2}>
      {/* Ruler: tick marks + TC labels. */}
      <Box
        style={{
          position: 'relative',
          height: RULER_HEIGHT,
          color: '#666',
          fontSize: 10,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          userSelect: 'none',
        }}
      >
        {ticks.map((t) => (
          <span
            key={t}
            style={{
              position: 'absolute',
              left: `${(t / effectiveDuration) * 100}%`,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {msToRelativeTC(t, frameRate)}
          </span>
        ))}
      </Box>

      {/* Main track: log bars + playhead + ticks + hover indicator. */}
      <Box
        ref={trackRef}
        onClick={onTrackClick}
        onMouseMove={onTrackMove}
        onMouseLeave={onTrackLeave}
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
        {/* Vertical tick lines at the top edge of the track. */}
        {ticks.map((t) => (
          <Box
            key={`tick-${t}`}
            style={{
              position: 'absolute',
              left: `${(t / effectiveDuration) * 100}%`,
              top: 0,
              width: 1,
              height: 6,
              background: '#3a3a3a',
              pointerEvents: 'none',
            }}
          />
        ))}

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
                top: 10,
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

        {/* Hover indicator: a light line + a floating TC chip above. */}
        {hoverMs !== null && (
          <>
            <Box
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: hoverX,
                width: 1,
                background: 'rgba(250,250,250,0.4)',
                pointerEvents: 'none',
              }}
            />
            <Box
              style={{
                position: 'absolute',
                top: 2,
                left: hoverX,
                transform: 'translateX(-50%)',
                padding: '2px 6px',
                background: 'rgba(10,10,10,0.92)',
                color: '#FAFAFA',
                fontSize: 11,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                borderRadius: 3,
                border: '1px solid #2a2a2a',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {msToRelativeTC(hoverMs, frameRate)}
            </Box>
          </>
        )}

        {/* Playhead. */}
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
        {logs.length} log{logs.length === 1 ? '' : 's'} · click empty to seek ·
        hover for TC · click a bar to select
      </Text>
    </Stack>
  );
}
