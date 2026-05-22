import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Code, Group, Stack, Switch, Text } from '@mantine/core';
import Hls from 'hls.js';

import { msToRelativeTC, msToWallTC } from '../lib/timecode';

type Props = {
  src: string;
  startedAtTC: string;
  frameRate: number;
};

type LoopRegion = {
  inMs: number | null;
  outMs: number | null;
  enabled: boolean;
};

export function HLSPlayer({ src, startedAtTC, frameRate }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shuttle, setShuttle] = useState<'normal' | 'reverse'>('normal');
  const [loop, setLoop] = useState<LoopRegion>({ inMs: null, outMs: null, enabled: false });
  const [error, setError] = useState('');

  // Attach hls.js or fall back to native (Safari).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setError('');

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setError(`HLS error: ${data.type} / ${data.details}`);
        }
      });
      hlsRef.current = hls;
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }
    setError('HLS not supported in this browser');
  }, [src]);

  // Reverse-playback driver: when shuttle = 'reverse', decrement currentTime
  // at ~2x speed via rAF and keep the underlying <video> paused (most browsers
  // don't honor negative playbackRate, so we drive it ourselves).
  useEffect(() => {
    if (shuttle !== 'reverse') return;
    let raf: number;
    let lastTs = performance.now();
    const step = (ts: number) => {
      const dt = ts - lastTs;
      lastTs = ts;
      const v = videoRef.current;
      if (v) {
        const next = v.currentTime - (dt / 1000) * 2;
        if (next <= 0) {
          v.currentTime = 0;
          setShuttle('normal');
          return;
        }
        v.currentTime = next;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [shuttle]);

  // Poll the video element's time on rAF to keep the HUD smooth.
  useEffect(() => {
    let raf: number;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        setCurrentMs(v.currentTime * 1000);
        if (!Number.isNaN(v.duration) && v.duration !== Infinity) {
          setDurationMs(v.duration * 1000);
        }
        setPlaying(!v.paused);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Loop-region enforcement.
  useEffect(() => {
    if (!loop.enabled || loop.inMs === null || loop.outMs === null) return;
    if (loop.outMs <= loop.inMs) return;
    if (currentMs >= loop.outMs) {
      const v = videoRef.current;
      if (v) v.currentTime = loop.inMs / 1000;
    }
  }, [currentMs, loop]);

  // Transport keyboard handler.
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setShuttle('normal');
    v.playbackRate = 1;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  // Stable setIn/setOut that read currentTime straight off the video element
  // — that lets the keydown effect depend on them without re-registering on
  // every rAF tick (which would happen if we closed over the currentMs state).
  const setIn = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setLoop((p) => ({ ...p, inMs: v.currentTime * 1000 }));
  }, []);
  const setOut = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setLoop((p) => ({ ...p, outMs: v.currentTime * 1000 }));
  }, []);
  const clearLoop = useCallback(
    () => setLoop({ inMs: null, outMs: null, enabled: false }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }
      const v = videoRef.current;
      if (!v) return;
      const frameSec = 1 / frameRate;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          setShuttle('reverse');
          v.pause();
          break;
        case 'k':
        case 'K':
          e.preventDefault();
          setShuttle('normal');
          v.playbackRate = 1;
          v.pause();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          setShuttle('normal');
          v.playbackRate = 2;
          void v.play();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setShuttle('normal');
          v.pause();
          v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 5 : frameSec));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setShuttle('normal');
          v.pause();
          v.currentTime = v.currentTime + (e.shiftKey ? 5 : frameSec);
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          setIn();
          break;
        case 'o':
        case 'O':
          e.preventDefault();
          setOut();
          break;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frameRate, togglePlay, setIn, setOut]);

  return (
    <Stack>
      <div style={{ background: '#000', position: 'relative' }}>
        <video
          ref={videoRef}
          controls
          style={{ width: '100%', maxHeight: 540, display: 'block' }}
        />
      </div>

      <Group gap="md">
        <Code style={{ fontSize: 16 }}>{msToWallTC(currentMs, startedAtTC, frameRate)}</Code>
        <Text c="dimmed" size="sm">
          ({msToRelativeTC(currentMs, frameRate)} of{' '}
          {durationMs > 0 ? msToRelativeTC(durationMs, frameRate) : '—'})
        </Text>
        <Badge color={playing ? 'scoreplay-green' : 'gray'} variant="light">
          {shuttle === 'reverse' ? '◀◀ J 2x' : playing ? '▶ play' : '⏸ paused'}
        </Badge>
      </Group>

      <Group gap="xs">
        <ActionIcon variant="default" onClick={setIn} aria-label="set loop in">
          I
        </ActionIcon>
        <ActionIcon variant="default" onClick={setOut} aria-label="set loop out">
          O
        </ActionIcon>
        <Switch
          checked={loop.enabled}
          onChange={(e) =>
            setLoop((p) => ({ ...p, enabled: e.currentTarget.checked }))
          }
          label="Loop"
          disabled={loop.inMs === null || loop.outMs === null}
        />
        {(loop.inMs !== null || loop.outMs !== null) && (
          <Text size="sm" c="dimmed">
            in {loop.inMs !== null ? msToRelativeTC(loop.inMs, frameRate) : '—'} ·
            out {loop.outMs !== null ? msToRelativeTC(loop.outMs, frameRate) : '—'}
          </Text>
        )}
        {(loop.inMs !== null || loop.outMs !== null) && (
          <ActionIcon variant="subtle" color="red" onClick={clearLoop} aria-label="clear loop">
            ×
          </ActionIcon>
        )}
      </Group>

      <Text size="xs" c="dimmed">
        Hotkeys: <Code>Space</Code> play/pause · <Code>J</Code>/<Code>K</Code>/<Code>L</Code> shuttle
        (-2x/pause/+2x) · <Code>←</Code>/<Code>→</Code> frame step · <Code>Shift</Code>+arrows ±5s ·
        <Code>I</Code>/<Code>O</Code> set loop in/out
      </Text>

      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}
    </Stack>
  );
}
