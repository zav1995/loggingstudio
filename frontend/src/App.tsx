import { useCallback, useEffect } from 'react';
import { AppShell, Badge, Button, Group, NavLink, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { LaunchDialog } from './components/LaunchDialog';
import { useActiveMediaId } from './lib/active-media';
import { useSSE, type SSEEvent } from './api/useSSE';
import { dispatchSSE } from './lib/sse-bus';

const navItems = [
  { to: '/studio', label: 'Studio' },
  { to: '/tags', label: 'Tags' },
  { to: '/parsers', label: 'Parsers' },
  { to: '/sessions', label: 'Sessions' },
  { to: '/rejected', label: 'Rejected ingestions' },
] as const;

export function App() {
  const location = useLocation();
  const [activeMediaID] = useActiveMediaId();
  const [dialogOpen, { open: openDialog, close: closeDialog }] = useDisclosure(false);

  // Auto-open the dialog once on first load if no media is set. Subsequent
  // dismissals stick — the user can re-open from the header button.
  useEffect(() => {
    if (!activeMediaID) {
      openDialog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mount the single app-wide SSE connection. Every event goes through the
  // bus; route components subscribe via useSSEEvents. ingest.* events also
  // surface a toast right here so the user sees them even off the Studio
  // route.
  const onSSE = useCallback((evt: SSEEvent) => {
    dispatchSSE(evt);
    if (evt.type === 'ingest.processed') {
      notifications.show({
        color: 'scoreplay-green',
        title: 'Sidecar processed',
        message: summarizeIngestPayload(evt.payload),
      });
    } else if (evt.type === 'ingest.rejected') {
      notifications.show({
        color: 'red',
        title: 'Sidecar rejected',
        message: summarizeIngestPayload(evt.payload),
      });
    }
  }, []);

  const { status: sseStatus } = useSSE(onSSE);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Header
        px="md"
        style={{ display: 'flex', alignItems: 'center', background: '#161616' }}
      >
        <Group justify="space-between" w="100%">
          <Title order={4} c="white">
            Logging Studio
          </Title>
          <Group gap="xs">
            <Badge
              variant="dot"
              color={
                sseStatus === 'connected'
                  ? 'scoreplay-green'
                  : sseStatus === 'connecting'
                    ? 'yellow'
                    : 'red'
              }
              title={`live stream: ${sseStatus}`}
            >
              live
            </Badge>
            {activeMediaID ? (
              <Badge color="scoreplay-green" variant="light" maw={260} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeMediaID}
              </Badge>
            ) : (
              <Badge color="gray" variant="light">
                no active media
              </Badge>
            )}
            <Button size="xs" variant="default" onClick={openDialog}>
              {activeMediaID ? 'Change' : 'Set media'}
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            component={Link}
            to={item.to}
            label={item.label}
            active={
              location.pathname === item.to ||
              location.pathname.startsWith(item.to + '/')
            }
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
      <LaunchDialog opened={dialogOpen} onClose={closeDialog} />
    </AppShell>
  );
}

// summarizeIngestPayload extracts the most useful one-line description of an
// ingest event. The payload shape is owned by the watch loop (I5), so we
// pluck a handful of likely fields and fall back to a JSON stringification.
function summarizeIngestPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return typeof payload === 'string' ? payload : '';
  }
  const p = payload as Record<string, unknown>;
  const file = typeof p.file === 'string' ? p.file : typeof p.filename === 'string' ? p.filename : '';
  const reason = typeof p.reason === 'string' ? p.reason : '';
  const count =
    typeof p.count === 'number'
      ? p.count
      : Array.isArray(p.logs)
        ? p.logs.length
        : null;
  if (file && reason) return `${file} — ${reason}`;
  if (file && count !== null) return `${file} (${count} log${count === 1 ? '' : 's'})`;
  if (file) return file;
  if (reason) return reason;
  return JSON.stringify(payload).slice(0, 200);
}
