// Conversion between SMPTE HH:MM:SS:FF timecode and milliseconds.
//
// Convention used everywhere in the studio:
//   - Internal time is always int64 milliseconds from media start (offset_in).
//   - SMPTE timecode only appears at the edges — the UI display, the launch
//     dialog, the parser's timecode_to_ms op.
// Drop-frame timecode (29.97 NTSC) is NOT supported at MVP. We treat every
// frame rate as integer, so 29.97 sources should be supplied as 30 with the
// understanding that the wall-clock drift is acceptable for logging.

const TC_RE = /^(\d{2}):(\d{2}):(\d{2}):(\d{2})$/;

export function tcToFrames(tc: string, frameRate: number): number {
  const m = TC_RE.exec(tc);
  if (!m) return 0;
  const [, hh, mm, ss, ff] = m;
  return (
    (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * frameRate + Number(ff)
  );
}

export function framesToTc(totalFrames: number, frameRate: number): string {
  const safe = Math.max(0, Math.floor(totalFrames));
  const ff = safe % frameRate;
  const totalSeconds = Math.floor(safe / frameRate);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600) % 24;
  return [hh, mm, ss, ff].map((n) => String(n).padStart(2, '0')).join(':');
}

// Wall-clock display TC for a media-relative ms offset, anchored on
// `started_at_tc` at the media's frame rate.
export function msToWallTC(
  offsetMs: number,
  startedAtTC: string,
  frameRate: number,
): string {
  const startFrames = tcToFrames(startedAtTC, frameRate);
  const offsetFrames = Math.round((offsetMs / 1000) * frameRate);
  return framesToTc(startFrames + offsetFrames, frameRate);
}

// Just the media-relative timecode (HH:MM:SS:FF starting at 00:00:00:00),
// useful for displaying log offsets without conflating with wall-clock.
export function msToRelativeTC(offsetMs: number, frameRate: number): string {
  const frames = Math.round((Math.max(0, offsetMs) / 1000) * frameRate);
  return framesToTc(frames, frameRate);
}
