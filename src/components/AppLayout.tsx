import { NavLink, Outlet, useNavigate } from 'react-router';
import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.tsx';
import { LOCALE_NAMES, LOCALES, useI18n, type Locale } from '../i18n/index.tsx';
import { patch } from '../api/client.ts';
import { HelpButton } from '../features/account/HelpButton.tsx';
import { cx } from './ui.tsx';

const NAV = [
  { to: '/dashboard', key: 'nav.dashboard', icon: '▦' },
  { to: '/portfolio', key: 'nav.portfolio', icon: '◔' },
  { to: '/leases', key: 'nav.leases', icon: '▤' },
  { to: '/assistant', key: 'nav.assistant', icon: '✦' },
  { to: '/reports', key: 'nav.reports', icon: '☰' },
  { to: '/import', key: 'nav.import', icon: '⇪' },
];

export default function AppLayout() {
  const { me, orgs, activeOrg, isOrgAdmin, isSuperAdmin, switchOrg, signOut, role } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const name = me?.profile.display_name || me?.user.email || '';

  const changeLocale = (next: Locale) => {
    setLocale(next);
    // Persist to the profile so AI output uses it too. Ignore failures (local choice still applies).
    patch('/me', { locale: next }).catch(() => undefined);
  };

  const onSwitchOrg = (orgId: string) => {
    switchOrg(orgId);
    navigate('/dashboard');
  };

  return (
    <div className={cx('app-shell', navOpen && 'nav-open')}>
      <aside className="sidebar">
        <div className="brand">
          {activeOrg?.logo_url ? (
            <img src={activeOrg.logo_url} alt="" className="brand-logo" />
          ) : (
            <span className="brand-mark">IQ</span>
          )}
          <span className="brand-name">{t('app.name')}</span>
        </div>
        <nav className="nav" onClick={() => setNavOpen(false)}>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-link">
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {t(item.key)}
            </NavLink>
          ))}
          {(isOrgAdmin || isSuperAdmin) && <div className="nav-divider" />}
          {isOrgAdmin && (
            <NavLink to="/organization" className="nav-link">
              <span className="nav-icon" aria-hidden="true">⚑</span>
              {t('nav.organization')}
            </NavLink>
          )}
          {isSuperAdmin && (
            <NavLink to="/settings" className="nav-link">
              <span className="nav-icon" aria-hidden="true">⚙</span>
              {t('nav.settings')}
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn nav-toggle" onClick={() => setNavOpen((v) => !v)} aria-label="Menu">☰</button>
          {orgs.length > 0 && (
            <label className="org-switcher">
              <span className="sr-only">{t('nav.switchOrg')}</span>
              <select className="input" value={activeOrg?.id ?? ''} onChange={(e) => onSwitchOrg(e.target.value)}>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}{o.via_super_admin ? ' ★' : ''}</option>
                ))}
              </select>
            </label>
          )}
          {role === 'viewer' && <span className="badge badge-neutral">{t('common.readOnly')}</span>}
          <div className="topbar-spacer" />
          <label className="lang-select">
            <span className="sr-only">{t('nav.language')}</span>
            <select className="input" value={locale} onChange={(e) => changeLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
            </select>
          </label>
          <HelpButton />
          <div className="user-menu">
            <button type="button" className="user-btn" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
              <span className="avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
              <span className="user-name">{name}</span>
            </button>
            {menuOpen && (
              <div className="menu" onMouseLeave={() => setMenuOpen(false)}>
                <button type="button" className="menu-item" onClick={() => { setMenuOpen(false); navigate('/profile'); }}>
                  {t('nav.profile')}
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={async () => { setMenuOpen(false); await signOut(); navigate('/login', { replace: true }); }}
                >
                  {t('nav.signOut')}
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
