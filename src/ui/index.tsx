import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { MessageProvider } from './contexts/MessageContext';
import { LinesProvider } from './contexts/LinesContext';
import { NetworkProvider } from './contexts/NetworkContext';
import './styles.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <MessageProvider>
        <LinesProvider>
          <NetworkProvider>
            <App />
          </NetworkProvider>
        </LinesProvider>
      </MessageProvider>
    </React.StrictMode>
  );
} else {
  console.error('Root element not found');
}
