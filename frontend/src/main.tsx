import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
} from 'react-router-dom';

import { App } from './App';
import { Parsers } from './routes/parsers';
import { Rejected } from './routes/rejected';
import { Sessions } from './routes/sessions';
import { Studio } from './routes/studio';
import { Tags } from './routes/tags';
import { scoreplayTheme } from './theme';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/studio" replace /> },
      { path: 'studio', element: <Studio /> },
      { path: 'tags', element: <Tags /> },
      { path: 'parsers', element: <Parsers /> },
      { path: 'sessions', element: <Sessions /> },
      { path: 'rejected', element: <Rejected /> },
    ],
  },
]);

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('root element not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <MantineProvider theme={scoreplayTheme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      <RouterProvider router={router} />
    </MantineProvider>
  </StrictMode>,
);
