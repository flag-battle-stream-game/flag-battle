import express from 'express';
import cors from 'cors';
import { EventEmitter } from 'node:events';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startYoutubeChatPolling } from './youtubeChat.js';

// ---- Minimal .env loader (no dependency needed for this small server) ----
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 8787;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const YOUTUBE_LIVE_VIDEO_ID = process.env.YOUTUBE_LIVE_VIDEO_ID || '';
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || '';

const app = express();
app.use(cors());
app.use(express.json());

// ---- In-memory state: recent chat + current vote tally ----
const bus = new EventEmitter();
bus.setMaxListeners(100);

const RECENT_MESSAGES_CAP = 200;
let recentMessages = [];
let voteTally = {}; // { [countryCode]: count }

bus.on('chat', (msg) => {
  recentMessages.push(msg);
  if (recentMessages.length > RECENT_MESSAGES_CAP) {
    recentMessages = recentMessages.slice(-RECENT_MESSAGES_CAP);
  }
});

bus.on('vote', ({ code, weight }) => {
  voteTally[code] = (voteTally[code] || 0) + (weight || 1);
});

// ---- SSE: GET /api/chat-stream ----
const sseClients = new Set();

app.get('/api/chat-stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

function broadcastChat(msg) {
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}
bus.on('chat', broadcastChat);

// Keep-alive ping so intermediary proxies don't time out idle SSE connections.
setInterval(() => {
  for (const client of sseClients) client.write(': ping\n\n');
}, 25000);

// ---- REST: votes ----
app.get('/api/votes', (req, res) => {
  res.json(voteTally);
});

app.post('/api/votes/reset', (req, res) => {
  voteTally = {};
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(YOUTUBE_API_KEY), messagesBuffered: recentMessages.length });
});

app.listen(PORT, () => {
  console.log(`[server] Flag Battle BFF listening on http://localhost:${PORT}`);
});

// ---- Start polling YouTube live chat (no-op gracefully if unconfigured) ----
startYoutubeChatPolling({
  apiKey: YOUTUBE_API_KEY,
  liveVideoId: YOUTUBE_LIVE_VIDEO_ID,
  channelId: YOUTUBE_CHANNEL_ID,
  bus,
});
