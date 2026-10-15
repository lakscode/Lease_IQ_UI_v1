// The Lease IQ wordmark (public/logo-wordmark*.png, trimmed from public/logo.png). Two images so the dark theme
// gets the light-text version; CSS shows the one that matches the theme.
import { useT } from '../i18n/index.tsx';

export function BrandLogo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const t = useT();
  return (
    <span className={`brand-wordmark brand-wordmark-${size}`}>
      <img src="/logo-wordmark.png" alt={t('app.name')} className="brand-wordmark-light" />
      <img src="/logo-wordmark-dark.png" alt={t('app.name')} className="brand-wordmark-dark" />
    </span>
  );
}
