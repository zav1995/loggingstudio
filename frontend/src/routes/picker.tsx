import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ConsoleTagGrid } from '../components/ConsoleTagGrid';
import type { PickerMessage, PickerState } from '../lib/picker-channel';
import { usePickerSession } from '../lib/picker-net';
import { msToRelativeTC } from '../lib/timecode';

// Standalone window route. The studio publishes state changes over the
// network relay (/api/picker-sessions/:id/{stream,messages}); this window
// publishes action messages back to the same session. The session id comes
// from ?session=<id> in the URL — the "Copy controls URL" button in the
// studio writes that URL.
export function PickerWindow() {
  const [params] = useSearchParams();
  const sessionID = params.get('session');

  const [state, setState] = useState<PickerState | null>(null);

  const onMessage = useCallback((msg: PickerMessage) => {
    if (msg.kind === 'state') {
      setState(msg.state);
    }
  }, []);
  const { publish } = usePickerSession(sessionID, onMessage);

  // Ask the studio to send us the current state on mount (the relay does
  // not replay history).
  const requested = useRef(false);
  useEffect(() => {
    if (!sessionID) return;
    if (requested.current) return;
    requested.current = true;
    const handle = setTimeout(() => publish({ kind: 'requestState' }), 200);
    return () => clearTimeout(handle);
  }, [publish, sessionID]);

  const toggleTag = useCallback(
    (tagID: string) => publish({ kind: 'toggleTag', tagID }),
    [publish],
  );

  // Keyboard handler — mirrors Studio's. The popped window can also drive
  // hotkeys, I/O, Enter, Esc. We forward as action messages and let the
  // studio apply.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }
      const tagHit = state.tags.find((t) => t.hotkey && t.hotkey === e.key);
      if (tagHit && tagHit.id) {
        e.preventDefault();
        publish({ kind: 'toggleTag', tagID: tagHit.id });
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'i') {
        e.preventDefault();
        publish({ kind: 'setIn' });
        return;
      }
      if (key === 'o') {
        e.preventDefault();
        publish({ kind: 'setOut' });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        publish({ kind: 'commit' });
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        publish({ kind: 'discard' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [publish, state]);

  if (!sessionID) {
    return (
      <div style={pageStyle}>
        <div style={{ color: '#FAFAFA', fontWeight: 700, marginBottom: 8 }}>
          TAG PICKER
        </div>
        <div style={{ color: '#888', fontSize: 13 }}>
          Missing session — the URL needs a ?session=&lt;id&gt; parameter.
        </div>
        <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>
          Open /studio on the main device and click "Copy controls URL" to
          paste here.
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={pageStyle}>
        <div style={{ color: '#FAFAFA', fontWeight: 700, marginBottom: 8 }}>
          TAG PICKER
        </div>
        <div style={{ color: '#888', fontSize: 13 }}>
          Waiting for the studio…
        </div>
        <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>
          (Session{' '}
          <code style={{ background: '#111', padding: '1px 4px' }}>
            {sessionID}
          </code>
          )
        </div>
      </div>
    );
  }

  const ip = state.inProgress;

  return (
    <div style={pageStyle}>
      <StatusBar state={state} publish={publish} />
      <ConsoleTagGrid
        tags={state.tags}
        groups={state.groups}
        selectedTagIDs={ip?.tags ?? []}
        onToggle={toggleTag}
      />
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#000000',
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

function StatusBar({
  state,
  publish,
}: {
  state: PickerState;
  publish: (msg: PickerMessage) => void;
}) {
  const ip = state.inProgress;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        background: ip ? '#0d2419' : '#111',
        border: `1px solid ${ip ? '#00FF87' : '#262626'}`,
        borderRadius: 4,
        color: '#FAFAFA',
        fontSize: 13,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <StatusPill on={Boolean(ip)} />
        {ip ? (
          <>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
              in {msToRelativeTC(ip.offsetIn, state.frameRate)}
              {ip.offsetOut !== null
                ? ` → out ${msToRelativeTC(ip.offsetOut, state.frameRate)}`
                : ''}
            </span>
            <span style={{ color: '#888', fontSize: 12 }}>
              {ip.tags.length} tag{ip.tags.length === 1 ? '' : 's'}
            </span>
          </>
        ) : (
          <span style={{ color: '#888' }}>
            No log in progress — tap a tile to start one.
          </span>
        )}
        {state.mediaID && (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 3,
              background: '#163b2a',
              color: '#00FF87',
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            }}
          >
            {state.mediaID}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <ConsoleControl
          label="SET IN"
          onClick={() => publish({ kind: 'setIn' })}
        />
        <ConsoleControl
          label="SET OUT"
          onClick={() => publish({ kind: 'setOut' })}
        />
        <ConsoleControl
          label="COMMIT"
          color="#00CC6C"
          disabled={!ip}
          onClick={() => publish({ kind: 'commit' })}
        />
        <ConsoleControl
          label="DISCARD"
          color="#552222"
          disabled={!ip}
          onClick={() => publish({ kind: 'discard' })}
        />
      </div>
    </div>
  );
}

function StatusPill({ on }: { on: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        padding: '3px 8px',
        borderRadius: 3,
        background: on ? '#00FF87' : '#333',
        color: on ? '#003317' : '#aaa',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: on ? '#003317' : '#666',
        }}
      />
      {on ? 'recording' : 'idle'}
    </span>
  );
}

function ConsoleControl({
  label,
  onClick,
  disabled,
  color = '#1f1f1f',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? '#181818' : color,
        color: disabled ? '#555' : '#FAFAFA',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        border: 'none',
        borderRadius: 3,
        padding: '8px 12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {label}
    </button>
  );
}
