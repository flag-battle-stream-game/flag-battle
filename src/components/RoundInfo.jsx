import React from 'react';

export default function RoundInfo({ roundNumber, stageLabel, qualifiedCount, stageTarget, timer }) {
  return (
    <div className="flex-none text-center py-1.5 text-[11px] tracking-[1.5px] uppercase text-text-soft/75">
      <span>BATTLE {roundNumber}</span>
      <span className="text-text-soft/30 mx-1.5">·</span>
      <span>
        {stageLabel} ({qualifiedCount}/{stageTarget})
      </span>
      <span className="text-text-soft/30 mx-1.5">·</span>
      <span className="text-[#6cc3ff] tabular-nums">
        {timer.mm}:{timer.ss}
      </span>
    </div>
  );
}
