// Tiny in-process event bus that fans the SSE stream out to any number of
// subscribers without making each subscriber open its own EventSource.
// FE2's useSSE handles the network side; this layer is the dispatch.

import { useEffect, useRef } from 'react';

import type { SSEEvent } from '../api/useSSE';

type Listener = (evt: SSEEvent) => void;

const listeners = new Set<Listener>();

export function dispatchSSE(evt: SSEEvent): void {
  listeners.forEach((l) => l(evt));
}

// Subscribe to every SSE event for the lifetime of the calling component.
// The handler is kept fresh via a ref so callers don't need to memoize it.
export function useSSEEvents(handler: Listener): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener: Listener = (evt) => ref.current(evt);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
