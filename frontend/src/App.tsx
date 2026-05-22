import { AppShell, Badge, Group, NavLink, Title } from '@mantine/core';
import { Link, Outlet, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/studio', label: 'Studio' },
  { to: '/tags', label: 'Tags' },
  { to: '/parsers', label: 'Parsers' },
  { to: '/sessions', label: 'Sessions' },
  { to: '/rejected', label: 'Rejected ingestions' },
] as const;

export function App() {
  const location = useLocation();
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
          <Badge color="scoreplay-green" variant="light">
            skeleton
          </Badge>
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
    </AppShell>
  );
}
