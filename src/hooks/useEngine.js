import { useEffect, useRef, useState, useCallback } from 'react';
import { FlagBattleEngine } from '../lib/engine.js';
import { COUNTRIES } from '../data/countries.js';

// Instantiates a FlagBattleEngine bound to a <canvas> ref, wires its event
// emitter into React state, and exposes UI controls. One instance lives for
// the lifetime of <Arena/>; it is created on mount and stopped on unmount.
export function useEngine() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  const [hudState, setHudState] = useState({
    alive: 0,
    total: 0,
    progressPct: 100,
    roundNumber: 0,
    stageLabel: 'QUALIFYING',
    qualifiedCount: 0,
    stageTarget: 32,
  });
  const [winnerState, setWinnerState] = useState({ show: false });
  const [stageAnnouncement, setStageAnnouncement] = useState({ show: false });
  const [eliminatedList, setEliminatedList] = useState([]);
  const [qualifiedPanel, setQualifiedPanel] = useState({ title: '', rows: [] });
  const [timer, setTimer] = useState({ mm: '00', ss: '00' });
  const [soundEnabled, setSoundEnabledState] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const engine = new FlagBattleEngine(canvasRef.current, COUNTRIES);
    engineRef.current = engine;

    const unsubs = [
      engine.on('hud', setHudState),
      engine.on('winner', setWinnerState),
      engine.on('stage', setStageAnnouncement),
      engine.on('eliminated', setEliminatedList),
      engine.on('qualifiedListChanged', setQualifiedPanel),
      engine.on('timer', setTimer),
      engine.on('soundChanged', ({ enabled }) => setSoundEnabledState(enabled)),
    ];

    engine.start();

    return () => {
      unsubs.forEach((unsub) => unsub());
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  const newRound = useCallback(() => engineRef.current?.newRound(), []);
  const shrinkArena = useCallback(() => engineRef.current?.shrinkArena(), []);
  const toggleSound = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.primeAudioOnGesture();
    engine.setSoundEnabled(!engine.soundEnabled);
  }, []);
  const applyVoteBoost = useCallback((code, factor, durationMs) => {
    engineRef.current?.applyVoteBoost(code, factor, durationMs);
  }, []);

  return {
    canvasRef,
    engineRef,
    hudState,
    winnerState,
    stageAnnouncement,
    eliminatedList,
    qualifiedDisplayList: qualifiedPanel,
    timer,
    controls: { newRound, shrinkArena, toggleSound, soundEnabled, applyVoteBoost },
  };
}
