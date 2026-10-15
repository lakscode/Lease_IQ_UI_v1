// Catches render errors anywhere below it, reports them to the error log and shows a reload screen instead of a
// blank page.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useT } from '../i18n/index.tsx';
import { reportError } from '../lib/errorLog.ts';

function CrashScreen() {
  const t = useT();
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{t('common.error')}</h1>
        <p className="muted">{t('common.crashBody')}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>{t('common.reloadPage')}</button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError({
      area: 'ui.render',
      message: error.message || String(error),
      code: error.name,
      details: { stack: error.stack?.split('\n').slice(0, 6).join('\n'), component: info.componentStack?.split('\n').slice(0, 6).join('\n') },
    });
  }

  render() {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}
