import { useCallback, useEffect } from 'react';
import { AppShell, Badge, Burger, Button, Group, NavLink, Title } from '@mantine/core';
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
  // Sidebar collapse: starts open. On mobile, Mantine's breakpoint logic
  // handles open/close separately; the desktop flag below maps to the
  // burger toggle.
  const [navOpen, { toggle: toggleNav }] = useDisclosure(true);

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
      header={{ height: 48 }}
      navbar={{
        width: 200,
        breakpoint: 'sm',
        collapsed: { mobile: !navOpen, desktop: !navOpen },
      }}
      padding="sm"
    >
      <AppShell.Header
        px="sm"
        style={{ display: 'flex', alignItems: 'center', background: '#161616' }}
      >
        <Group justify="space-between" w="100%" gap="sm" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger
              opened={navOpen}
              onClick={toggleNav}
              size="sm"
              aria-label="toggle sidebar"
            />
            <Title order={5} c="white">
              Logging Studio
            </Title>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Badge
              variant="dot"
              size="sm"
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
              <Badge color="scoreplay-green" variant="light" size="sm" maw={260} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeMediaID}
              </Badge>
            ) : (
              <Badge color="gray" variant="light" size="sm">
                no active media
              </Badge>
            )}
            <Button size="xs" variant="default" onClick={openDialog}>
              {activeMediaID ? 'Change' : 'Set media'}
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
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
