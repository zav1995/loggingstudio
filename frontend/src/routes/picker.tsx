import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';

import { TagPicker } from '../components/TagPicker';
import {
  type PickerMessage,
  type PickerState,
  usePickerChannel,
} from '../lib/picker-channel';
import { msToRelativeTC } from '../lib/timecode';

// Standalone window route. The main Studio window publishes state changes
// over BroadcastChannel; this window publishes action messages back. No
// AppShell — this is intended to be popped into a separate browser window
// and live full-bleed.
export function PickerWindow() {
  const [state, setState] = useState<PickerState | null>(null);

  const onMessage = useCallback((msg: PickerMessage) => {
    if (msg.kind === 'state') {
      setState(msg.state);
    }
  }, []);
  const { publish } = usePickerChannel(onMessage);

  // Ask the main window to send us the current state on mount (and on
  // reload — Broadcast does not replay).
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    // Defer one tick so the channel subscription is in place.
    const handle = setTimeout(() => publish({ kind: 'requestState' }), 50);
    return () => clearTimeout(handle);
  }, [publish]);

  const toggleTag = useCallback(
    (tagID: string) => publish({ kind: 'toggleTag', tagID }),
    [publish],
  );

  // Keyboard handler — mirrors Studio's. The popped window can also drive
  // hotkeys, I/O, Enter, Esc. We forward as action messages and let the
  // main window apply.
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
      // Tag hotkey
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

  if (!state) {
    return (
      <Stack p="md" style={{ minHeight: '100vh', background: '#0A0A0A' }}>
        <Title order={4} c="white">
          Tag picker
        </Title>
        <Text c="dimmed" size="sm">
          Waiting for the main studio window…
        </Text>
        <Text c="dimmed" size="xs">
          (Open /studio in another tab/window first, then click "Pop out".)
        </Text>
      </Stack>
    );
  }

  const ip = state.inProgress;

  return (
    <Stack p="md" gap="md" style={{ minHeight: '100vh', background: '#0A0A0A' }}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Title order={4} c="white">
            Tag picker
          </Title>
          {state.mediaID && (
            <Badge color="scoreplay-green" variant="light" maw={260}>
              {state.mediaID}
            </Badge>
          )}
        </Group>
      </Group>

      <Card
        withBorder
        padding="sm"
        radius="md"
        bg={ip ? '#1a1a1a' : '#161616'}
        style={{ borderColor: ip ? '#00FF87' : '#2a2a2a' }}
      >
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="wrap">
              {ip ? (
                <>
                  <Badge color="scoreplay-green">recording</Badge>
                  <Text size="sm" ff="monospace" c="white">
                    in {msToRelativeTC(ip.offsetIn, state.frameRate)}
                    {ip.offsetOut !== null
                      ? ` → out ${msToRelativeTC(ip.offsetOut, state.frameRate)}`
                      : ''}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {ip.tags.length} tag{ip.tags.length === 1 ? '' : 's'}
                  </Text>
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  No log in progress — click a tag to start one.
                </Text>
              )}
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Button
                size="xs"
                variant="default"
                onClick={() => publish({ kind: 'setIn' })}
              >
                Set in
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => publish({ kind: 'setOut' })}
              >
                Set out
              </Button>
              <Button
                size="xs"
                color="scoreplay-green"
                disabled={!ip}
                onClick={() => publish({ kind: 'commit' })}
              >
                Commit
              </Button>
              <Button
                size="xs"
                variant="subtle"
                disabled={!ip}
                onClick={() => publish({ kind: 'discard' })}
              >
                Discard
              </Button>
            </Group>
          </Group>
        </Stack>
      </Card>

      <TagPicker
        tags={state.tags}
        groups={state.groups}
        selectedTagIDs={ip?.tags ?? []}
        onToggle={toggleTag}
      />
    </Stack>
  );
}
