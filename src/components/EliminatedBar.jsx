import React, { useEffect, useRef } from 'react';

function EliminatedFlag({ code, engineRef }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const ctx = canvas.getContext('2d');
    let raf;
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
  return <canvas ref={canvasRef} width={16} height={11} className="rounded-[2px]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />;
}

export default function EliminatedBar({ eliminatedList, engineRef }) {
  return (
    <div className="relative flex-none w-full h-[90px] overflow-hidden box-border bg-black/[0.55] border-t border-accent-gold/20 z-[15]">
      <div className="absolute top-0 left-0 bottom-0 w-[62px] pt-[7px] px-2 text-accent-crimson text-[9px] tracking-wide uppercase border-r border-accent-gold/15 box-border">
        Eliminated
      </div>
      {/* Absolute-positioned scroll container — not ambiguous flexbox
          overflow — so the track always scrolls reliably regardless of
          how many chips it holds. */}
      <div className="absolute top-0 left-[62px] right-0 bottom-0 overflow-y-auto box-border px-2.5 py-1.5" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
        <div className="flex flex-wrap gap-1 content-start">
          {eliminatedList.map((f, i) => (
            <div key={`${f.code}-${i}`} className="eliminated-item flex flex-col items-center gap-[1px]">
              <EliminatedFlag code={f.code} engineRef={engineRef} />
              <div className="text-[6px] text-text-soft/45 tracking-[0.3px]">{f.code}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
