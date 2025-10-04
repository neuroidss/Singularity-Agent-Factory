
import React from 'react';
import ReactDOM from 'react-dom/client';
// Fix: Changed to a default import to match the updated export in App.tsx. This resolves module resolution errors.
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);