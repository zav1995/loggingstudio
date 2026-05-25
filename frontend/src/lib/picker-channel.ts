// Cross-window message bus for the pop-out tag picker. Uses BroadcastChannel
// (same-origin, multi-window). The main Studio window owns the source of
// truth and publishes 'state'; the popped-out picker window publishes
// actions ('toggleTag', 'setIn', 'setOut', 'commit', 'discard') that the
// main window applies.

import { useCallback, useEffect, useRef } from 'react';

import type { Tag, TagGroup } from '../api/schemas';
import type { InProgressLog } from '../components/InProgressBar';

export const PICKER_CHANNEL_NAME = 'loggingstudio.picker';

export type PickerState = {
  tags: Tag[];
  groups: TagGroup[];
  inProgress: InProgressLog | null;
  frameRate: number;
  mediaID: string | null;
};

export type PickerMessage =
  | { kind: 'state'; state: PickerState }
  | { kind: 'toggleTag'; tagID: string }
  | { kind: 'setIn' }
  | { kind: 'setOut' }
  | { kind: 'commit' }
  | { kind: 'discard' }
  | { kind: 'requestState' };

// usePickerChannel opens a BroadcastChannel for the lifetime of the calling
// component. The handler is kept fresh via a ref so callers don't have to
// memoize it.
export function usePickerChannel(handler: (msg: PickerMessage) => void): {
  publish: (msg: PickerMessage) => void;
} {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const ch = new BroadcastChannel(PICKER_CHANNEL_NAME);
    channelRef.current = ch;
    const onMessage = (e: MessageEvent) => {
      handlerRef.current(e.data as PickerMessage);
    };
    ch.addEventListener('message', onMessage);
    return () => {
      ch.removeEventListener('message', onMessage);
      ch.close();
      channelRef.current = null;
    };
  }, []);

  const publish = useCallback((msg: PickerMessage) => {
    channelRef.current?.postMessage(msg);
  }, []);

  return { publish };
}
