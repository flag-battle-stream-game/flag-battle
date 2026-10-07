import React, { useEffect, useRef } from 'react';

// TV-lower-third-style overlay showing the most recent YouTube live chat
// messages, newest at the bottom, auto-scrolling. Messages recognized as
// vote commands (see server/youtubeChat.js) are flagged with a VOTE badge.
export default function ChatOverlay({ messages }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="absolute left-3 bottom-[100px] w-[280px] max-h-[240px] bg-bg-deep/70 border border-accent-gold/25 rounded-md flex flex-col overflow-hidden z-40 pointer-events-none">
      <div className="flex-none flex items-center gap-1.5 px-2.5 py-1.5 border-b border-accent-gold/15">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-accent-gold">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span className="text-[9px] tracking-[1.5px] uppercase text-accent-gold">Live Chat</span>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-2.5 py-1.5 flex flex-col gap-1">
        {messages.length === 0 && (
          <div className="text-[10px] text-text-soft/40 italic">Waiting for chat…</div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              'text-[10px] leading-snug animate-[elim-in_0.35s_ease_forwards] opacity-0 ' +
              (m.superChat
                ? 'bg-accent-pink/15 border border-accent-pink/40 rounded px-1.5 py-1 -mx-0.5'
                : '')
            }
            style={{ animationFillMode: 'forwards' }}
          >
            {m.superChat && (
              <span className="mr-1 inline-block bg-accent-pink text-white text-[8px] font-bold tracking-wide px-1 py-[1px] rounded align-middle">
                ★ {m.superChat.amountDisplayString || 'SUPER CHAT'}
              </span>
            )}
            <span className={m.superChat ? 'text-accent-pink font-bold' : 'text-accent-gold font-bold'}>{m.author}: </span>
            <span className="text-text-soft/90">{m.text}</span>
            {m.vote && (
              <span className="ml-1 inline-block bg-accent-crimson text-white text-[8px] font-bold tracking-wide px-1 py-[1px] rounded align-middle">
                VOTE · {m.vote.countryName}
                {m.vote.weight > 1 ? ` ×${m.vote.weight}` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
