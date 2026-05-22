import { useEffect } from 'react';
import { AppShell, Badge, Button, Group, NavLink, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { LaunchDialog } from './components/LaunchDialog';
import { useActiveMediaId } from './lib/active-media';

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
