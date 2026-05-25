import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Badge, Code, Group, Stack, Text, Tooltip } from '@mantine/core';
import Hls from 'hls.js';

import { msToRelativeTC, msToWallTC } from '../lib/timecode';

type Props = {
  src: string;
  startedAtTC: string;
  frameRate: number;
  // Called on every rAF tick with the player's currentMs + total durationMs.
  onTimeUpdate?: (currentMs: number, durationMs: number) => void;
};

export type HLSPlayerHandle = {
  seek: (ms: number) => void;
  // seekAndPlay jumps to the offset and starts playback. Used by row/bar
  // clicks where the user wants to "scrub here and watch it" in one gesture.
  seekAndPlay: (ms: number) => void;
  currentMs: () => number;
};

export const HLSPlayer = forwardRef<HLSPlayerHandle, Props>(function HLSPlayer(
  { src, startedAtTC, frameRate, onTimeUpdate },
  forwardedRef,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shuttle, setShuttle] = useState<'normal' | 'reverse'>('normal');
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
        // Whole-ms everywhere so downstream consumers (timeline, log editor,
        // in-progress log) can send the values straight to the int64 backend.
        const ms = Math.round(v.currentTime * 1000);
        setCurrentMs(ms);
        let durMs = 0;
        if (!Number.isNaN(v.duration) && v.duration !== Infinity) {
          durMs = Math.round(v.duration * 1000);
          setDurationMs(durMs);
        }
        setPlaying(!v.paused);
        if (onTimeUpdate) onTimeUpdate(ms, durMs);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onTimeUpdate]);

  // Imperative handle so the Studio can seek / read currentMs.
  // currentMs is rounded to whole ms — the backend's offset_in/offset_out are
  // int64 and barf on the float that v.currentTime * 1000 naturally produces.
  useImperativeHandle(
    forwardedRef,
    () => ({
      seek: (ms: number) => {
        const v = videoRef.current;
        if (v) v.currentTime = Math.max(0, ms / 1000);
      },
      seekAndPlay: (ms: number) => {
        const v = videoRef.current;
        if (!v) return;
        setShuttle('normal');
        v.playbackRate = 1;
        v.currentTime = Math.max(0, ms / 1000);
        void v.play();
      },
      currentMs: () => {
        const v = videoRef.current;
        return v ? Math.round(v.currentTime * 1000) : 0;
      },
    }),
    [],
  );

  // Transport keyboard handler.
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setShuttle('normal');
    v.playbackRate = 1;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

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
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frameRate, togglePlay]);

  const statusLabel =
    shuttle === 'reverse' ? '◀◀ J 2x' : playing ? '▶ play' : '⏸ paused';

  return (
    <Stack gap={4}>
      {/* Video stripped of native controls — seeking lives on the timeline
          below, transport on the keyboard. Click-to-toggle-play on the video
          itself keeps the basic case discoverable. */}
      <div
        style={{ background: '#000', position: 'relative', cursor: 'pointer' }}
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          style={{ width: '100%', maxHeight: 540, display: 'block' }}
          playsInline
        />
      </div>

      {/* Single-line HUD: wall TC + relative TC + status pill + tiny help. */}
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Code style={{ fontSize: 14, padding: '2px 6px' }}>
            {msToWallTC(currentMs, startedAtTC, frameRate)}
          </Code>
          <Text size="xs" c="dimmed" ff="monospace">
            {msToRelativeTC(currentMs, frameRate)}
            {durationMs > 0 ? ` / ${msToRelativeTC(durationMs, frameRate)}` : ''}
          </Text>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Badge color={playing ? 'scoreplay-green' : 'gray'} variant="light" size="sm">
            {statusLabel}
          </Badge>
          <Tooltip
            multiline
            w={260}
            label={
              'Space play/pause · J/K/L shuttle (-2x/pause/+2x) · ←/→ frame step · Shift+←/→ ±5s · click anywhere on the timeline to seek.'
            }
          >
            <Text
              c="dimmed"
              size="xs"
              style={{
                cursor: 'help',
                padding: '0 4px',
                border: '1px solid #2a2a2a',
                borderRadius: 3,
              }}
            >
              ?
            </Text>
          </Tooltip>
        </Group>
      </Group>

      {error && (
        <Text c="red" size="xs">
          {error}
        </Text>
      )}
    </Stack>
  );
});
