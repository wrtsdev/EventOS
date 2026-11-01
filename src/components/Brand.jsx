import { useState } from 'react';

// Official WRTS marks. Files live in public/assets/brand/ and must be used as
// supplied: no redrawing, recoloring, stretching, rotating or effects.
// If a file is missing the text wordmark is shown instead, so the app never
// renders a broken image.
const BASE = import.meta.env.BASE_URL ?? './';
export const LOGO_PRIMARY = `${BASE}assets/brand/wrts-primary-logo.webp`;
export const LOGO_WORDMARK = `${BASE}assets/brand/wrts-wordmark.webp`;

function Logo({ src, alt, className, fallback }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

/** Sidebar and top bar lockup: WRTS mark + "EventOS". */
export function BrandLockup({ variant = 'primary' }) {
  const text = <span className="brand-mark">WRTS</span>;
  return (
    <>
      {variant === 'primary'
        ? <Logo src={LOGO_PRIMARY} alt="We Run These Streetz" className="brand-logo" fallback={text} />
        : <Logo src={LOGO_WORDMARK} alt="WRTS" className="brand-wordmark" fallback={text} />}
      <span className="brand-sub">EventOS</span>
    </>
  );
}

/** Large mark for the welcome screen. */
export function BrandHero() {
  return <Logo src={LOGO_PRIMARY} alt="We Run These Streetz" className="brand-hero-logo" fallback={null} />;
}
