import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App';
import { MessageProvider } from '../contexts/MessageContext';
import { LinesProvider } from '../contexts/LinesContext';
import { NetworkProvider } from '../contexts/NetworkContext';
import '../styles.css';
import { seedFakeData } from './seed';
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
  // Give MessageProvider's window.onmessage listener a tick to attach.
  setTimeout(seedFakeData, 100);
} else {
  console.error('Root element not found');
}
