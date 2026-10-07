import React from 'react';

export default function Footer() {
  return (
    <div className="flex-none flex items-center justify-center gap-3.5 py-1.5 pb-2.5 text-text-soft/55 text-[10px] tracking-[2px] uppercase">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z" fill="currentColor" stroke="none" />
      </svg>
      <span>One World</span>
      <svg className="text-accent-gold" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 3h12v2h2.5a1 1 0 0 1 1 1c0 3-1.8 5.2-4.3 5.7A6 6 0 0 1 13 15.9V18h3v2H8v-2h3v-2.1A6 6 0 0 1 6.8 11.7C4.3 11.2 2.5 9 2.5 6a1 1 0 0 1 1-1H6V3zm0 4H4.6c.3 1.6 1.3 2.7 2.6 3.1A8 8 0 0 1 6 7zm12 0a8 8 0 0 1-.6 3.1c1.3-.4 2.3-1.5 2.6-3.1H18z" />
      </svg>
      <span>One Champion</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}
