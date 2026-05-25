// usePickerSession is the network-backed sibling of the old
// BroadcastChannel hook. Both the studio and any popped-out picker windows
// open an EventSource to /api/picker-sessions/:id/stream and POST messages
// to /api/picker-sessions/:id/messages — the backend's in-process relay
// fans them out to every other subscriber on the same session id.

import { useCallback, useEffect, useRef } from 'react';

import type { PickerMessage } from './picker-channel';

const STREAM_PATH = (id: string) =>
  `/api/picker-sessions/${encodeURIComponent(id)}/stream`;
const PUBLISH_PATH = (id: string) =>
  `/api/picker-sessions/${encodeURIComponent(id)}/messages`;

export function usePickerSession(
  sessionID: string | null,
  handler: (msg: PickerMessage) => void,
): { publish: (msg: PickerMessage) => void } {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!sessionID) return;
    // EventSource auto-reconnects on transient drops, so we don't need to
    // wrap this in our own retry loop.
    const es = new EventSource(STREAM_PATH(sessionID));
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as PickerMessage;
        handlerRef.current(msg);
      } catch {
        // malformed payload — ignore.
      }
    };
    return () => es.close();
  }, [sessionID]);

  const publish = useCallback(
    (msg: PickerMessage) => {
      if (!sessionID) return;
      void fetch(PUBLISH_PATH(sessionID), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      });
    },
    [sessionID],
  );

  return { publish };
}
