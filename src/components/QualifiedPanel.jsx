import React, { useEffect, useRef } from 'react';

function MiniFlag({ code, engineRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const ctx = canvas.getContext('2d');
    let raf;
    // Sprites load asynchronously, so keep trying for a few frames until
    // the real flag is ready instead of drawing the placeholder forever.
    let attempts = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      engine.drawFlagInto(ctx, code, 0, 0, canvas.width, canvas.height);
      attempts++;
      if (attempts < 30) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => raf && cancelAnimationFrame(raf);
  }, [code, engineRef]);

  return <canvas ref={canvasRef} width={20} height={13} className="flex-none rounded-[1px] block" />;
}

export default function QualifiedPanel({ title, rows, engineRef }) {
  const TOTAL_ROWS = 3;
  const placeholders = Math.max(0, TOTAL_ROWS - (rows?.length || 0));

  return (
    <div className="flex-none mx-4 mt-1 px-3.5 pt-1.5 pb-2 bg-bg-deep/60 border border-accent-gold/30 rounded-md">
      <div className="text-[10px] tracking-[1.3px] uppercase text-accent-gold text-center mb-1">{title}</div>
      <div className="qp-rows">
        {Array.from({ length: placeholders }).map((_, i) => (
          <div key={`ph-${i}`} className="h-[17px]" />
        ))}
        {(rows || []).map((entry) => (
          <div key={entry.idx} className="h-[17px] flex items-center gap-1.5 text-[10px] text-text-soft mt-0.5">
            <span className="flex-none w-6 text-text-soft/50">#{entry.idx}</span>
            <MiniFlag code={entry.code} engineRef={engineRef} />
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{entry.name}</span>
            <span className="flex-none text-[#5fd68a] text-[9px] tracking-wide">✓ Qualified</span>
          </div>
        ))}
      </div>
    </div>
  );
}
