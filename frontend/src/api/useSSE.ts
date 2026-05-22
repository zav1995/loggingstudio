// useSSE subscribes to /api/events with auto-reconnect.
//
// The backend sends events as named SSE messages ("event: log.created" etc.)
// so we register a listener per known event type. The default `message`
// listener is also wired in case a future event type lands without our hook
// being updated.

import { useEffect, useRef, useState } from 'react';

const EVENT_TYPES = [
  'log.created',
  'log.updated',
  'log.deleted',
  'ingest.processed',
  'ingest.rejected',
] as const;

export type SSEEventType = (typeof EVENT_TYPES)[number] | string;

export type SSEEvent = {
  type: SSEEventType;
  payload: unknown;
};

export type SSEStatus = 'connecting' | 'connected' | 'disconnected';

export function useSSE(
  onEvent: (evt: SSEEvent) => void,
  path: string = '/api/events',
): { status: SSEStatus } {
  const [status, setStatus] = useState<SSEStatus>('connecting');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let retryHandle: ReturnType<typeof setTimeout> | null = null;
    let retryDelayMs = 1_000;
    const maxRetryDelayMs = 15_000;

    const handle = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as SSEEvent;
        onEventRef.current(parsed);
      } catch {
        // ignore malformed payloads
      }
    };

    const connect = () => {
      if (cancelled) return;
      setStatus('connecting');
      es = new EventSource(path);
      es.onopen = () => {
        if (cancelled) return;
        retryDelayMs = 1_000;
        setStatus('connected');
      };
      es.onerror = () => {
        if (cancelled) return;
        es?.close();
        es = null;
        setStatus('disconnected');
        retryHandle = setTimeout(connect, retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
      };
      es.onmessage = handle;
      for (const t of EVENT_TYPES) {
        es.addEventListener(t, handle as EventListener);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (retryHandle) clearTimeout(retryHandle);
      es?.close();
    };
  }, [path]);

  return { status };
}
