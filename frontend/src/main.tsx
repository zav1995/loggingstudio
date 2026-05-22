import '@mantine/core/styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';

import { App } from './App';
import { scoreplayTheme } from './theme';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('root element not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <MantineProvider theme={scoreplayTheme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
);
