import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { ConfirmProvider } from './components/ui/Confirm.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { FeedbackProvider } from './components/feedback/FeedbackLauncher.jsx';
import { CurrentProspectProvider } from './lib/currentProspect.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <CurrentProspectProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <FeedbackProvider>
                <App />
              </FeedbackProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </CurrentProspectProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
