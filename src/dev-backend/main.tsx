import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../ui/App';
import { MessageProvider } from '../ui/contexts/MessageContext';
import { LinesProvider } from '../ui/contexts/LinesContext';
import { NetworkProvider } from '../ui/contexts/NetworkContext';
import '../ui/styles.css';
import { installFakeBackend, seedInitialData } from './seed';
import DevPanel from './DevPanel';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <MessageProvider>
        <LinesProvider>
          <NetworkProvider>
            <App />
            <DevPanel />
          </NetworkProvider>
        </LinesProvider>
      </MessageProvider>
    </React.StrictMode>
  );
  installFakeBackend();
  // Give MessageProvider's window.onmessage listener a tick to attach.
  setTimeout(seedInitialData, 100);
} else {
  console.error('Root element not found');
}
