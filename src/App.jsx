import React, { useState, useCallback } from 'react';
import { useEngine } from './hooks/useEngine.js';
import { useYoutubeChat } from './hooks/useYoutubeChat.js';
import { COUNTRIES } from './data/countries.js';
import Header from './components/Header.jsx';
import QualifiedPanel from './components/QualifiedPanel.jsx';
import RoundInfo from './components/RoundInfo.jsx';
import Arena from './components/Arena.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import EliminatedBar from './components/EliminatedBar.jsx';
import Footer from './components/Footer.jsx';
import ChatOverlay from './components/ChatOverlay.jsx';

export default function App() {
  const {
    canvasRef,
    engineRef,
    hudState,
    winnerState,
    stageAnnouncement,
    eliminatedList,
    qualifiedDisplayList,
    timer,
    controls,
  } = useEngine();

  const [chatMessages, setChatMessages] = useState([]);

  // Simple, clearly-scoped vote -> gameplay hook: every time the tally
  // updates, boost whichever country currently has the most votes. If that
  // country isn't among the flags still alive in the current mini-battle,
  // applyVoteBoost is a harmless no-op (the engine only reads a code's
  // boost for flags that are actually in play). Exact game-balance tuning
  // (factor, duration, decay curve) is intentionally left for later.
  const handleVoteTally = useCallback(
    (tally) => {
      let bestCode = null;
      let bestCount = 0;
      Object.entries(tally).forEach(([code, count]) => {
        if (count > bestCount) {
          bestCount = count;
          bestCode = code;
        }
      });
      if (bestCode) {
        controls.applyVoteBoost(bestCode, 1.4, 5000);
      }
    },
    [controls]
  );

  useYoutubeChat({
    onMessage: (msg) => setChatMessages((prev) => [...prev.slice(-49), msg]),
    onVoteTally: handleVoteTally,
  });

  return (
    <div className="stadium-backdrop flex flex-col h-full relative">
      <Header
        flagCount={COUNTRIES.length}
        onNewRound={controls.newRound}
        onShrinkArena={controls.shrinkArena}
        onToggleSound={controls.toggleSound}
        soundEnabled={controls.soundEnabled}
      />

      <QualifiedPanel title={qualifiedDisplayList.title} rows={qualifiedDisplayList.rows} engineRef={engineRef} />

      <RoundInfo
        roundNumber={hudState.roundNumber}
        stageLabel={hudState.stageLabel}
        qualifiedCount={hudState.qualifiedCount}
        stageTarget={hudState.stageTarget}
        timer={timer}
      />

      <Arena canvasRef={canvasRef} winnerState={winnerState} stageAnnouncement={stageAnnouncement} engineRef={engineRef} />

      <ProgressBar alive={hudState.alive} total={hudState.total} progressPct={hudState.progressPct} />

      <EliminatedBar eliminatedList={eliminatedList} engineRef={engineRef} />

      <Footer />

      <ChatOverlay messages={chatMessages} />
    </div>
  );
}
