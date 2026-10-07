// Polls the YouTube Data API v3 for live chat messages and turns them into
// two kinds of events, emitted through the given EventEmitter-like `bus`:
//   bus.emit('chat', { id, author, text, timestamp, vote, superChat })
//   bus.emit('vote', { code, countryName, weight, superChat })
//     (only for recognized votes — `weight` is 1 for a normal chat message,
//     and proportional to the amount paid for a Super Chat: see
//     `superChatWeight` below.)
//
// Super Chats (paid messages) carry `snippet.type === 'superChatEvent'` and
// a `snippet.superChatDetails` object with the amount and the commenter's
// text (in `userComment`, not `displayMessage`). We treat a `!vote` inside
// a Super Chat's comment as a much stronger vote than a free chat message,
// so paying viewers can meaningfully swing the round.
//
// Uses only Node's built-in fetch (Node 18+) — no extra HTTP client.
import { COUNTRY_CODES, COUNTRY_NAMES } from '../src/data/countries.js';

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';
const VOTE_RE = /^!vote\s+([A-Za-z]{2,20})\b/i;

// Build a case-insensitive lookup from both ISO code and full country name
// to the canonical uppercase code, so "!vote ro" and "!vote romania" both
// resolve to RO.
const NAME_TO_CODE = new Map();
for (const code of COUNTRY_CODES) {
  NAME_TO_CODE.set(code.toLowerCase(), code);
  const name = COUNTRY_NAMES[code];
  if (name) NAME_TO_CODE.set(name.toLowerCase(), code);
}

function resolveVoteTarget(rawToken) {
  const key = rawToken.trim().toLowerCase();
  return NAME_TO_CODE.get(key) || null;
}

function parseVote(text) {
  const match = text.match(VOTE_RE);
  if (!match) return null;
  // Support multi-word country names too: "!vote south korea" — greedily
  // try the longest trailing phrase first, then fall back to just the
  // first token (covers the common "!vote ro" / "!vote romania" cases).
  const afterCommand = text.slice(match.index + match[0].indexOf(match[1])).trim();
  const words = afterCommand.split(/\s+/);
  for (let take = Math.min(4, words.length); take >= 1; take--) {
    const candidate = words.slice(0, take).join(' ');
    const code = resolveVoteTarget(candidate);
    if (code) return { code, countryName: COUNTRY_NAMES[code] || code };
  }
  return null;
}

// How many "votes" one Super Chat is worth, proportional to the amount
// paid. `amountMicros` is the payment in micro-units of its currency
// (1,000,000 micros = 1 unit, e.g. 1 USD or 1 EUR) — we don't do currency
// conversion here, so this is "1 vote per whole currency unit paid", with a
// floor of MIN_SUPERCHAT_WEIGHT so even a small Super Chat clearly outweighs
// a free chat vote. Tune SUPERCHAT_VOTES_PER_UNIT via env if a channel's
// typical currency/amounts call for a different ratio.
const SUPERCHAT_VOTES_PER_UNIT = Number(process.env.SUPERCHAT_VOTES_PER_UNIT) || 10;
const MIN_SUPERCHAT_WEIGHT = 10;

function superChatWeight(amountMicros) {
  const units = (amountMicros || 0) / 1_000_000;
  return Math.max(MIN_SUPERCHAT_WEIGHT, Math.round(units * SUPERCHAT_VOTES_PER_UNIT));
}

async function ytFetch(path, params) {
  const url = new URL(`${YT_API_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube API ${path} failed: ${res.status} ${res.statusText} ${body}`);
  }
  return res.json();
}

async function resolveLiveChatId({ apiKey, liveVideoId, channelId }) {
  let videoId = liveVideoId;

  if (!videoId && channelId) {
    // Find the channel's current live broadcast.
    const search = await ytFetch('search', {
      key: apiKey,
      channelId,
      eventType: 'live',
      type: 'video',
      part: 'id',
      maxResults: 1,
    });
    videoId = search.items?.[0]?.id?.videoId || null;
  }

  if (!videoId) return { videoId: null, liveChatId: null };

  const videos = await ytFetch('videos', {
    key: apiKey,
    id: videoId,
    part: 'liveStreamingDetails',
  });
  const liveChatId = videos.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
  return { videoId, liveChatId };
}

export function startYoutubeChatPolling({ apiKey, liveVideoId, channelId, bus, log = console }) {
  let stopped = false;
  let pageToken;

  async function pollLoop() {
    if (stopped) return;

    if (!apiKey) {
      log.warn('[youtubeChat] YOUTUBE_API_KEY is not set — chat polling is disabled. See server/.env.example.');
      return; // don't retry forever with no key; the server still runs fine without chat.
    }

    let liveChatId;
    try {
      const resolved = await resolveLiveChatId({ apiKey, liveVideoId, channelId });
      liveChatId = resolved.liveChatId;
    } catch (err) {
      log.error('[youtubeChat] Failed to resolve live chat id:', err.message);
      liveChatId = null;
    }

    if (!liveChatId) {
      log.info('[youtubeChat] No active live video/chat found yet — retrying in 30s.');
      if (!stopped) setTimeout(pollLoop, 30000);
      return;
    }

    log.info(`[youtubeChat] Connected to live chat ${liveChatId}. Polling for messages...`);
    await pollMessages(liveChatId);
  }

  async function pollMessages(liveChatId) {
    if (stopped) return;
    try {
      const data = await ytFetch('liveChat/messages', {
        key: apiKey,
        liveChatId,
        part: 'snippet,authorDetails',
        pageToken,
      });
      pageToken = data.nextPageToken;

      for (const item of data.items || []) {
        const author = item.authorDetails?.displayName || 'unknown';
        const isSuperChat = item.snippet?.type === 'superChatEvent';
        const scDetails = item.snippet?.superChatDetails;

        // A Super Chat's actual comment lives in `userComment`, not
        // `displayMessage` (which YouTube leaves blank for these).
        const text = isSuperChat
          ? (scDetails?.userComment || '')
          : (item.snippet?.displayMessage || '');

        const rawVote = parseVote(text);
        const superChat = isSuperChat
          ? {
              amountMicros: scDetails?.amountMicros ? Number(scDetails.amountMicros) : 0,
              currency: scDetails?.currency || '',
              amountDisplayString: scDetails?.amountDisplayString || '',
              tier: scDetails?.tier ?? null,
            }
          : null;

        const vote = rawVote
          ? {
              ...rawVote,
              weight: superChat ? superChatWeight(superChat.amountMicros) : 1,
              superChat: Boolean(superChat),
            }
          : null;

        const chatMessage = {
          id: item.id,
          author,
          text,
          timestamp: item.snippet?.publishedAt || new Date().toISOString(),
          vote,
          superChat,
        };
        bus.emit('chat', chatMessage);
        if (vote) bus.emit('vote', vote);
      }

      const interval = Math.max(2000, data.pollingIntervalMillis || 5000);
      if (!stopped) setTimeout(() => pollMessages(liveChatId), interval);
    } catch (err) {
      log.error('[youtubeChat] Polling error, retrying in 10s:', err.message);
      if (!stopped) setTimeout(() => pollLoop(), 10000);
    }
  }

  pollLoop();

  return {
    stop() {
      stopped = true;
    },
  };
}
