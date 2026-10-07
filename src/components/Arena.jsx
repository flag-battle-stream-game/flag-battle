import React, { useEffect, useRef } from 'react';

export default function Arena({ canvasRef, winnerState, stageAnnouncement, engineRef }) {
  const wrapRef = useRef(null);
  const winnerCanvasRef = useRef(null);

  // Responsive arena sizing: compute from the arena-wrap container's own
  // rect (flex gives it exactly the remaining space once the fixed-height
  // header/panels/footer/eliminated-bar are laid out), not window.innerWidth
  // directly. A ResizeObserver on this container is enough here because,
  // unlike the prototype's very first pass, the eliminated bar has a fixed
  // height and never grows the surrounding flex boxes mid-round.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      engineRef.current?.resize(rect.width, rect.height);
    };
    resize();
    let observer;
    if (window.ResizeObserver) {
      observer = new ResizeObserver(resize);
      observer.observe(wrap);
    } else {
      window.addEventListener('resize', resize);
    }
    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', resize);
    };
  }, [engineRef]);

  // Paint the winner's flag into the small showcase canvas whenever a
  // winner is shown.
  useEffect(() => {
    if (!winnerState.show || !winnerState.code) return;
    const canvas = winnerCanvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let attempts = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      engine.drawFlagInto(ctx, winnerState.code, 0, 0, canvas.width, canvas.height);
      attempts++;
      if (attempts < 30) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => raf && cancelAnimationFrame(raf);
  }, [winnerState.show, winnerState.code, engineRef]);

  return (
    <div ref={wrapRef} className="relative flex-1 min-h-0">
      <canvas ref={canvasRef} className="absolute top-0 left-0 block" />

      <div
        className={`winner-banner absolute top-1/2 left-1/2 bg-bg-deep/90 border-2 border-accent-gold rounded-lg px-6 py-3 text-center z-20 ${
          winnerState.show ? 'show' : ''
        }`}
      >
        <p className="m-0 text-text-soft text-[10px] tracking-[1.3px] uppercase opacity-70">{winnerState.label || 'Qualified'}</p>
        <h1 className="m-0 mt-1 text-accent-gold text-[17px] font-normal max-w-[220px]">{winnerState.name || '—'}</h1>
        <canvas
          ref={winnerCanvasRef}
          width={100}
          height={64}
          className="block mx-auto mt-2 border-2 border-accent-gold rounded-sm"
          style={{ boxShadow: '0 0 14px rgba(232,178,61,0.55), 0 3px 8px rgba(0,0,0,0.5)' }}
        />
      </div>

      <div
        className={`stage-announcement absolute top-1/2 left-1/2 bg-bg-deep/95 border-2 border-accent-pink rounded-[10px] px-11 py-6 text-center z-30 ${
          stageAnnouncement.show ? 'show' : ''
        }`}
      >
        <h1 className="m-0 text-accent-pink text-[28px] font-bold tracking-wide uppercase">{stageAnnouncement.title}</h1>
        <p className="m-0 mt-2 text-text-soft text-[13px] tracking-[1.5px] uppercase opacity-80">{stageAnnouncement.subtitle}</p>
      </div>
    </div>
  );
}
