import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.tsx';
import { I18nProvider } from './i18n/I18nProvider.tsx';
import { AuthProvider } from './auth/AuthProvider.tsx';
import { ConfirmProvider, ToastProvider } from './components/ui.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { installGlobalErrorReporting } from './lib/errorLog.ts';
import './styles.css';

installGlobalErrorReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
