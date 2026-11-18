import { useState } from 'react';

// Official WRTS mark, cut out from its black field (public/assets/brand/).
// Brand blue on light surfaces; the white version on navy and in dark mode,
// where the blue would disappear. Never stretched, rotated or given effects.
// If a file is missing the text wordmark is shown, so no broken image appears.
const BASE = import.meta.env.BASE_URL ?? './';
export const LOGO_BLUE = `${BASE}assets/brand/wrts-wordmark.webp`;
export const LOGO_WHITE = `${BASE}assets/brand/wrts-wordmark-white.webp`;

/** on: 'dark' (navy surface, white mark) or 'auto' (page surface: blue, white in dark mode). */
function Logo({ on = 'auto', alt, className, fallback }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  if (on === 'dark') return <img src={LOGO_WHITE} alt={alt} className={className} onError={() => setFailed(true)} />;
  return (
    <picture>
      <source srcSet={LOGO_WHITE} media="(prefers-color-scheme: dark)" />
      <img src={LOGO_BLUE} alt={alt} className={className} onError={() => setFailed(true)} />
    </picture>
  );
}

/** Logo + "EventOS". Sidebar and top bar sit on navy; public pages on the page background. */
export function BrandLockup({ variant = 'primary', on = 'dark' }) {
  const text = <span className="brand-mark">WRTS</span>;
  return (
    <>
      <Logo on={on} alt="WRTS" className={variant === 'primary' ? 'brand-logo' : 'brand-wordmark'} fallback={text} />
      <span className="brand-sub">EventOS</span>
    </>
  );
}

/** Large mark for navy hero panels. */
export function BrandHero() {
  return <Logo on="dark" alt="We Run These Streetz" className="brand-hero-logo" fallback={null} />;
}
