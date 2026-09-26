// FlagBattleEngine — framework-agnostic physics + tournament engine.
//
// Ported faithfully from the single-file prototype: circular arena with
// elastic (no energy loss) collisions, a rotating gate flags can exit
// through, a rotating "blocker" arc that temporarily seals the gate, a
// 6-stage tournament bracket, sprite-cached flag rendering (now backed by
// real flag-icons SVGs instead of hand-drawn vector shapes), a flying
// elimination animation, fireworks, synthesized Web Audio sound effects,
// and a Web Speech champion announcement.
//
// This class owns no DOM outside the <canvas> it's given. React components
// subscribe to state changes via the small event-emitter API below instead
// of the prototype's direct DOM manipulation.
//
// ---------------------------------------------------------------------
// Public API
//   new FlagBattleEngine(canvas, countries)   countries: [{code, name}]
//   engine.start()                             begins the render loop
//   engine.stop()                              cancels the render loop
//   engine.resize(width, height)               call on container resize
//   engine.setSoundEnabled(bool)
//   engine.shrinkArena()
//   engine.newRound()                          resets the whole tournament
//   engine.applyVoteBoost(code, boostFactor, durationMs)
//   engine.on(event, cb) / engine.off(event, cb)
//
// Events emitted (all payloads are plain objects, safe to setState with):
//   'hud'                 { alive, total, progressPct, roundNumber,
//                            stageLabel, qualifiedCount, stageTarget }
//   'winner'               { show, label, name, code } | { show: false }
//   'stage'                 { show, title, subtitle } | { show: false }
//   'eliminated'            full current array of {code, name} chips, oldest first
//   'qualifiedListChanged'  { title, rows: [{idx, code, name}] } (already
//                            windowed to the current 3-row rotation)
//   'timer'                 { mm, ss } (string-padded, once per second)
//   'soundChanged'          { enabled }
// ---------------------------------------------------------------------

const STAGES = [
  { label: 'QUALIFYING', target: 32 },
  { label: 'ROUND OF 32', target: 16 },
  { label: 'ROUND OF 16', target: 8 },
  { label: 'QUARTERFINALS', target: 4 },
  { label: 'SEMIFINALS', target: 2 },
  { label: 'FINAL', target: 1 },
];

function rand(min, max) {
  return min + Math.random() * (max - min);
}
function norm(a) {
  while (a < 0) a += Math.PI * 2;
  while (a >= Math.PI * 2) a -= Math.PI * 2;
  return a;
}
function angleDiff(a, b) {
  let d = norm(a - b);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }
  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this.off(event, cb);
  }
  off(event, cb) {
    const set = this._listeners.get(event);
    if (set) set.delete(cb);
  }
  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    set.forEach((cb) => {
      try {
        cb(payload);
      } catch (e) {
        // A subscriber error should never crash the engine's render loop.
        console.error(`[FlagBattleEngine] listener for "${event}" threw:`, e);
      }
    });
  }
}

export class FlagBattleEngine extends EventEmitter {
  constructor(canvas, countries) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.countries = countries; // [{code, name}]
    this.countryNames = countries.reduce((acc, c) => {
      acc[c.code] = c.name;
      return acc;
    }, {});
    this.countryCodes = countries.map((c) => c.code);

    // ---- Arena / stage geometry ----
    this.STAGE_W = canvas.width || 800;
    this.STAGE_H = canvas.height || 600;
    this.CENTER = { x: this.STAGE_W / 2, y: this.STAGE_H / 2 };
    this.ARENA_RADIUS = 460;
    this.FLAG_R = 19;

    this.GATES = [{ angle: Math.PI / 2, half: 0.26 }];
    this.GATE_SPIN = 0.0035;
    this.BLOCKER = { angle: rand(0, Math.PI * 2), half: 0.34, speed: 0.006 };

    this.flags = [];
    this.running = true;
    this._rafId = null;

    this.roundNumber = 0;
    this.roundStartTime = Date.now();

    this.stageIndex = 0;
    this.stagePool = [];
    this.qualifiedThisStage = [];
    this.qualifiedDisplayList = []; // {code, idx}
    this.qpRotationIndex = 0;

    this.flyingEliminations = [];
    this.eliminatedList = []; // {code, name} — oldest first, mirrors the DOM chip strip
    this.fireworks = [];

    // ---- Sound state ----
    this.soundEnabled = true;
    this.audioCtx = null;
    this.ambienceGain = null;
    this.ambienceStarted = false;
    this.lastThumpTime = 0;

    // ---- Vote-boost (temporary speed/resilience multiplier for a code) ----
    this._voteBoosts = new Map(); // code -> { factor, until }

    this._sprites = new Map(); // code -> { img, canvas, ready }
    this._timerInterval = null;
    this._qpRotationInterval = null;

    this._bindResize = this._bindResize.bind(this);
  }

  // ================= Public API =================

  start() {
    this.stagePool = this.countryCodes.slice();
    this._spawnFlags();
    this._timerInterval = setInterval(() => this._tickTimer(), 1000);
    this._qpRotationInterval = setInterval(() => this._rotateQualifiedList(), 3200);
    this._loop();
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    if (this._timerInterval) clearInterval(this._timerInterval);
    if (this._qpRotationInterval) clearInterval(this._qpRotationInterval);
  }

  resize(width, height) {
    const newW = Math.max(1, Math.round(width));
    const newH = Math.max(100, Math.round(height));
    if (newW === this.STAGE_W && newH === this.STAGE_H) return;
    this.STAGE_W = newW;
    this.STAGE_H = newH;
    this.canvas.width = newW;
    this.canvas.height = newH;
    this.ARENA_RADIUS = this._computeArenaRadius(newW, newH);
    this.FLAG_R = Math.max(7, Math.min(19, this.ARENA_RADIUS / 24));
    this.CENTER = { x: newW / 2, y: newH / 2 };
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
    this._ensureAudio();
    this._startCrowdAmbience();
    if (this.ambienceGain) this.ambienceGain.gain.value = enabled ? 0.05 : 0;
    if (!enabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.emit('soundChanged', { enabled });
  }

  shrinkArena() {
    this.ARENA_RADIUS = Math.max(180, this.ARENA_RADIUS - 50);
  }

  newRound() {
    this.stageIndex = 0;
    this.stagePool = this.countryCodes.slice();
    this.qualifiedThisStage = [];
    this.qualifiedDisplayList = [];
    this.qpRotationIndex = 0;
    this.ARENA_RADIUS = this._computeArenaRadius(this.STAGE_W, this.STAGE_H);
    this.running = true;
    this._spawnFlags();
  }

  // Temporarily multiplies a flag's speed (and, via the multiplier applied
  // in the wall-bounce reflection, its effective "resilience") for
  // durationMs. Intended hook for YouTube-chat vote influence: call this
  // periodically with whichever alive country currently has the most votes.
  // Kept intentionally simple — exact balance is left for later tuning.
  applyVoteBoost(countryCode, boostFactor = 1.4, durationMs = 5000) {
    const until = Date.now() + durationMs;
    this._voteBoosts.set(countryCode, { factor: boostFactor, until });
  }

  // ================= Sound (ported from the prototype) =================

  _ensureAudio() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return null;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    return this.audioCtx;
  }

  _startCrowdAmbience() {
    if (this.ambienceStarted) return;
    const c = this._ensureAudio();
    if (!c) return;
    this.ambienceStarted = true;
    const bufferSize = c.sampleRate * 2;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // Two cascaded lowpass stages — keeps only a low rumble, like a distant
    // crowd murmur, rather than radio-static hiss from a single bandpass.
    const filter1 = c.createBiquadFilter();
    filter1.type = 'lowpass';
    filter1.frequency.value = 380;
    filter1.Q.value = 0.3;
    const filter2 = c.createBiquadFilter();
    filter2.type = 'lowpass';
    filter2.frequency.value = 220;
    filter2.Q.value = 0.3;
    this.ambienceGain = c.createGain();
    this.ambienceGain.gain.value = this.soundEnabled ? 0.05 : 0;
    src.connect(filter1);
    filter1.connect(filter2);
    filter2.connect(this.ambienceGain);
    this.ambienceGain.connect(c.destination);
    src.start();
  }

  _playTone(freq, duration, type, delay, peak) {
    if (!this.soundEnabled) return;
    const c = this._ensureAudio();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak || 0.14, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  _playQualifyChime() {
    this._playTone(660, 0.12, 'triangle', 0, 0.1);
    this._playTone(880, 0.16, 'triangle', 0.1, 0.1);
  }
  _playStageFanfare() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._playTone(f, 0.28, 'triangle', i * 0.12, 0.13));
  }
  _playChampionFanfare() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this._playTone(f, 0.4, 'sawtooth', i * 0.1, 0.1));
  }
  _playWhoosh() {
    if (!this.soundEnabled) return;
    const c = this._ensureAudio();
    if (!c) return;
    const bufferSize = Math.floor(c.sampleRate * 0.22);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, c.currentTime);
    filter.frequency.exponentialRampToValueAtTime(280, c.currentTime + 0.22);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.06, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start();
  }

  _playThump() {
    if (!this.soundEnabled) return;
    const c = this._ensureAudio();
    if (!c) return;
    const now = c.currentTime;
    if (now - this.lastThumpTime < 0.05) return; // 50ms throttle
    this.lastThumpTime = now;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  _speakChampion(name) {
    if (!this.soundEnabled) return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance('The winner is ' + name + '! Congratulations!');
      utter.rate = 0.95;
      utter.pitch = 1.05;
      utter.volume = 1;
      window.speechSynthesis.speak(utter);
    } catch (e) {
      // speech synthesis unsupported or blocked — ignore
    }
  }

  // Call on the first user gesture (e.g. a control button click) to satisfy
  // the browser's autoplay policy and "warm up" speech synthesis.
  primeAudioOnGesture() {
    this._ensureAudio();
    this._startCrowdAmbience();
    if ('speechSynthesis' in window) {
      try {
        const warm = new SpeechSynthesisUtterance(' ');
        warm.volume = 0;
        window.speechSynthesis.speak(warm);
      } catch (e) {
        /* ignore */
      }
    }
  }

  // ================= Tournament state machine =================

  currentStage() {
    return STAGES[this.stageIndex];
  }

  _ringPositions(count, radius, itemR) {
    const positions = [];
    const spacing = itemR * 2 + 6;
    let ring = 0;
    while (positions.length < count) {
      const ringRadius = spacing * 0.9 + ring * spacing;
      if (ringRadius > radius - itemR) break;
      const circumference = 2 * Math.PI * ringRadius;
      const capacity = ring === 0 ? 1 : Math.max(1, Math.floor(circumference / spacing));
      for (let i = 0; i < capacity && positions.length < count; i++) {
        const a = (i / capacity) * Math.PI * 2 + ring * 0.3;
        positions.push({
          x: this.CENTER.x + Math.cos(a) * ringRadius,
          y: this.CENTER.y + Math.sin(a) * ringRadius,
        });
      }
      ring++;
    }
    return positions;
  }

  _spawnFlags() {
    this.flags = [];
    this.eliminatedList = [];
    this.emit('eliminated', this.eliminatedList.slice());

    const codes = this.stagePool.slice();
    const positions = this._ringPositions(codes.length, this.ARENA_RADIUS, this.FLAG_R);

    codes.forEach((code, i) => {
      const pos = positions[i] || { x: this.CENTER.x, y: this.CENTER.y };
      const speed = rand(2.5, 8);
      const dir = rand(0, Math.PI * 2);
      this.flags.push({
        code,
        x: pos.x,
        y: pos.y,
        r: this.FLAG_R,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        alive: true,
      });
    });

    this.roundNumber++;
    this.roundStartTime = Date.now();
    this._emitHud();
    this._emitQualifiedList();
    this.emit('winner', { show: false });
    this.emit('stage', { show: false });
  }

  _emitHud() {
    const alive = this.flags.filter((f) => f.alive).length;
    const total = this.flags.length || this.stagePool.length;
    const stage = this.currentStage();
    this.emit('hud', {
      alive,
      total,
      progressPct: total ? (alive / total) * 100 : 100,
      roundNumber: this.roundNumber,
      stageLabel: stage.label,
      qualifiedCount: this.qualifiedThisStage.length,
      stageTarget: stage.target,
    });
  }

  _qualifiedPanelTitle() {
    const next = STAGES[this.stageIndex + 1];
    return next ? 'Qualified for ' + next.label : 'Crowning the champion';
  }

  _emitQualifiedList() {
    const TOTAL_ROWS = 3;
    const chunks = [];
    for (let i = 0; i < this.qualifiedDisplayList.length; i += TOTAL_ROWS) {
      chunks.push(this.qualifiedDisplayList.slice(i, i + TOTAL_ROWS));
    }
    const current = chunks.length ? chunks[this.qpRotationIndex % chunks.length] : [];
    const rows = current.map((entry) => ({
      idx: entry.idx,
      code: entry.code,
      name: this.countryNames[entry.code] || entry.code,
    }));
    this.emit('qualifiedListChanged', { title: this._qualifiedPanelTitle(), rows });
  }

  _rotateQualifiedList() {
    this.qpRotationIndex++;
    this._emitQualifiedList();
  }

  _tickTimer() {
    const secs = Math.floor((Date.now() - this.roundStartTime) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    this.emit('timer', { mm, ss });
  }

  _checkRoundEnd() {
    const alive = this.flags.filter((f) => f.alive).length;
    if (alive > 1 || this.flags.length <= 1) return;

    const survivor = this.flags.find((f) => f.alive);
    if (!survivor) return;

    this._showWinner(survivor);
    this.running = false;
    this._spawnFireworksCelebration();
    this._playQualifyChime();

    const stage = this.currentStage();
    this.qualifiedThisStage.push(survivor.code);
    this.qualifiedDisplayList.push({ code: survivor.code, idx: this.qualifiedThisStage.length });
    this._emitQualifiedList();
    this.stagePool = this.stagePool.filter((c) => c !== survivor.code);
    this._emitHud();

    if (this.qualifiedThisStage.length < stage.target) {
      setTimeout(() => {
        this.ARENA_RADIUS = this._computeArenaRadius(this.STAGE_W, this.STAGE_H);
        this.running = true;
        this._spawnFlags();
      }, 3200);
    } else if (stage.target === 1) {
      const championName = this.countryNames[survivor.code] || survivor.code;
      setTimeout(() => {
        this.emit('winner', { show: false });
        this._showStageAnnouncement('CHAMPION!', championName);
        this._playChampionFanfare();
      }, 800);
      setTimeout(() => this._speakChampion(championName), 1600);
      setTimeout(() => {
        this.stageIndex = 0;
        this.stagePool = this.countryCodes.slice();
        this.qualifiedThisStage = [];
        this.qualifiedDisplayList = [];
        this.qpRotationIndex = 0;
        this.ARENA_RADIUS = this._computeArenaRadius(this.STAGE_W, this.STAGE_H);
        this.running = true;
        this._spawnFlags();
      }, 6500);
    } else {
      const justFinished = stage;
      const nextStage = STAGES[this.stageIndex + 1];
      setTimeout(() => {
        this.emit('winner', { show: false });
        this._showStageAnnouncement(justFinished.target + ' QUALIFIED', 'Advancing to ' + nextStage.label);
        this._playStageFanfare();
      }, 800);
      setTimeout(() => {
        this.stageIndex++;
        this.stagePool = this.qualifiedThisStage.slice();
        this.qualifiedThisStage = [];
        this.qualifiedDisplayList = [];
        this.qpRotationIndex = 0;
        this.ARENA_RADIUS = this._computeArenaRadius(this.STAGE_W, this.STAGE_H);
        this.running = true;
        this._spawnFlags();
      }, 4800);
    }
  }

  _showWinner(f) {
    const stage = this.currentStage();
    const label = stage.target === 1 ? 'Tournament champion' : 'Qualified — ' + stage.label;
    this.emit('winner', {
      show: true,
      label,
      name: this.countryNames[f.code] || f.code,
      code: f.code,
    });
  }

  _showStageAnnouncement(title, subtitle) {
    this.emit('stage', { show: true, title, subtitle });
  }

  // ================= Flag sprites (real flag-icons SVGs) =================

  _getSprite(code) {
    let entry = this._sprites.get(code);
    if (entry) return entry;
    entry = { img: null, canvas: null, ready: false };
    this._sprites.set(code, entry);
    const img = new Image();
    img.onload = () => {
      const sw = 64;
      const sh = 40;
      const off = document.createElement('canvas');
      off.width = sw;
      off.height = sh;
      const octx = off.getContext('2d');
      // Letterbox the (usually 4:3) source into our fixed sprite box.
      const scale = Math.min(sw / img.width, sh / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      octx.drawImage(img, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
      entry.canvas = off;
      entry.ready = true;
    };
    img.onerror = () => {
      entry.ready = false;
    };
    img.src = `/flags/${code.toLowerCase()}.svg`;
    entry.img = img;
    return entry;
  }

  _drawFlagShape(f) {
    const ctx = this.ctx;
    const w = f.r * 2.15;
    const h = f.r * 1.4;
    const x0 = f.x - w / 2;
    const y0 = f.y - h / 2;
    const sprite = this._getSprite(f.code);
    if (sprite.ready && sprite.canvas) {
      ctx.drawImage(sprite.canvas, x0, y0, w, h);
    } else {
      // Neutral placeholder while the SVG is still loading.
      ctx.fillStyle = 'rgba(240,235,216,0.25)';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(240,235,216,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, w, h);
  }

  // Draws a code's flag into an arbitrary target canvas/context box —
  // used by the winner showcase and the qualified-panel mini flags.
  drawFlagInto(ctx, code, x0, y0, w, h) {
    const sprite = this._getSprite(code);
    if (sprite.ready && sprite.canvas) {
      ctx.drawImage(sprite.canvas, x0, y0, w, h);
    } else {
      ctx.fillStyle = 'rgba(240,235,216,0.25)';
      ctx.fillRect(x0, y0, w, h);
    }
  }

  // ================= Flying elimination + eliminated chips =================

  _eliminate(f) {
    if (!f.alive) return;
    f.alive = false;
    this._playWhoosh();
    const dx = f.x - this.CENTER.x;
    const dy = f.y - this.CENTER.y;
    const startAngle = Math.atan2(dy, dx);
    const startRadius = Math.max(this.ARENA_RADIUS + 4, Math.hypot(dx, dy));
    const targetAngle = Math.PI / 2; // straight down toward the bar below
    const targetRadius = Math.max(this.ARENA_RADIUS + 40, this.STAGE_H + 30 - this.CENTER.y);
    this.flyingEliminations.push({
      code: f.code,
      startAngle,
      startRadius,
      targetAngle,
      targetRadius,
      t0: performance.now(),
      duration: 650,
    });
    this._emitHud();
  }

  _updateFlyingEliminations() {
    const now = performance.now();
    for (let i = this.flyingEliminations.length - 1; i >= 0; i--) {
      const fe = this.flyingEliminations[i];
      if (now - fe.t0 >= fe.duration) {
        this.eliminatedList.push({ code: fe.code, name: this.countryNames[fe.code] || fe.code });
        this.emit('eliminated', this.eliminatedList.slice());
        this.flyingEliminations.splice(i, 1);
      }
    }
  }

  _renderFlyingEliminations() {
    const ctx = this.ctx;
    const now = performance.now();
    this.flyingEliminations.forEach((fe) => {
      const raw = Math.min(1, (now - fe.t0) / fe.duration);
      const t = 1 - Math.pow(1 - raw, 3); // ease-out
      let da = fe.targetAngle - fe.startAngle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const angle = fe.startAngle + da * t;
      const radius = fe.startRadius + (fe.targetRadius - fe.startRadius) * t;
      const x = this.CENTER.x + Math.cos(angle) * radius;
      const y = this.CENTER.y + Math.sin(angle) * radius;
      const w = this.FLAG_R * 2.15 * (1 - 0.35 * t);
      const h = this.FLAG_R * 1.4 * (1 - 0.35 * t);
      ctx.save();
      ctx.globalAlpha = 1 - 0.2 * t;
      const sprite = this._getSprite(fe.code);
      if (sprite.ready && sprite.canvas) {
        ctx.drawImage(sprite.canvas, x - w / 2, y - h / 2, w, h);
      }
      ctx.restore();
    });
  }

  // ================= Fireworks =================

  _spawnBurst(x, y) {
    const FIREWORK_COLORS = ['#e8b23d', '#c13f3f', '#4aa3ff', '#5b8c5a', '#f0ebd8'];
    const count = 26;
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(2.5, 8);
      this.fireworks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
      });
    }
  }
  _spawnFireworksCelebration() {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        this._spawnBurst(rand(this.STAGE_W * 0.18, this.STAGE_W * 0.82), rand(this.STAGE_H * 0.15, this.STAGE_H * 0.55));
      }, i * 320);
    }
  }
  _updateFireworks() {
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const p = this.fireworks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= 0.018;
      if (p.life <= 0) this.fireworks.splice(i, 1);
    }
  }
  _renderFireworks() {
    const ctx = this.ctx;
    this.fireworks.forEach((p) => {
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // ================= Physics step =================

  _activeBoostFor(code) {
    const b = this._voteBoosts.get(code);
    if (!b) return 1;
    if (Date.now() > b.until) {
      this._voteBoosts.delete(code);
      return 1;
    }
    return b.factor;
  }

  _step() {
    this.GATES[0].angle = norm(this.GATES[0].angle + this.GATE_SPIN);
    this.BLOCKER.angle = norm(this.BLOCKER.angle + this.BLOCKER.speed);

    const alive = this.flags.filter((f) => f.alive);

    alive.forEach((f) => {
      f.x += f.vx;
      f.y += f.vy;
    });

    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r;
        if (dist < minDist && dist > 0) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const velAlongNormal = rvx * nx + rvy * ny;
          if (velAlongNormal < 0) {
            // Equal mass, restitution 1: exchange the full normal-velocity
            // component. No 0.5 damping factor — that drains energy on
            // every hit and grinds everything to a crawl.
            const impulse = -velAlongNormal;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
          }
        }
      }
    }

    alive.forEach((f) => {
      const dx = f.x - this.CENTER.x;
      const dy = f.y - this.CENTER.y;
      const dist = Math.hypot(dx, dy);
      const limit = this.ARENA_RADIUS - f.r;
      if (dist <= limit) return;

      const posAngle = Math.atan2(dy, dx);
      const blocked = angleDiff(posAngle, this.BLOCKER.angle) < this.BLOCKER.half;
      const inGate = !blocked && this.GATES.some((g) => angleDiff(posAngle, g.angle) < g.half);

      if (inGate) {
        if (dist > this.ARENA_RADIUS + f.r * 1.4) this._eliminate(f);
        return;
      }

      const nx = dx / dist;
      const ny = dy / dist;
      const overshoot = dist - limit;
      f.x -= nx * overshoot;
      f.y -= ny * overshoot;
      const vDotN = f.vx * nx + f.vy * ny;
      const boost = this._activeBoostFor(f.code);
      // Vote boost slightly increases how much speed a flag keeps on a
      // wall bounce (its "resilience"), on top of the elastic reflection.
      f.vx -= 2 * vDotN * nx * boost;
      f.vy -= 2 * vDotN * ny * boost;
      if (Math.abs(vDotN) > 1) this._playThump();
    });

    // Safety net — nudge up to a randomized target so slow flags don't all
    // clump at exactly the same speed. Vote-boosted flags get a higher
    // floor too, giving them a visible edge while the boost lasts.
    const MIN_SPEED = 1.2;
    alive.forEach((f) => {
      const boost = this._activeBoostFor(f.code);
      const speed = Math.hypot(f.vx, f.vy);
      const minSpeed = MIN_SPEED * boost;
      if (speed < minSpeed) {
        const dir = speed > 0.0001 ? Math.atan2(f.vy, f.vx) : rand(0, Math.PI * 2);
        const target = rand(minSpeed, minSpeed * 3.5);
        f.vx = Math.cos(dir) * target;
        f.vy = Math.sin(dir) * target;
      }
    });

    this._checkRoundEnd();
  }

  // ================= Rendering =================

  _drawArena() {
    const ctx = this.ctx;
    const gates = this.GATES.map((g) => ({ start: norm(g.angle - g.half), end: norm(g.angle + g.half) })).sort(
      (a, b) => a.start - b.start
    );
    ctx.beginPath();
    for (let i = 0; i < gates.length; i++) {
      const cur = gates[i];
      const next = gates[(i + 1) % gates.length];
      let segStart = cur.end;
      let segEnd = next.start;
      if (segEnd <= segStart) segEnd += Math.PI * 2;
      const x0 = this.CENTER.x + Math.cos(segStart) * this.ARENA_RADIUS;
      const y0 = this.CENTER.y + Math.sin(segStart) * this.ARENA_RADIUS;
      ctx.moveTo(x0, y0);
      ctx.arc(this.CENTER.x, this.CENTER.y, this.ARENA_RADIUS, segStart, segEnd);
    }
    ctx.strokeStyle = 'rgba(240,235,216,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = 'rgba(74,163,255,0.55)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(this.CENTER.x, this.CENTER.y, this.ARENA_RADIUS, this.BLOCKER.angle - this.BLOCKER.half, this.BLOCKER.angle + this.BLOCKER.half);
    ctx.strokeStyle = '#4aa3ff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.STAGE_W, this.STAGE_H);
    this._drawArena();
    this.flags.forEach((f) => {
      if (f.alive) this._drawFlagShape(f);
    });
    this._renderFlyingEliminations();
    this._renderFireworks();
  }

  _computeArenaRadius(w, h) {
    const r = Math.min(w, h) * 0.4 - 16;
    return Math.max(60, Math.min(380, r));
  }

  _loop() {
    if (this.running) this._step();
    this._updateFlyingEliminations();
    this._updateFireworks();
    this._render();
    this._rafId = requestAnimationFrame(() => this._loop());
  }

  _bindResize() {}
}
