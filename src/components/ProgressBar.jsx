import React from 'react';

export default function ProgressBar({ alive, total, progressPct }) {
  return (
    <div className="flex-none px-5 pt-1.5 pb-1 text-center">
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mx-auto mb-1.5 max-w-[640px]">
        <div
          className="h-full rounded-full transition-[width] duration-200 ease-out"
          style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #6cc3ff, #3e8ef0)' }}
        />
      </div>
      <div className="text-[13px] tracking-wide">
        <span className="text-[#6cc3ff] font-bold">{alive}</span> / {total} FLAGS REMAINING
      </div>
      <div className="text-[9px] tracking-[1.5px] uppercase text-text-soft/45 mt-0.5">
        {total} FLAGS · ONE FINAL PLACE
      </div>
    </div>
  );
}
