/* =============================================================================
   AGENTKIT — one animation engine, 12 original characters, any colour.
   Shared by the desktop buddy (mascot.html) and the Settings character studio (panel.html).

     const agent = AgentKit.create(canvas, { style: 'nori', size: 72, colors: { body, accent, feature: 'auto' } });
     agent.setState('idle' | 'listening' | 'thinking' | 'speaking' | 'happy');
     agent.attachVoice(mediaStream)   // real lip-sync from a live voice (Parley addition)
     AgentKit.feedPointer(x, y)       // gaze from a cursor position fed in from outside (desktop-wide)
     AgentKit.pause() / resume()      // stop all drawing (hidden window)
============================================================================= */
const AgentKit = (() => {
'use strict';

const DEFAULTS = {
  maxFps: 60,
  calmFps: 30,                   // when nothing is moving much (saves battery on a desktop pet)
  respectReducedMotion: true,
  stateBlendTime: 0.18,
  blink: {
    intervalMin: 2.0, intervalMax: 6.0,
    durationMin: 0.12, durationMax: 0.18, closeFraction: 0.38,
    doubleChance: 0.15, doubleGap: [0.05, 0.10],
    stateRate: { idle: 1.0, listening: 0.75, thinking: 1.35, speaking: 1.0, happy: 0.5 },
  },
  mouth: { attack: 0.05, release: 0.13, shapeSmoothing: 0.06, silenceGate: 0.06, maxOpen: 0.30, baseWidth: 0.25, happyOpen: 0.32 },
  audio: {
    fftSize: 1024, floorDb: -52, ceilDb: -14,
    lowBand: [90, 900], midBand: [1000, 2500], highBand: [3000, 8000],
    sibilanceOffset: 30, sibilanceRange: 22, roundOffset: 12, roundRange: 14,
    emphasisJump: 0.30, emphasisCooldown: 0.45,
  },
  fakeTalk: { syllableMs: [120, 210], consonantMs: [45, 85], wordGapMs: [50, 130], sentenceGapMs: [240, 400],
              sentenceChance: 0.1, peak: [0.5, 1.0], boundaryTimeout: 450 },
  gaze: { range: 420, idleReturn: 2.0, eyeTravelX: 0.065, eyeTravelY: 0.05, faceTravelX: 0.07, faceTravelY: 0.05 },
  idle: { glanceEvery: [3, 7], glanceHold: [0.5, 1.3], saccadeEvery: [0.35, 1.4], saccadeSize: 0.07 },
};

const DEFAULT_SPRINGS = {
  stretch:  { stiffness: 180, damping: 10 },
  tilt:     { stiffness: 120, damping: 12 },
  gaze:     { stiffness: 260, damping: 24 },
  lean:     { stiffness: 140, damping: 18 },
  eyeScale: { stiffness: 220, damping: 16 },
  rise:     { stiffness: 40,  damping: 7 },
  spin:     { stiffness: 55,  damping: 10 },
};

const DEFAULT_MOTION = {
  hover: 0.10, bobAmount: 0.05, bobPeriod: 4.2, breathAmount: 0.025, breathPeriod: 3.6,
  drift: 0, driftPeriod: 7, tiltFromDrift: 0.8, tiltFollowGaze: 0.035,
  happy: 'hop',
  happyDuration: 1.1, hopHeight: 0.38, hops: 2, secondHop: 0.45, anticipation: 0.08, gravity: 16,
  shadow: { scale: 1, alpha: 1 }, gazeQuantize: 0, rings: true, dots: true,
};

const DEFAULT_POSES = {
  idle:      { eyeScale:1.00, squint:0.00, gazeX:0,   gazeY:0,    gazeLock:0,    lean:0,     tilt:0,     wobble:0, pulse:0, smile:0.25, happyEyes:0, follow:1.0,  rings:0, dots:0, breath:1.0, mouthX:0,    listen:0, think:0, speak:0, joy:0 },
  listening: { eyeScale:1.14, squint:0.00, gazeX:0,   gazeY:0.12, gazeLock:0.35, lean:0.07,  tilt:0.05,  wobble:0, pulse:0, smile:0.35, happyEyes:0, follow:0.6,  rings:1, dots:0, breath:0.8, mouthX:0,    listen:1, think:0, speak:0, joy:0 },
  thinking:  { eyeScale:0.95, squint:0.22, gazeX:0.7, gazeY:-0.85,gazeLock:0.9,  lean:-0.03, tilt:-0.03, wobble:1, pulse:1, smile:0.0,  happyEyes:0, follow:0.15, rings:0, dots:1, breath:1.0, mouthX:0.05, listen:0, think:1, speak:0, joy:0 },
  speaking:  { eyeScale:1.04, squint:0.04, gazeX:0,   gazeY:0.05, gazeLock:0.3,  lean:0.02,  tilt:0,     wobble:0, pulse:0, smile:0.2,  happyEyes:0, follow:0.5,  rings:0, dots:0, breath:0.6, mouthX:0,    listen:0, think:0, speak:1, joy:0 },
  happy:     { eyeScale:1.00, squint:0.00, gazeX:0,   gazeY:0,    gazeLock:0.6,  lean:0,     tilt:0,     wobble:0, pulse:0, smile:1.0,  happyEyes:1, follow:0.3,  rings:0, dots:0, breath:1.0, mouthX:0,    listen:0, think:0, speak:0, joy:1 },
};

/* ============================== utilities ============================== */
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randIn = ([a, b]) => rand(a, b);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoothCoef = (dt, tau) => 1 - Math.exp(-dt / Math.max(tau, 1e-4));
const easeInQuad = t => t * t;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(...srcs) {
  const out = {};
  for (const s of srcs) if (s) for (const k in s) out[k] = isObj(s[k]) && isObj(out[k]) ? deepMerge(out[k], s[k]) : (isObj(s[k]) ? deepMerge(s[k]) : s[k]);
  return out;
}

/* ---- colour helpers ---- */
function parseHex(hex) {
  let h = String(hex || '#000').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return isNaN(n) ? { r: 0, g: 0, b: 0 } : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const toHex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const normHex = c => toHex(parseHex(c));
function mix(a, b, t) { const A = parseHex(a), B = parseHex(b); return toHex({ r: lerp(A.r, B.r, t), g: lerp(A.g, B.g, t), b: lerp(A.b, B.b, t) }); }
function rgba(hex, a) { const { r, g, b } = parseHex(hex); return `rgba(${r},${g},${b},${clamp(a).toFixed(3)})`; }
function luminance(hex) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const { r, g, b } = parseHex(hex); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrastOn = hex => luminance(hex) > 0.36 ? '#121212' : '#ffffff';

function buildPalette(c) {
  const body = normHex(c.body), accent = normHex(c.accent || c.body);
  const featureAuto = !c.feature || c.feature === 'auto';
  const feature = featureAuto ? contrastOn(body) : normHex(c.feature);
  const L = luminance(body);
  return {
    body, accent, feature, featureAuto,
    onAccent: featureAuto ? contrastOn(accent) : feature,
    featureIsLight: luminance(feature) > 0.5,
    light: mix(body, '#ffffff', 0.35), lightish: mix(body, '#ffffff', 0.1),
    dark: mix(body, '#000000', 0.22), darker: mix(body, '#000000', 0.45),
    accentLight: mix(accent, '#ffffff', 0.3), accentDark: mix(accent, '#000000', 0.3),
    lum: L, isDark: L < 0.35,
    rim: L < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.10)',
    bounce: L < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)',
    specA: L < 0.5 ? 0.5 : 0.9,
    fx: mix(body, '#8c8c8c', 0.55),
    tongue: mix(feature, '#808080', 0.45),
  };
}

/* ============================== spring ============================== */
class Spring {
  constructor(value = 0, cfg = { stiffness: 170, damping: 26 }) { this.x = value; this.v = 0; this.target = value; this.cfg = cfg; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n, k = this.cfg.stiffness, c = this.cfg.damping;
    for (let i = 0; i < n; i++) { this.v += (-k * (this.x - this.target) - c * this.v) * h; this.x += this.v * h; }
  }
}

/* ============================== drawing helpers ============================== */
function rr(p, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath(); return p;
}
function pill(ctx, cx, cy, w, h) { ctx.beginPath(); rr(ctx, cx - w / 2, cy - h / 2, w, h, Math.min(w, h) / 2); }
const CIRCLE = new Path2D(); CIRCLE.arc(0, 0, 1, 0, TAU);

function glossyBody(ctx, a, path, o = {}) {
  ctx.fillStyle = o.fill || a.g.body; ctx.fill(path);
  ctx.save(); ctx.clip(path);
  if (o.bounce !== false) { ctx.fillStyle = a.g.bounce; ctx.fillRect(-3, -3, 6, 6); }
  if (o.rim !== false) { ctx.lineWidth = 0.09; ctx.strokeStyle = a.g.rim; ctx.stroke(path); }
  ctx.restore();
}
function specSoft(ctx, a, F, clipPath, x, y, r = 0.46, rot = -0.55, squash = 0.6) {
  ctx.save(); if (clipPath) ctx.clip(clipPath);
  ctx.translate(x - F.gx * 0.03, y - F.gy * 0.02); ctx.rotate(rot); ctx.scale(r / 0.46, (r / 0.46) * squash);
  ctx.fillStyle = a.g.spec; ctx.beginPath(); ctx.arc(0, 0, 0.46, 0, TAU); ctx.fill(); ctx.restore();
}
function specSharp(ctx, a, F, x, y, rx = 0.085, ry = 0.042, rot = -0.7, alpha = 0.95) {
  ctx.save(); ctx.translate(x - F.gx * 0.03, y - F.gy * 0.02); ctx.rotate(rot);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill(); ctx.restore();
}

function eyes(ctx, a, F, o) {
  const type = o.type || 'dot', col = o.color || a.pal.feature, spacing = o.spacing ?? 0.3, y0 = o.y ?? -0.1, travel = o.travel ?? 1;
  const open = 1 - F.lid, happy = o.happy === 'none' ? 0 : F.happy, es = F.es, baseA = o.alpha ?? 1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const side of [-1, 1]) {
    const fore = 1 - 0.18 * Math.max(0, -side * F.gx) + 0.05 * Math.max(0, side * F.gx);
    const x = side * spacing * (1 - 0.08 * Math.abs(F.gx)) + F.fx + F.ex * travel;
    const y = y0 + F.fy + F.ey * travel;
    if (happy < 0.99) {
      ctx.globalAlpha = baseA * (1 - happy);
      ctx.fillStyle = col;
      if (type === 'pill' || type === 'pixel') {
        const eh = o.h * es * (1 - 0.55 * happy), ew = o.w * es * (1 + 0.12 * F.lid) * fore;
        let hh = Math.max(eh * open, o.minH ?? 0.035);
        if (type === 'pixel') {
          const px = o.px || 0.04; hh = Math.max(px, Math.round(hh / px) * px);
          ctx.beginPath(); rr(ctx, x - ew / 2, y - hh / 2, ew, hh, Math.min(o.radius ?? 0.02, hh / 2)); ctx.fill();
        } else {
          if (o.bloom) { ctx.save(); ctx.globalAlpha *= o.bloom; pill(ctx, x, y + (eh - hh) * 0.3, ew * 1.6, hh * 1.6 + 0.06); ctx.fill(); ctx.restore(); }
          pill(ctx, x, y + (eh - hh) * 0.3, ew, hh); ctx.fill();
        }
      } else if (type === 'round') {
        const r = o.r * es, rx = r * fore, ry = r * (1 - 0.4 * happy), oy = ry * open;
        if (oy > 0.025) {
          ctx.save();
          ctx.beginPath(); ctx.ellipse(x, y + (ry - oy) * 0.35, rx, oy, 0, 0, TAU); ctx.clip();
          ctx.fillStyle = o.sclera || '#fff'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
          const pr = (o.pupilR || 0.55) * r, px = x + F.gx * (rx - pr) * 0.75, py = y + F.gy * (ry - pr) * 0.6;
          ctx.fillStyle = o.pupil || '#121212'; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(px - pr * 0.36, py - pr * 0.4, pr * 0.3, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(px + pr * 0.3, py + pr * 0.35, pr * 0.12, 0, TAU); ctx.fill();
          ctx.restore();
          if (o.outline) { ctx.strokeStyle = o.outline; ctx.lineWidth = 0.022; ctx.beginPath(); ctx.ellipse(x, y + (ry - oy) * 0.35, rx, oy, 0, 0, TAU); ctx.stroke(); }
        } else {
          ctx.strokeStyle = o.lidColor || o.pupil || '#121212'; ctx.lineWidth = 0.04;
          ctx.beginPath(); ctx.moveTo(x - rx * 0.8, y + ry * 0.3); ctx.quadraticCurveTo(x, y + ry * 0.42, x + rx * 0.8, y + ry * 0.3); ctx.stroke();
        }
      } else {
        const rx = (o.rx ?? o.r) * es * fore, ry = (o.ry ?? o.r) * es * (1 - 0.5 * happy);
        const oy = Math.max(ry * open, 0.02), cy = y + (ry - oy) * 0.3;
        if (type === 'glow' && a.pal.featureIsLight) {
          ctx.save(); ctx.translate(x, cy); ctx.scale(rx * 3, rx * 3); ctx.globalAlpha *= 0.5;
          ctx.fillStyle = a.g.glow; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
        }
        ctx.beginPath(); ctx.ellipse(x, cy, rx, oy, 0, 0, TAU); ctx.fill();
        if (o.catchlight !== false && !a.pal.featureIsLight && oy > ry * 0.55) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath(); ctx.arc(x - rx * 0.3, cy - oy * 0.38, Math.min(rx, oy) * 0.33, 0, TAU); ctx.fill();
        }
      }
    }
    if (happy > 0.01) {
      ctx.globalAlpha = baseA * happy;
      ctx.strokeStyle = o.happyColor || (type === 'round' ? (o.pupil || '#121212') : col);
      ctx.lineWidth = o.happyW || 0.065;
      const hr = o.happyR || (type === 'round' ? o.r * 0.78 : type === 'pill' || type === 'pixel' ? o.w * 0.58 : (o.rx ?? o.r) * 1.25);
      ctx.beginPath();
      if (type === 'pixel') {
        ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
        ctx.moveTo(x - hr, y + hr * 0.45); ctx.lineTo(x, y - hr * 0.45); ctx.lineTo(x + hr, y + hr * 0.45);
      } else ctx.arc(x, y + hr * 0.6, hr, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }
  }
  ctx.globalAlpha = 1;
}

function mouth(ctx, a, F, o = {}) {
  const type = o.type || 'viseme', m = F.mouth, c = a.cfg.mouth;
  const col = o.color || a.pal.feature, s = o.scale || 1;
  ctx.save();
  ctx.translate((o.x || 0) + F.fx * 1.1 + F.P.mouthX, (o.y ?? 0.25) + F.fy * 1.05);
  ctx.scale(s, s);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const smileLine = (alpha, cw0) => {
    if (alpha <= 0) return;
    const cw = cw0 + F.smile * 0.03, depth = 0.012 + F.smile * 0.05;
    ctx.globalAlpha = alpha; ctx.lineWidth = o.lineW ?? 0.045;
    ctx.beginPath(); ctx.moveTo(-cw, 0); ctx.quadraticCurveTo(0, depth * 2, cw, 0); ctx.stroke(); ctx.globalAlpha = 1;
  };
  if (type === 'viseme') {
    const maxOpen = o.maxOpen ?? c.maxOpen, base = o.width ?? c.baseWidth;
    const round = Math.min(1, m.round + (o.roundBias || 0));
    const Hm = m.env * maxOpen * m.h;
    const aw = base * 0.5 * m.w * (1 - 0.35 * round) * (0.75 + 0.25 * clamp(m.env * 2));
    smileLine(1 - smoothstep(0.012, 0.05, Hm), o.closedW ?? 0.06);
    if (Hm > 0.008) {
      const ht = Hm * lerp(0.25, 0.5, round), hb = Hm - ht, k = lerp(0.85, 1, round);
      const p = new Path2D();
      p.moveTo(-aw, 0);
      p.bezierCurveTo(-aw * k, -ht * 1.33, aw * k, -ht * 1.33, aw, 0);
      p.bezierCurveTo(aw * k, hb * 1.33, -aw * k, hb * 1.33, -aw, 0);
      ctx.fill(p);
      if (Hm > 0.06 && o.tongue !== false) {
        ctx.save(); ctx.clip(p); ctx.globalAlpha = clamp((Hm - 0.06) / 0.06);
        ctx.fillStyle = o.tongueColor || a.pal.tongue; ctx.beginPath(); ctx.ellipse(0, hb * 0.95, aw * 0.6, hb * 0.55, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
  } else if (type === 'bars') {
    const n = o.n || 5, gap = (o.gap || 0.075) * (0.85 + 0.15 * m.w), bw = o.barW || 0.04, maxH = o.maxOpen || 0.26;
    const talkA = smoothstep(0.02, 0.09, m.env);
    if (o.closed === 'dots' && talkA < 1) {
      ctx.globalAlpha = 1 - talkA;
      for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc((i - (n - 1) / 2) * gap, 0, bw / 2, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else smileLine(1 - talkA, o.closedW ?? 0.07);
    if (talkA > 0) {
      ctx.globalAlpha = talkA;
      for (let i = 0; i < n; i++) {
        const k = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 + 0.6);
        const h = Math.max(bw, m.env * maxH * (0.35 + 0.65 * k) * (0.55 + 0.45 * Math.abs(Math.sin(F.t * 13 + i * 1.9))));
        pill(ctx, (i - (n - 1) / 2) * gap, 0, bw, h); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  } else if (type === 'pixel') {
    const px = o.px || 0.04, Hm = m.env * (o.maxOpen || 0.22) * m.h;
    const w = (o.width || 0.3) * (0.7 + 0.3 * m.w) * (1 - 0.3 * m.round);
    if (Hm < px * 0.75) {
      const cw = Math.round(((o.closedW || 0.1) + F.smile * 0.04) / px) * px;
      ctx.fillRect(-cw, -px / 2, cw * 2, px);
      if (F.smile > 0.3) { ctx.fillRect(-cw - px, -px * 1.5, px, px); ctx.fillRect(cw, -px * 1.5, px, px); }
    } else {
      const hq = Math.max(px * 2, Math.round(Hm / px) * px), wq = Math.max(px * 3, Math.round(w / px) * px);
      ctx.beginPath(); rr(ctx, -wq / 2, -hq * 0.35, wq, hq, Math.min(px, hq / 2)); ctx.fill();
    }
  }
  ctx.restore();
}

/* ============================== styles registry ============================== */
const STYLES = {};
function registerStyle(def) { STYLES[def.id] = def; return def; }

/* ============================== shared input / audio / loop ============================== */
const Pointer = { x: -1e4, y: -1e4, t: -1e9 };
window.addEventListener('pointermove', e => { Pointer.x = e.clientX; Pointer.y = e.clientY; Pointer.t = performance.now() / 1000; }, { passive: true });
/** Parley: the desktop buddy gets the cursor position from the main process (desktop-wide gaze). */
function feedPointer(x, y) { Pointer.x = x; Pointer.y = y; Pointer.t = performance.now() / 1000; }
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

const Audio_ = { ctx: null, mediaNodes: new WeakMap() };
function audioContext() {
  if (!Audio_.ctx) { const AC = window.AudioContext || window.webkitAudioContext; Audio_.ctx = new AC(); }
  if (Audio_.ctx.state === 'suspended') Audio_.ctx.resume();
  return Audio_.ctx;
}

const Loop = {
  list: new Set(), last: 0, running: false, paused: false,
  io: ('IntersectionObserver' in window) ? new IntersectionObserver(es => es.forEach(e => { if (e.target.__agent) e.target.__agent.visible = e.isIntersecting; })) : null,
  add(a) { this.list.add(a); if (this.io) this.io.observe(a.canvas); this.kick(); },
  remove(a) { this.list.delete(a); if (this.io) this.io.unobserve(a.canvas); },
  kick() {
    if (this.running || this.paused || !this.list.size) return;
    this.running = true; this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  },
  frame(now) {
    if (this.paused || !this.list.size) { this.running = false; return; }   // nothing to draw → no frames at all
    requestAnimationFrame(t => this.frame(t));
    const elapsed = now - this.last;
    // Full frame rate only while something is actually moving; calm idling runs at calmFps.
    let busy = (performance.now() / 1000 - Pointer.t) < 1.5;
    if (!busy) for (const a of this.list) {
      if (a.state !== 'idle' || a.air.lift > 0 || a.air.launchAt >= 0 || Math.abs(a.sp.spin.v) > 0.01 || Math.abs(a.sp.rise.v) > 0.05) { busy = true; break; }
    }
    if (elapsed < 1000 / (busy ? DEFAULTS.maxFps : DEFAULTS.calmFps) - 1.5) return;
    this.last = now;
    const dt = Math.min(elapsed / 1000, 0.05);
    for (const a of this.list) if (a.visible && a.canvas.isConnected) a.rect = a.canvas.getBoundingClientRect();
    for (const a of this.list) if (a.visible && a.canvas.isConnected) { a.update(dt); a.draw(); }
  },
};

const VIS = {
  A: { level: 1.0, high: 0.30, round: 0.05 },
  E: { level: 0.8, high: 0.85, round: 0.0 },
  O: { level: 0.85, high: 0.05, round: 0.95 },
  M: { level: 0.0, high: 0.0, round: 0.0 },
  S: { level: 0.35, high: 1.0, round: 0.0 },
};
const ZERO = { L: 0, high: 0, round: 0 };

/* =============================================================================
   AgentCharacter — one animated character bound to one <canvas>.
============================================================================= */
class AgentCharacter {
  constructor(canvas, opts = {}) {
    if (typeof canvas === 'string') canvas = document.querySelector(canvas);
    if (!canvas) throw new Error('AgentKit: canvas not found');
    this.canvas = canvas; canvas.__agent = this;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.size = opts.size || 120;
    this.handlers = {};
    this.visible = true; this.rect = { left: 0, top: 0 };
    this.clock = 0; this.state = 'idle'; this.happyReturn = 'idle'; this.happyUntil = 0; this.wiggleUntil = 0;
    this.lookTarget = null; this.hovering = false;
    this.talk = { active: false, kind: null, id: 0, resolve: null, cleanup: null };
    this.mouth = { env: 0, w: 1, h: 0.75, round: 0, slow: 0, lastEmph: 0 };
    this.fake = { mode: 'random', queue: [], seg: null, segT: 0, gotBoundary: false, rate: 1 };
    this.blinkS = { phase: 'wait', next: rand(1.5, 4), t0: 0, dur: 0.15, value: 0, isDouble: false, pendingDouble: false };
    this.air = { lift: 0, v: 0, hops: 0, power: 1, launchAt: -1 };
    this.idleB = { nextGlance: rand(2, 5), glanceUntil: 0, gx: 0, gy: 0, nextSaccade: 0, sx: 0, sy: 0 };
    this.breath = 0; this.bob = 0; this.driftX = 0; this.cx = 0; this.centerY = 0; this.sx = 1; this.sy = 1;
    this.analyser = null;
    this.voice = null;          // live voice source for real lip-sync (attachVoice)

    this.setStyle(opts.style || 'nori', opts.colors);

    if (opts.interactive !== false) {
      canvas.addEventListener('pointerdown', this._down = e => {
        if (!this.hitTest(e.clientX, e.clientY)) return;
        e.preventDefault(); audioContext();
        this.react(); this._emit('click', { state: this.state });
      });
      canvas.addEventListener('pointermove', this._move = e => {
        const h = this.hitTest(e.clientX, e.clientY);
        if (h !== this.hovering) { this.hovering = h; canvas.style.cursor = h ? 'pointer' : ''; this._emit('hover', { hovering: h }); }
      });
      canvas.addEventListener('pointerleave', this._leave = () => {
        if (this.hovering) { this.hovering = false; canvas.style.cursor = ''; this._emit('hover', { hovering: false }); }
      });
    }
    Loop.add(this);
  }

  /* ---------------- configuration ---------------- */
  setStyle(id, colors) {
    const style = STYLES[id] || STYLES.nori;
    id = style.id;
    if (this.talk.active) this._stopAllTalk();
    this.style = style; this.styleId = id;
    this.cfg = deepMerge(DEFAULTS, style.config, this.opts.config);
    this.motion = deepMerge(DEFAULT_MOTION, style.motion);
    this.springCfg = deepMerge(DEFAULT_SPRINGS, style.springs);
    this.poses = {};
    for (const s in DEFAULT_POSES) this.poses[s] = { ...DEFAULT_POSES[s], ...((style.poses || {})[s] || {}) };
    if (this.state === 'happy') this.state = 'idle';
    if (this.state === 'speaking' && !this.voice) this.state = 'idle';
    this.P = { ...this.poses[this.state] };
    const sc = this.springCfg;
    this.sp = {
      stretch: new Spring(0, sc.stretch), tilt: new Spring(0, sc.tilt),
      gazeX: new Spring(0, sc.gaze), gazeY: new Spring(0, sc.gaze),
      lean: new Spring(0, sc.lean), eyeScale: new Spring(1, sc.eyeScale),
      rise: new Spring(0, sc.rise), spin: new Spring(0, sc.spin),
    };
    this.air = { lift: 0, v: 0, hops: 0, power: 1, launchAt: -1 };
    this.custom = style.init ? style.init(this) : {};
    this.layout();
    this.setColors(colors || style.colors);
    this.sp.stretch.v = 1.4;
    Loop.kick();
    return this;
  }
  setColors(c = {}) {
    this.colors = { ...this.style.colors, ...(this.colors && this.colors.__style === this.styleId ? this.colors : {}), ...c };
    Object.defineProperty(this.colors, '__style', { value: this.styleId, enumerable: false, configurable: true });
    this.pal = buildPalette(this.colors);
    this._buildGradients();
    return this;
  }
  _buildGradients() {
    const ctx = this.ctx, p = this.pal;
    const body = ctx.createRadialGradient(-0.42, -0.55, 0, -0.42, -0.55, 1.75);
    body.addColorStop(0, p.light); body.addColorStop(0.25, p.lightish); body.addColorStop(0.55, p.body);
    body.addColorStop(0.85, p.dark); body.addColorStop(1, p.darker);
    const acc = ctx.createRadialGradient(-0.42, -0.55, 0, -0.42, -0.55, 1.75);
    acc.addColorStop(0, mix(p.accent, '#fff', 0.35)); acc.addColorStop(0.3, mix(p.accent, '#fff', 0.08));
    acc.addColorStop(0.6, p.accent); acc.addColorStop(1, mix(p.accent, '#000', 0.4));
    const bounce = ctx.createRadialGradient(0, 1.0, 0, 0, 1.0, 0.85);
    bounce.addColorStop(0, p.bounce); bounce.addColorStop(1, 'rgba(0,0,0,0)');
    const rim = ctx.createLinearGradient(-0.7, -0.7, 0.75, 0.8);
    rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(0.62, 'rgba(0,0,0,0)'); rim.addColorStop(1, p.rim);
    const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.46);
    spec.addColorStop(0, `rgba(255,255,255,${p.specA})`); spec.addColorStop(1, 'rgba(255,255,255,0)');
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    shadow.addColorStop(0, 'rgba(0,0,0,1)'); shadow.addColorStop(0.45, 'rgba(0,0,0,0.55)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, rgba(p.feature, 0.55)); glow.addColorStop(1, rgba(p.feature, 0));
    this.g = { body, accent: acc, bounce, rim, spec, shadow, glow };
    if (this.style.gradients) Object.assign(this.g, this.style.gradients(this, ctx, p));
  }
  layout() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.W = Math.round(this.size * 1.5); this.H = Math.round(this.size * 1.75); this.R = this.size * 0.36;
    this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
    this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
    this.cx = this.W / 2; this.centerY = this.H * 0.55;
  }
  setSize(px) { this.size = px; this.layout(); return this; }

  /* ---------------- events ---------------- */
  on(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); return this; }
  off(name, fn) { this.handlers[name] = (this.handlers[name] || []).filter(f => f !== fn); return this; }
  _emit(name, detail) {
    (this.handlers[name] || []).forEach(fn => { try { fn(detail); } catch (e) { console.error(e); } });
    this.canvas.dispatchEvent(new CustomEvent('agent:' + name, { detail, bubbles: true }));
  }

  /* ---------------- state machine ---------------- */
  getState() { return this.state; }
  setState(next, opts = {}) {
    if (!this.poses[next]) throw new Error('AgentKit: unknown state "' + next + '"');
    const prev = this.state;
    if (next === 'happy') {
      if (prev !== 'happy') this.happyReturn = opts.then || prev;
      else if (opts.then) this.happyReturn = opts.then;
      this.happyUntil = this.clock + this.motion.happyDuration;
      this._happyAction();
    } else if (prev === 'speaking' && next !== 'speaking') {
      this._stopAllTalk();
    }
    if (next === prev && next !== 'happy') return this;
    this.state = next;
    // With a live voice attached the mouth follows the real audio, so no fake talking.
    if (next === 'speaking' && !this.talk.active && !this.voice) { this._beginTalk('fake'); this._resetFake('random'); }
    if (prev !== next) {
      this.sp.stretch.v += 0.6;
      if (Math.random() < 0.4 && this.blinkS.phase === 'wait') this._startBlink();
      if (this.blinkS.phase === 'wait') this._scheduleBlink();
      this.style.onState && this.style.onState(this, next, prev);
      this._emit('state', { state: next, prev });
    }
    Loop.kick();
    return this;
  }
  react(then) {
    if (this.talk.active) this._stopAllTalk();
    const base = this.state === 'happy' ? this.happyReturn : this.state;
    return this.setState('happy', { then: then || (base === 'listening' ? 'idle' : 'listening') });
  }
  _happyAction() {
    const m = this.motion, sp = this.sp;
    switch (m.happy) {
      case 'float':  sp.rise.v += 3.0; sp.stretch.v += 1.4; break;
      case 'spin':   sp.spin.target += TAU; sp.rise.v += 2.2; sp.stretch.v += 1.0; break;
      case 'flare':  sp.stretch.v += 3.4; sp.rise.v += 1.2; break;
      case 'wiggle': this.wiggleUntil = this.clock + 0.8; sp.rise.v += 2.0; sp.stretch.v += 1.0; break;
      default:
        if (this.air.lift <= 0 && this.air.launchAt < 0) { this.air.hops = m.hops - 1; this._hop(1, m.anticipation); }
        else sp.stretch.v += 1.2;
    }
    this.style.onHappy && this.style.onHappy(this);
  }
  _hop(power, anticipation) { this.sp.stretch.v -= 1.6 * power; this.air.power = power; this.air.launchAt = this.clock + anticipation; }
  _updateAir(dt) {
    const m = this.motion, air = this.air;
    if (air.launchAt >= 0 && this.clock >= air.launchAt) {
      air.launchAt = -1; air.v = Math.sqrt(2 * m.gravity * m.hopHeight * air.power);
      this.sp.stretch.v += 2.4 * air.power;
      this.style.onLaunch && this.style.onLaunch(this, air.power);
    }
    if (air.lift > 0 || air.v > 0) {
      air.v -= m.gravity * dt; air.lift += air.v * dt;
      if (air.lift <= 0) {
        const impact = -air.v; air.lift = 0; air.v = 0;
        this.sp.stretch.v -= impact * 0.55; this.sp.tilt.v += rand(-0.5, 0.5) * impact * 0.3;
        this.style.onLand && this.style.onLand(this, impact);
        if (air.hops > 0) { air.hops--; this._hop(m.secondHop, 0.03); }
      }
    }
  }

  /* ---------------- blinking ---------------- */
  blink() { this._startBlink(); return this; }
  _scheduleBlink() {
    const c = this.cfg.blink, rate = c.stateRate[this.state] || 1;
    this.blinkS.phase = 'wait'; this.blinkS.next = this.clock + rand(c.intervalMin, c.intervalMax) / rate;
  }
  _startBlink(isDouble = false) {
    const c = this.cfg.blink, b = this.blinkS;
    b.phase = 'blink'; b.t0 = this.clock; b.isDouble = isDouble;
    b.dur = rand(c.durationMin, c.durationMax) * (isDouble ? 0.85 : 1);
  }
  _updateBlink() {
    const c = this.cfg.blink, b = this.blinkS;
    if (b.phase === 'wait') { if (this.clock >= b.next) this._startBlink(b.pendingDouble); b.value = 0; return; }
    const u = (this.clock - b.t0) / b.dur;
    if (u >= 1) {
      b.value = 0;
      if (!b.isDouble && Math.random() < c.doubleChance) { b.phase = 'wait'; b.pendingDouble = true; b.next = this.clock + randIn(c.doubleGap); }
      else { b.pendingDouble = false; this._scheduleBlink(); }
      return;
    }
    b.value = u < c.closeFraction ? easeInQuad(u / c.closeFraction) : 1 - easeOutCubic((u - c.closeFraction) / (1 - c.closeFraction));
  }

  lookAt(x, y) { this.lookTarget = (x == null) ? null : { x, y }; return this; }

  /* ---------------- talking ---------------- */
  _ensureAnalyser() {
    const ac = audioContext();
    if (!this.analyser) {
      this.analyser = ac.createAnalyser(); this.analyser.fftSize = this.cfg.audio.fftSize; this.analyser.smoothingTimeConstant = 0.15;
      this.td = new Float32Array(this.analyser.fftSize); this.fd = new Uint8Array(this.analyser.frequencyBinCount);
    }
    return ac;
  }
  /** Parley: connect a live voice (WebRTC remote stream). While state is 'speaking' the mouth follows it. */
  attachVoice(stream) {
    if (this.voice) { try { this.voice.disconnect(); } catch (e) {} this.voice = null; }
    if (!stream) return this;
    const ac = this._ensureAnalyser();
    this.voice = ac.createMediaStreamSource(stream);
    this.voice.connect(this.analyser);           // analysed only — the <audio> element plays it
    return this;
  }
  _beginTalk(kind) { this._stopAllTalk(); this.talk.active = true; this.talk.kind = kind; return this.talk.id; }
  _stopAllTalk() {
    const t = this.talk; if (!t.active && !t.cleanup) return;
    const res = t.resolve, cleanup = t.cleanup;
    t.active = false; t.kind = null; t.resolve = null; t.cleanup = null; t.id++;
    if (cleanup) try { cleanup(); } catch (e) { /* ignore */ }
    if (res) res();
  }
  _finishTalk() {
    this._stopAllTalk();
    if (this.state === 'speaking') this.setState('idle');
    if (this.happyReturn === 'speaking') this.happyReturn = 'idle';
  }
  startTalking() { this._beginTalk('fake'); this._resetFake('random'); this.setState('speaking'); return this; }
  stopTalking() { this._finishTalk(); return this; }

  speak(src, opts = {}) {
    if (typeof src === 'string') return this._speakText(src, opts);
    const ac = this._ensureAnalyser();
    const an = this.analyser;
    return new Promise((resolve, reject) => {
      const id = this._beginTalk('audio'); this.talk.resolve = resolve;
      const done = () => { if (this.talk.id === id) this._finishTalk(); };
      if (src instanceof HTMLMediaElement) {
        let node = Audio_.mediaNodes.get(src);
        if (!node) { node = ac.createMediaElementSource(src); node.connect(ac.destination); Audio_.mediaNodes.set(src, node); }
        node.connect(an);
        src.addEventListener('ended', done);
        this.talk.cleanup = () => {
          src.removeEventListener('ended', done);
          try { node.disconnect(an); } catch (e) {}
          if (opts.pauseOnStop !== false && !src.ended) src.pause();
        };
        if (src.paused) src.play().catch(err => { console.warn('[AgentKit] play() failed', err); done(); });
      } else if (src instanceof MediaStream) {
        const node = ac.createMediaStreamSource(src); node.connect(an);
        if (opts.playThrough) node.connect(ac.destination);
        const tracks = src.getAudioTracks(); tracks.forEach(t => t.addEventListener('ended', done));
        this.talk.cleanup = () => { try { node.disconnect(); } catch (e) {} tracks.forEach(t => t.removeEventListener('ended', done)); };
      } else if (window.AudioNode && src instanceof AudioNode) {
        src.connect(an);
        this.talk.cleanup = () => { try { src.disconnect(an); } catch (e) {} };
      } else { this._stopAllTalk(); reject(new TypeError('speak(): unsupported source')); return; }
      this.setState('speaking');
    });
  }
  _speakText(text, opts) {
    return new Promise(resolve => {
      const id = this._beginTalk('tts'); this.talk.resolve = resolve;
      const voice = { ...(this.style.voice || {}), ...opts };
      const rate = voice.rate || 1;
      this._resetFake('words', rate);
      this.setState('speaking');
      const synth = window.speechSynthesis;
      if (!synth || !window.SpeechSynthesisUtterance) {
        this.fake.mode = 'random';
        setTimeout(() => { if (this.talk.id === id) this._finishTalk(); }, text.split(/\s+/).length * 330 / rate);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate; u.pitch = voice.pitch ?? 1.05; u.volume = voice.volume ?? 1;
      const v = voice.voice || pickVoice(); if (v) u.voice = v;
      u.onstart = () => setTimeout(() => { if (this.talk.id === id && !this.fake.gotBoundary) this.fake.mode = 'random'; }, this.cfg.fakeTalk.boundaryTimeout);
      u.onboundary = e => {
        if (this.talk.id !== id || (e.name && e.name !== 'word')) return;
        this.fake.gotBoundary = true; this.fake.mode = 'words';
        const word = (text.slice(e.charIndex).match(/^[\p{L}\p{N}'’-]+/u) || ['a'])[0];
        this.fake.queue = this._wordSegments(word, rate); this.fake.seg = null;
      };
      u.onend = u.onerror = () => { if (this.talk.id === id) this._finishTalk(); };
      this.talk.cleanup = () => synth.cancel();
      synth.cancel(); synth.speak(u);
    });
  }
  _resetFake(mode, rate = 1) { Object.assign(this.fake, { mode, queue: [], seg: null, segT: 0, gotBoundary: false, rate }); }
  _wordSegments(word, rate = 1) {
    const f = this.cfg.fakeTalk, segs = [];
    const parts = word.toLowerCase().match(/[aeiouy]+|[^aeiouy]+/g) || ['a'];
    const vowels = parts.filter(p => /[aeiouy]/.test(p)).length;
    parts.forEach((p, i) => {
      if (/[aeiouy]/.test(p)) {
        if (vowels > 1 && i === parts.length - 1 && p === 'e') return;
        let vis = /[ou]/.test(p) && !/^[ei]/.test(p) ? 'O' : /^[eiy]/.test(p) ? 'E' : 'A';
        if (Math.random() < 0.15) vis = ['A', 'E', 'O'][Math.floor(Math.random() * 3)];
        segs.push({ dur: randIn(f.syllableMs) / 1000 / rate, peak: randIn(f.peak), vis });
      } else if (i > 0 && i < parts.length - 1) {
        if (/[mbp]/.test(p)) segs.push({ dur: randIn(f.consonantMs) / 1000 / rate, peak: 1, vis: 'M' });
        else if (/[szfx]|ch|sh|th/.test(p)) segs.push({ dur: randIn(f.consonantMs) / 1000 / rate, peak: 0.9, vis: 'S' });
      }
    });
    if (!segs.length) segs.push({ dur: randIn(f.syllableMs) / 1000 / rate, peak: randIn(f.peak), vis: 'A' });
    return segs;
  }
  _randomWord() {
    const f = this.cfg.fakeTalk, r = Math.random(), n = r < 0.45 ? 1 : r < 0.8 ? 2 : 3, segs = [];
    for (let i = 0; i < n; i++) {
      const v = Math.random();
      segs.push({ dur: randIn(f.syllableMs) / 1000, peak: randIn(f.peak), vis: v < 0.4 ? 'A' : v < 0.7 ? 'E' : 'O' });
      if (i < n - 1 && Math.random() < 0.3) segs.push({ dur: randIn(f.consonantMs) / 1000, peak: 1, vis: Math.random() < 0.6 ? 'M' : 'S' });
    }
    segs.push({ dur: randIn(Math.random() < f.sentenceChance ? f.sentenceGapMs : f.wordGapMs) / 1000, peak: 0, vis: null });
    return segs;
  }
  _fakeStep(dt) {
    const fk = this.fake;
    if (!fk.seg || fk.segT >= fk.seg.dur) {
      fk.seg = fk.queue.shift() || null; fk.segT = 0;
      if (!fk.seg) {
        if (fk.mode !== 'random') return ZERO;
        fk.queue.push(...this._randomWord()); fk.seg = fk.queue.shift();
      }
    }
    fk.segT += dt;
    const s = fk.seg; if (!s.vis) return ZERO;
    const u = clamp(fk.segT / s.dur), v = VIS[s.vis];
    return { L: Math.pow(Math.sin(Math.PI * u), 0.6) * s.peak * rand(0.92, 1.08) * v.level, high: v.high, round: v.round };
  }
  _audioFeatures() {
    const an = this.analyser, c = this.cfg.audio;
    an.getFloatTimeDomainData(this.td);
    let sum = 0; for (let i = 0; i < this.td.length; i++) sum += this.td[i] * this.td[i];
    const db = 20 * Math.log10(Math.sqrt(sum / this.td.length) + 1e-8);
    const L = clamp((db - c.floorDb) / (c.ceilDb - c.floorDb));
    an.getByteFrequencyData(this.fd);
    const binHz = an.context.sampleRate / an.fftSize, range = an.maxDecibels - an.minDecibels;
    const band = ([lo, hi]) => {
      const i0 = Math.max(1, Math.floor(lo / binHz)), i1 = Math.min(this.fd.length - 1, Math.ceil(hi / binHz));
      let s = 0; for (let i = i0; i <= i1; i++) s += this.fd[i];
      return an.minDecibels + (s / (i1 - i0 + 1) / 255) * range;
    };
    const low = band(c.lowBand), mid = band(c.midBand), hi = band(c.highBand);
    return { L, high: clamp((hi - low + c.sibilanceOffset) / c.sibilanceRange), round: clamp((low - mid - c.roundOffset) / c.roundRange) };
  }
  _updateMouth(dt) {
    const t = this.talk, m = this.mouth, c = this.cfg.mouth;
    const live = !t.active && this.voice && this.state === 'speaking';
    const talking = t.active || live;
    let f = ZERO;
    if (t.active) f = (t.kind === 'audio') ? this._audioFeatures() : this._fakeStep(dt);
    else if (live) f = this._audioFeatures();
    const gate = c.silenceGate;
    const open = f.L <= gate ? 0 : clamp((f.L - gate) / (1 - gate));
    const round = f.round * (1 - f.high);
    const grin = talking ? 0 : this.P.happyEyes;
    const openT = Math.max(open, grin * c.happyOpen);
    const wT = talking ? 1 + 0.28 * f.high - 0.38 * round + 0.12 * open : 1 + 0.2 * grin;
    const hT = talking ? 1 - 0.5 * f.high + 0.05 * round : 0.75;
    const rT = talking ? round : 0;
    m.env += (openT - m.env) * smoothCoef(dt, openT > m.env ? c.attack : c.release);
    const sc = smoothCoef(dt, c.shapeSmoothing);
    m.w += (wT - m.w) * sc; m.h += (hT - m.h) * sc; m.round += (rT - m.round) * sc;
    m.slow += (m.env - m.slow) * smoothCoef(dt, 0.45);
    const a = this.cfg.audio;
    if (this.state === 'speaking' && m.env - m.slow > a.emphasisJump && this.clock - m.lastEmph > a.emphasisCooldown) {
      m.lastEmph = this.clock;
      if (Math.random() < 0.7) {
        this.sp.lean.v += 0.5; this.sp.stretch.v -= 0.35; this.sp.tilt.v += rand(-0.25, 0.25);
        this.style.onNod && this.style.onNod(this);
      }
    }
  }

  /* ---------------- per-frame update ---------------- */
  update(dt) {
    this.clock += dt;
    const t = this.clock, cfg = this.cfg, m = this.motion, sp = this.sp, P = this.P;
    const ms = (cfg.respectReducedMotion && REDUCED) ? 0.5 : 1;

    const target = this.poses[this.state], k = smoothCoef(dt, cfg.stateBlendTime);
    for (const key in P) P[key] += (target[key] - P[key]) * k;
    if (this.state === 'happy' && t > this.happyUntil) this.setState(this.happyReturn === 'speaking' && !this.talk.active && !this.voice ? 'idle' : this.happyReturn);

    const now = performance.now() / 1000, ext = this.lookTarget;
    const active = !!ext || (now - Pointer.t) < cfg.gaze.idleReturn;
    let mx = 0, my = 0;
    if (active) {
      const px = ext ? ext.x : Pointer.x, py = ext ? ext.y : Pointer.y;
      mx = (px - (this.rect.left + this.cx)) / cfg.gaze.range; my = (py - (this.rect.top + this.centerY)) / cfg.gaze.range;
      const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    }
    const ib = this.idleB, ic = cfg.idle;
    if (this.state === 'idle' && !active) {
      if (t >= ib.nextGlance) {
        ib.gx = (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 0.9); ib.gy = rand(-0.3, 0.35);
        ib.glanceUntil = t + randIn(ic.glanceHold); ib.nextGlance = ib.glanceUntil + randIn(ic.glanceEvery);
        if (Math.random() < 0.35 && this.blinkS.phase === 'wait') this._startBlink();
      }
      if (t > ib.glanceUntil) ib.gx = ib.gy = 0;
    } else { ib.gx = ib.gy = 0; ib.nextGlance = Math.max(ib.nextGlance, t + 2); }
    if (t >= ib.nextSaccade) {
      ib.sx = rand(-1, 1) * ic.saccadeSize; ib.sy = rand(-1, 1) * ic.saccadeSize * 0.7;
      ib.nextSaccade = t + randIn(ic.saccadeEvery) * (this.state === 'thinking' ? 1.8 : 1);
    }
    sp.gazeX.target = clamp(lerp(ib.gx + mx * P.follow, P.gazeX, P.gazeLock) + ib.sx, -1, 1);
    sp.gazeY.target = clamp(lerp(ib.gy + my * P.follow, P.gazeY, P.gazeLock) + ib.sy, -1, 1);

    this._updateBlink(); this._updateMouth(dt); this._updateAir(dt);

    this.breath = Math.sin(t * TAU / m.breathPeriod) * m.breathAmount * P.breath * ms;
    this.bob = (Math.sin(t * TAU / m.bobPeriod) * 0.5 + 0.5) * m.bobAmount * ms;
    const dPh = t * TAU / m.driftPeriod;
    this.driftX = Math.sin(dPh) * m.drift * ms;
    sp.stretch.target = -P.lean * 0.35 + Math.sin(t * TAU / 1.4) * 0.025 * P.pulse + this.mouth.env * 0.012 + (this.air.v > 0 ? 0.05 : 0);
    let tilt = P.tilt + P.wobble * Math.sin(t * TAU / 2.2) * 0.07 * ms + sp.gazeX.x * m.tiltFollowGaze + Math.cos(dPh) * m.drift * m.tiltFromDrift * ms;
    if (t < this.wiggleUntil) tilt += Math.sin(t * 24) * 0.2 * ((this.wiggleUntil - t) / 0.8);
    sp.tilt.target = tilt; sp.lean.target = P.lean; sp.eyeScale.target = P.eyeScale;

    if (this.style.update) this.style.update(this, dt);
    for (const key in sp) sp[key].step(dt);
    if (sp.spin.target !== 0 && Math.abs(sp.spin.x - sp.spin.target) < 0.002 && Math.abs(sp.spin.v) < 0.02) { sp.spin.x = 0; sp.spin.target = 0; sp.spin.v = 0; }
  }

  _faceFrame() {
    const g = this.cfg.gaze, q = this.motion.gazeQuantize;
    let gx = this.sp.gazeX.x, gy = this.sp.gazeY.x;
    if (q) { gx = Math.round(gx * q) / q; gy = Math.round(gy * q) / q; }
    return {
      gx, gy, fx: gx * g.faceTravelX, fy: gy * g.faceTravelY + this.sp.lean.x, ex: gx * g.eyeTravelX, ey: gy * g.eyeTravelY,
      lid: Math.max(this.blinkS.value, this.P.squint), happy: clamp(this.P.happyEyes), es: this.sp.eyeScale.x,
      smile: this.P.smile, mouth: this.mouth, P: this.P, t: this.clock,
    };
  }

  draw() {
    const { ctx, W, H, R, dpr, motion: m, sp, P, style } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    const bottom = style.bottom ?? 0.94, hit = style.hit || [1.05, 1.05];
    const cx = W / 2 + this.driftX * R, ground = H - this.size * 0.1;
    const height = Math.max(0, m.hover + this.bob + this.air.lift + sp.rise.x);
    const sy = Math.max(0.55, 1 + sp.stretch.x + this.breath), sx = 1 / Math.sqrt(sy);
    const pivotY = ground - height * R;
    this.cx = cx; this.centerY = pivotY - bottom * R * sy; this.sx = sx; this.sy = sy; this.height = height;

    const hf = clamp(height / 1.0), sh = m.shadow;
    ctx.save(); ctx.translate(W / 2 + this.driftX * R * 0.6, ground);
    ctx.scale(R * 0.95 * sh.scale * (1 - 0.35 * hf) * sx, R * 0.19 * (1 - 0.3 * hf));
    ctx.globalAlpha = 0.36 * sh.alpha * (1 - 0.6 * hf); ctx.fillStyle = this.g.shadow;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();

    if (m.rings && P.rings > 0.01) {
      ctx.lineWidth = Math.max(1, R * 0.03);
      for (let i = 0; i < 2; i++) {
        const p = (this.clock * 0.6 + i * 0.5) % 1;
        ctx.strokeStyle = rgba(this.pal.fx, P.rings * Math.pow(1 - p, 2) * 0.5);
        ctx.beginPath(); ctx.ellipse(cx, this.centerY, R * (hit[0] + 0.02 + 0.5 * p) * sx, R * (hit[1] + 0.5 * p) * sy, 0, 0, TAU); ctx.stroke();
      }
    }

    const F = this._faceFrame();
    ctx.save();
    ctx.translate(cx, pivotY); ctx.rotate(sp.tilt.x); ctx.scale(sx * R, sy * R); ctx.translate(0, -bottom);
    if (sp.spin.x) ctx.rotate(sp.spin.x);
    style.draw(this, ctx, F);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (m.dots && P.dots > 0.01) {
      ctx.fillStyle = this.pal.fx;
      for (let i = 0; i < 3; i++) {
        const al = P.dots * (0.3 + 0.7 * Math.max(0, Math.sin(this.clock * 4 - i * 0.9)));
        ctx.globalAlpha = al; ctx.beginPath();
        ctx.arc(cx + R * (hit[0] * 0.8 + i * 0.24), this.centerY - R * (hit[1] * 0.95 + i * 0.25), R * (0.05 + i * 0.022) * (0.85 + 0.15 * al), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (style.drawWorld) style.drawWorld(this, ctx, F);
  }

  hitTest(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect(), hit = this.style.hit || [1.05, 1.05];
    const x = clientX - r.left - this.cx, y = clientY - r.top - this.centerY;
    const rx = this.R * hit[0] * this.sx * 1.08, ry = this.R * hit[1] * this.sy * 1.08;
    return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
  }
  getConfig() { return { style: this.styleId, colors: { body: this.pal.body, accent: this.pal.accent, feature: this.pal.featureAuto ? 'auto' : this.pal.feature }, size: this.size }; }
  destroy() {
    this._stopAllTalk(); this.attachVoice(null); Loop.remove(this);
    if (this._down) { this.canvas.removeEventListener('pointerdown', this._down); this.canvas.removeEventListener('pointermove', this._move); this.canvas.removeEventListener('pointerleave', this._leave); }
    delete this.canvas.__agent;
  }
}

function pickVoice() {
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const en = vs.filter(v => /^en(-|_|$)/i.test(v.lang));
  return en.find(v => v.localService && /natural|samantha|aria|jenny|zira|daniel/i.test(v.name)) || en.find(v => v.localService) || en[0] || null;
}

return {
  create: (canvas, opts) => new AgentCharacter(canvas, opts),
  registerStyle, AgentCharacter, Spring, feedPointer,
  pause() { Loop.paused = true; },
  resume() { Loop.paused = false; Loop.kick(); },
  get styles() { return STYLES; },
  audioContext, defaults: DEFAULTS,
  color: { mix, rgba, luminance, contrastOn, buildPalette },
  draw: { eyes, mouth, glossyBody, specSoft, specSharp, rr, pill, CIRCLE },
  util: { clamp, lerp, rand, randIn, smoothstep, TAU },
};
})();
