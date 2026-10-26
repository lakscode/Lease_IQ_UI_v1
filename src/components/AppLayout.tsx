import { NavLink, Outlet, useNavigate } from 'react-router';
import { useState } from 'react';
import { useAuth } from '../auth/useAuth.ts';
import { LOCALE_NAMES, LOCALES, useI18n, type Locale } from '../i18n/index.tsx';
import { patch } from '../api/client.ts';
import { HelpButton } from '../features/account/HelpButton.tsx';
import { cx } from './ui-utils.ts';
import { BrandLogo } from './BrandLogo.tsx';

interface NavItem { to: string; key: string; icon: string; end?: boolean }

const NAV_GROUPS: { id: string; key: string; items: NavItem[] }[] = [
  {
    id: 'lease', key: 'nav.group.leaseAbstraction',
    items: [
      { to: '/dashboard', key: 'nav.dashboard', icon: '▦' },
      { to: '/portfolio', key: 'nav.portfolio', icon: '◔' },
      { to: '/leases', key: 'nav.leases', icon: '▤' },
      { to: '/assistant', key: 'nav.assistant', icon: '✦' },
      { to: '/reports', key: 'nav.reports', icon: '☰' },
      { to: '/import', key: 'nav.import', icon: '⇪' },
    ],
  },
  {
    id: 'fund', key: 'nav.group.fundAdmin',
    items: [
      { to: '/fund', key: 'nav.fund.overview', icon: '◈', end: true },
      { to: '/fund/funds', key: 'nav.fund.funds', icon: '▣' },
      { to: '/fund/properties', key: 'nav.fund.properties', icon: '⌂' },
      { to: '/fund/investors', key: 'nav.fund.investors', icon: '♟' },
      { to: '/fund/capital-calls', key: 'nav.fund.capitalCalls', icon: '⇣' },
      { to: '/fund/distributions', key: 'nav.fund.distributions', icon: '⇡' },
      { to: '/fund/nav', key: 'nav.fund.nav', icon: '≋' },
    ],
  },
];

const COLLAPSED_KEY = 'leaseiq.nav.collapsed';

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export default function AppLayout() {
  const { me, orgs, activeOrg, isOrgAdmin, isSuperAdmin, switchOrg, signOut, role } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)); } catch { /* private mode: this session only */ }
      return next;
    });
  };

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
          <BrandLogo />
          {activeOrg?.logo_url && <img src={activeOrg.logo_url} alt="" className="brand-logo brand-org-logo" />}
        </div>
        {/* Following a link closes the mobile menu; toggling a group doesn't. */}
        <nav className="nav" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setNavOpen(false); }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="nav-group">
              <button
                type="button"
                className="nav-group-title"
                aria-expanded={!collapsed[group.id]}
                aria-controls={`nav-group-${group.id}`}
                onClick={() => toggleGroup(group.id)}
              >
                <span>{t(group.key)}</span>
                <span className="nav-group-caret" aria-hidden="true">{collapsed[group.id] ? '▸' : '▾'}</span>
              </button>
              {!collapsed[group.id] && (
                <div id={`nav-group-${group.id}`} className="nav-group-items">
                  {group.items.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                      <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                      {t(item.key)}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
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
          {isSuperAdmin && (
            <NavLink to="/logs" className="nav-link">
              <span className="nav-icon" aria-hidden="true">☰</span>
              {t('nav.logs')}
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
