import { useEffect, useRef } from 'react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8787';
const MAX_MESSAGES = 200;

// Opens an EventSource to the BFF's SSE chat stream, keeps a capped list of
// recent messages (for ChatOverlay via onMessage), tracks a running vote
// tally client-side from each message's parsed `vote`, and calls
// onVoteTally(tally) whenever it changes so the caller can decide how to
// feed that into the game (see App.jsx's handleVoteTally, which boosts
// whichever code currently has the most votes).
//
// Reconnects automatically (the browser's EventSource does this natively
// on a dropped connection); if the server is simply not running yet, this
// hook fails silently and the overlay just stays empty — the physics
// engine itself never depends on this connection existing.
export function useYoutubeChat({ onMessage, onVoteTally } = {}) {
  const tallyRef = useRef({});

  useEffect(() => {
    let es;
    try {
      es = new EventSource(`${SERVER_URL}/api/chat-stream`);
    } catch (e) {
      console.warn('[useYoutubeChat] Could not open chat stream:', e);
      return undefined;
    }

    es.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      onMessage?.(msg);

      if (msg.vote?.code) {
        const tally = { ...tallyRef.current };
        // Super Chat votes carry a `weight` (proportional to the amount
        // paid, computed server-side — see server/youtubeChat.js); a free
        // chat vote defaults to 1.
        tally[msg.vote.code] = (tally[msg.vote.code] || 0) + (msg.vote.weight || 1);
        tallyRef.current = tally;
        onVoteTally?.(tally);
      }
    };

    es.onerror = () => {
      // EventSource retries automatically; nothing to do here beyond not
      // crashing the app when the BFF isn't up yet.
    };

    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset the local tally whenever the server-side one is cleared (e.g. a
  // new round starting) by re-fetching it once on mount and letting the SSE
  // stream build it back up from there. A full reset endpoint call is left
  // to whatever triggers "New Round" in a future wiring — see README.
  useEffect(() => {
    fetch(`${SERVER_URL}/api/votes`)
      .then((r) => r.json())
      .then((tally) => {
        tallyRef.current = tally || {};
      })
      .catch(() => {
        /* server not up yet — ignore */
      });
  }, []);
}
