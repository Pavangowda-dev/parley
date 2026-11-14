/* =============================================================================
   AGENTKIT — the 12 characters. Each registerStyle({...}) block is self-contained.
   Fields: id, name, tagline, personality, motionNote, happyNote, colors, mono, bottom, hit,
           motion / springs / poses / config overrides, voice, init / update / draw / gradients, hooks.
============================================================================= */
(() => {
const { registerStyle, Spring } = AgentKit;
const { eyes, mouth, glossyBody, specSoft, specSharp, rr, pill, CIRCLE } = AgentKit.draw;
const { mix, rgba } = AgentKit.color;
const { clamp, lerp, rand, TAU } = AgentKit.util;
const PI = Math.PI;

/* ---------------------------------------------------------------- 01 NORI */
const NORI_BODY = new Path2D('M0,-1 C0.57,-1 1.02,-0.55 1.02,0.03 C1.02,0.56 0.62,0.94 0,0.94 C-0.62,0.94 -1.02,0.56 -1.02,0.03 C-1.02,-0.55 -0.57,-1 0,-1 Z');
const NORI_TUFT = new Path2D('M-0.09,0.05 C-0.10,-0.07 -0.06,-0.16 0.02,-0.19 C0.09,-0.215 0.15,-0.17 0.13,-0.115 C0.115,-0.08 0.07,-0.085 0.065,-0.115 C0.035,-0.08 0.04,-0.02 0.08,0.05 Z');
registerStyle({
  id: 'nori', name: 'Nori', tagline: 'Glossy mochi with a springy curl',
  personality: 'Calm, attentive, quietly playful.',
  motionNote: 'Jelly squash & stretch; the curl lags behind every move.',
  happyNote: 'Double hop with squash on landing.',
  colors: { body: '#0E0E10', accent: '#2E2E33', feature: 'auto' }, mono: { body: '#0E0E10', accent: '#2E2E33' },
  bottom: 0.94, hit: [1.08, 1.05],
  voice: { pitch: 1.05 },
  init: () => ({ tuft: new Spring(0, { stiffness: 90, damping: 5 }) }),
  gradients(a, ctx, p) {
    const g = ctx.createLinearGradient(0, 0.05, 0.05, -0.2);
    g.addColorStop(0, mix(p.accent, '#000', 0.45)); g.addColorStop(1, mix(p.accent, '#fff', 0.12));
    return { tuft: g };
  },
  update(a, dt) {
    const c = a.custom, s = a.sp;
    c.tuft.target = clamp(-a.air.v * 0.05 - s.stretch.v * 0.05 - s.tilt.v * 0.3 - s.gazeX.x * 0.12 - s.rise.v * 0.05, -0.8, 0.8);
    c.tuft.step(dt);
  },
  onLaunch: (a, p) => { a.custom.tuft.v -= 5 * p; },
  onLand: (a, imp) => { a.custom.tuft.v += imp * 1.4; },
  draw(a, ctx, F) {
    ctx.save(); ctx.translate(0.06, -0.96); ctx.rotate(0.12 + a.custom.tuft.x);
    ctx.fillStyle = a.g.tuft; ctx.fill(NORI_TUFT); ctx.restore();
    glossyBody(ctx, a, NORI_BODY);
    specSoft(ctx, a, F, NORI_BODY, -0.40, -0.50);
    specSharp(ctx, a, F, -0.50, -0.63);
    eyes(ctx, a, F, { type: 'pill', spacing: 0.30, y: -0.10, w: 0.18, h: 0.32 });
    mouth(ctx, a, F, { y: 0.25 });
  },
});

/* ---------------------------------------------------------------- 02 LUMI — glass orb with an orbit ring */
registerStyle({
  id: 'lumi', name: 'Lumi', tagline: 'Hovering glass orb with a light-ring',
  personality: 'Precise, serene, a little futuristic.',
  motionNote: 'Weightless hover, smooth and damped; an orbit ring circles it.',
  happyNote: 'Floats up while the ring spins faster.',
  colors: { body: '#101114', accent: '#FFFFFF', feature: 'auto' }, mono: { body: '#101114', accent: '#FFFFFF' },
  bottom: 1.0, hit: [1.05, 1.05],
  voice: { pitch: 1.0, rate: 1.02 },
  motion: { hover: 0.42, bobAmount: 0.12, bobPeriod: 3.4, breathAmount: 0.012, happy: 'float', shadow: { scale: 0.8, alpha: 0.65 }, dots: false },
  springs: { stretch: { stiffness: 220, damping: 22 } },
  init: () => ({ orbit: 0 }),
  gradients(a, ctx, p) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, rgba(p.accent, 0.7)); g.addColorStop(1, rgba(p.accent, 0));
    return { inner: g };
  },
  update(a, dt) { a.custom.orbit += dt * (0.55 + a.P.think * 2.2 + a.P.joy * 5 + a.P.listen * 0.6); },
  draw(a, ctx, F) {
    const P = a.P, pal = a.pal, t = F.t;
    const ringA = 0.42 + 0.3 * P.listen + 0.3 * P.joy + 0.15 * F.mouth.env;
    const partA = Math.max(P.think, P.joy);
    const ring = front => {
      ctx.save(); ctx.rotate(-0.22);
      ctx.strokeStyle = rgba(pal.accent, ringA); ctx.lineWidth = 0.032;
      ctx.beginPath(); ctx.ellipse(0, 0, 1.4, 0.34, 0, front ? 0 : PI, front ? PI : TAU); ctx.stroke();
      if (partA > 0.02) {
        ctx.fillStyle = pal.accent;
        for (let i = 0; i < 3; i++) {
          const ang = a.custom.orbit + i * TAU / 3, s = Math.sin(ang);
          if ((s >= 0) !== front) continue;
          ctx.globalAlpha = partA * (0.55 + 0.45 * s * (front ? 1 : -1));
          ctx.beginPath(); ctx.arc(1.4 * Math.cos(ang), 0.34 * s, 0.055 * (0.8 + 0.25 * s), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };
    ring(false);
    glossyBody(ctx, a, CIRCLE);
    ctx.save(); ctx.clip(CIRCLE);
    ctx.globalAlpha = 0.18 + 0.3 * P.listen + 0.45 * F.mouth.env + 0.2 * P.think * (0.5 + 0.5 * Math.sin(t * 3));
    ctx.translate(0, 0.5); ctx.scale(0.95, 0.7); ctx.fillStyle = a.g.inner; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.clip(CIRCLE);
    ctx.strokeStyle = `rgba(255,255,255,${pal.isDark ? 0.5 : 0.9})`; ctx.lineWidth = 0.075; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-F.gx * 0.03, -F.gy * 0.02, 0.8, PI * 1.08, PI * 1.38); ctx.stroke();
    ctx.restore();
    specSharp(ctx, a, F, Math.cos(PI * 1.47) * 0.8, Math.sin(PI * 1.47) * 0.8, 0.045, 0.045, 0);
    eyes(ctx, a, F, { type: 'glow', spacing: 0.27, y: -0.07, rx: 0.08, ry: 0.105 });
    mouth(ctx, a, F, { type: 'bars', y: 0.28, n: 5, gap: 0.07, barW: 0.038, maxOpen: 0.24, closedW: 0.06 });
    ring(true);
  },
});

/* ---------------------------------------------------------------- 03 DROP — liquid teardrop */
function contrastOnBody(a) { return AgentKit.color.contrastOn(a.pal.body); }
registerStyle({
  id: 'drop', name: 'Drop', tagline: 'Wobbly water droplet with big eyes',
  personality: 'Bubbly, curious, easily delighted.',
  motionNote: 'Very liquid: sloshes on its own, the tip sways and lags.',
  happyNote: 'Triple splashy bounce.',
  colors: { body: '#4C7DF0', accent: '#BFD4FF', feature: 'auto' }, mono: { body: '#111113', accent: '#5A5A60' },
  bottom: 0.98, hit: [1.0, 1.1],
  voice: { pitch: 1.25, rate: 1.05 },
  motion: { hover: 0.05, bobAmount: 0.03, breathAmount: 0.035, hopHeight: 0.42, hops: 3, secondHop: 0.5 },
  springs: { stretch: { stiffness: 140, damping: 7 } },
  init: () => ({ tip: new Spring(0, { stiffness: 60, damping: 4 }), nextSlosh: rand(1.5, 3) }),
  gradients(a, ctx, p) {
    const g = ctx.createRadialGradient(0.1, 0.6, 0, 0.1, 0.6, 0.65);
    g.addColorStop(0, rgba(p.accent, 0.55)); g.addColorStop(1, rgba(p.accent, 0));
    return { caustic: g };
  },
  update(a, dt) {
    const c = a.custom, s = a.sp, P = a.P, t = a.clock;
    if (t > c.nextSlosh) { s.stretch.v += rand(-0.5, 0.5); c.tip.v += rand(-1.5, 1.5); c.nextSlosh = t + rand(2.5, 5); }
    c.tip.target = -s.tilt.x * 1.2 - s.gazeX.x * 0.08 + P.listen * 0.1 + Math.sin(t * 0.9) * 0.05 * P.think;
    c.tip.v -= s.stretch.v * 0.04;
    c.tip.step(dt);
  },
  onLand: (a, imp) => { a.custom.tip.v += rand(-1, 1) * imp; },
  draw(a, ctx, F) {
    const tx = clamp(a.custom.tip.x, -0.4, 0.4);
    const p = new Path2D(`M${tx},-1.28 C${tx * 0.6 + 0.16},-0.98 0.95,-0.38 0.95,0.2 C0.95,0.68 0.53,0.98 0,0.98 C-0.53,0.98 -0.95,0.68 -0.95,0.2 C-0.95,-0.38 ${tx * 0.6 - 0.16},-0.98 ${tx},-1.28 Z`);
    glossyBody(ctx, a, p);
    ctx.save(); ctx.clip(p); ctx.fillStyle = a.g.caustic; ctx.fillRect(-1, -1.3, 2, 2.4); ctx.restore();
    specSoft(ctx, a, F, p, -0.42, -0.2, 0.42, -0.9, 0.55);
    ctx.save(); ctx.clip(p);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0.05, 0.15, 0.72, PI * 1.05, PI * 1.25); ctx.stroke(); ctx.restore();
    eyes(ctx, a, F, { type: 'round', spacing: 0.31, y: 0.06, r: 0.17, sclera: '#ffffff', pupil: a.pal.featureAuto ? '#141416' : a.pal.feature,
      pupilR: 0.58, outline: 'rgba(0,0,0,0.12)', happyColor: a.pal.featureAuto ? contrastOnBody(a) : a.pal.feature });
    mouth(ctx, a, F, { y: 0.42, width: 0.2, maxOpen: 0.24, closedW: 0.055 });
  },
});

/* ---------------------------------------------------------------- 04 KUMO — cloud of puffs */
const KUMO_PUFFS = [[-0.62, 0.2, 0.47], [-0.22, -0.2, 0.6], [0.32, -0.28, 0.56], [0.72, 0.14, 0.45], [0.02, 0.3, 0.55]];
registerStyle({
  id: 'kumo', name: 'Kumo', tagline: 'Soft cloud that drifts and puffs',
  personality: 'Dreamy, gentle, never in a hurry.',
  motionNote: 'Drifts side to side; each puff breathes on its own rhythm.',
  happyNote: 'Wiggles and puffs up.',
  colors: { body: '#F4F5F8', accent: '#FFB8C6', feature: 'auto' }, mono: { body: '#F4F5F8', accent: '#C9C9CF' },
  bottom: 0.72, hit: [1.28, 0.95],
  voice: { pitch: 1.1, rate: 0.95 },
  motion: { hover: 0.18, bobAmount: 0.08, bobPeriod: 5, drift: 0.07, driftPeriod: 8, breathAmount: 0.015, happy: 'wiggle', shadow: { scale: 1.3, alpha: 0.8 } },
  poses: { idle: { squint: 0.28 }, thinking: { squint: 0.4 }, speaking: { squint: 0.12 } },
  config: { blink: { durationMin: 0.16, durationMax: 0.22 } },
  draw(a, ctx, F) {
    const t = F.t, P = a.P, pal = a.pal;
    const path = new Path2D();
    KUMO_PUFFS.forEach(([x, y, r], i) => {
      const rr_ = r * (1 + 0.035 * Math.sin(t * 1.7 + i * 1.3) + 0.06 * P.listen + 0.06 * P.joy * Math.max(0, Math.sin(t * 10 - i)));
      path.moveTo(x + rr_, y); path.arc(x, y, rr_, 0, TAU);
    });
    rr(path, -0.95, 0.05, 1.9, 0.67, 0.33);
    ctx.lineWidth = 0.06; ctx.strokeStyle = rgba(pal.isDark ? pal.light : pal.darker, 0.35); ctx.stroke(path);
    glossyBody(ctx, a, path, { rim: false });
    ctx.save(); ctx.clip(path);
    KUMO_PUFFS.slice(1, 4).forEach(([x, y, r]) => {
      ctx.save(); ctx.translate(x - r * 0.25 - F.gx * 0.03, y - r * 0.45); ctx.scale(r / 0.46 * 0.7, r / 0.46 * 0.45);
      ctx.fillStyle = a.g.spec; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(0, 0, 0.46, 0, TAU); ctx.fill(); ctx.restore();
    });
    ctx.restore();
    ctx.fillStyle = rgba(pal.accent, 0.55);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.52 + F.fx, 0.2 + F.fy, 0.12, 0.065, 0, 0, TAU); ctx.fill(); }
    eyes(ctx, a, F, { type: 'dot', spacing: 0.3, y: 0.03, rx: 0.075, ry: 0.088 });
    mouth(ctx, a, F, { y: 0.22, width: 0.17, maxOpen: 0.2, closedW: 0.05 });
  },
});

/* ---------------------------------------------------------------- 05 BITBOT — retro screen robot */
const BOT_HEAD = rr(new Path2D(), -0.95, -0.86, 1.9, 1.81, 0.42);
const BOT_SCREEN = rr(new Path2D(), -0.72, -0.6, 1.44, 1.12, 0.26);
registerStyle({
  id: 'bitbot', name: 'Bitbot', tagline: 'Friendly robot with a pixel screen face',
  personality: 'Helpful, literal, adorably mechanical.',
  motionNote: 'Stiff, precise springs; eyes snap between pixel positions; the antenna wobbles.',
  happyNote: 'Pixel ^ ^ eyes, quick hops, antenna boing.',
  colors: { body: '#E9EAEE', accent: '#16171B', feature: 'auto' }, mono: { body: '#E9EAEE', accent: '#16171B' },
  adaptPreset: p => ({ body: p.body, accent: '#16171B' }),
  bottom: 0.95, hit: [1.1, 1.0],
  voice: { pitch: 0.85, rate: 1.05 },
  motion: { hover: 0.08, bobAmount: 0.03, breathAmount: 0.008, hopHeight: 0.26, hops: 2, secondHop: 0.6, gazeQuantize: 4, dots: false },
  springs: { stretch: { stiffness: 320, damping: 24 }, tilt: { stiffness: 200, damping: 20 }, gaze: { stiffness: 600, damping: 45 } },
  config: { blink: { durationMin: 0.08, durationMax: 0.11, closeFraction: 0.5 } },
  init: () => ({ ant: new Spring(0, { stiffness: 70, damping: 4 }) }),
  gradients(a, ctx, p) {
    const g = ctx.createLinearGradient(0, -0.6, 0, 0.52);
    g.addColorStop(0, mix(p.accent, '#fff', 0.1)); g.addColorStop(1, p.accent);
    return { screen: g };
  },
  update(a, dt) {
    const c = a.custom, s = a.sp;
    c.ant.target = clamp(-s.tilt.v * 0.25 - s.stretch.v * 0.08 - a.air.v * 0.04, -0.7, 0.7);
    c.ant.step(dt);
  },
  onLand: (a, imp) => { a.custom.ant.v += rand(-1, 1) * imp * 2; },
  onHappy: a => { a.custom.ant.v += 6; },
  draw(a, ctx, F) {
    const pal = a.pal, P = a.P, t = F.t;
    ctx.save(); ctx.translate(0, -0.85); ctx.rotate(a.custom.ant.x);
    ctx.strokeStyle = pal.dark; ctx.lineWidth = 0.05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -0.3); ctx.stroke();
    ctx.fillStyle = pal.darker; ctx.beginPath(); ctx.arc(0, -0.37, 0.085, 0, TAU); ctx.fill();
    const lit = Math.max(P.listen * (0.6 + 0.4 * Math.sin(t * 6)), a.mouth.env, P.joy);
    if (lit > 0.01) { ctx.globalAlpha = lit; ctx.fillStyle = pal.onAccent === '#ffffff' ? '#ffffff' : pal.accent; ctx.beginPath(); ctx.arc(0, -0.37, 0.085, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();
    ctx.fillStyle = pal.dark;
    for (const s of [-1, 1]) { ctx.beginPath(); rr(ctx, s * 1.0 - 0.07, -0.18, 0.14, 0.36, 0.06); ctx.fill(); }
    glossyBody(ctx, a, BOT_HEAD);
    specSoft(ctx, a, F, BOT_HEAD, -0.55, -0.62, 0.35, -0.3, 0.45);
    ctx.fillStyle = a.g.screen; ctx.fill(BOT_SCREEN);
    ctx.lineWidth = 0.035; ctx.strokeStyle = rgba(pal.darker, 0.5); ctx.stroke(BOT_SCREEN);
    ctx.save(); ctx.clip(BOT_SCREEN);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(-0.8, -0.65); ctx.lineTo(0.05, -0.65); ctx.lineTo(-0.45, 0.6); ctx.lineTo(-0.8, 0.6); ctx.fill();
    ctx.globalAlpha = 0.05; ctx.fillStyle = pal.onAccent;
    for (let y = -0.58; y < 0.52; y += 0.06) ctx.fillRect(-0.72, y, 1.44, 0.015);
    ctx.globalAlpha = 1;
    const f = { ...F, fx: F.fx * 0.8 };
    eyes(ctx, a, f, { type: 'pixel', spacing: 0.3, y: -0.14, w: 0.16, h: 0.24, px: 0.04, color: pal.onAccent, alpha: 1 - P.think * 0.25 });
    mouth(ctx, a, f, { type: 'pixel', y: 0.24, width: 0.32, maxOpen: 0.22, px: 0.04, color: pal.onAccent });
    if (P.think > 0.01) {
      for (let i = 0; i < 8; i++) {
        const ang = i / 8 * TAU, ph = ((t * 1.6 - i / 8) % 1 + 1) % 1;
        ctx.globalAlpha = P.think * (0.15 + 0.85 * Math.pow(1 - ph, 3)); ctx.fillStyle = pal.onAccent;
        ctx.fillRect(0.45 + Math.cos(ang) * 0.1 - 0.02, -0.38 + Math.sin(ang) * 0.1 - 0.02, 0.04, 0.04);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },
});

/* ---------------------------------------------------------------- 06 PIP — little chick */
const PIP_BODY = new Path2D('M0,-1 C0.62,-1 0.98,-0.45 0.98,0.12 C0.98,0.66 0.56,0.98 0,0.98 C-0.56,0.98 -0.98,0.66 -0.98,0.12 C-0.98,-0.45 -0.62,-1 0,-1 Z');
const PIP_FEATHER = new Path2D('M-0.05,0.02 C-0.07,-0.08 -0.03,-0.17 0,-0.2 C0.03,-0.17 0.07,-0.08 0.05,0.02 Z');
registerStyle({
  id: 'pip', name: 'Pip', tagline: 'Round little chick with a chatty beak',
  personality: 'Chirpy, curious, always ready to help.',
  motionNote: 'Sits on its feet; quick curious head-tilts; wings flutter.',
  happyNote: 'Three quick hops with flapping wings.',
  colors: { body: '#FFD15C', accent: '#FF8F3C', feature: 'auto' }, mono: { body: '#F4F4F6', accent: '#2A2A2E' },
  bottom: 1.07, hit: [1.02, 1.02],
  voice: { pitch: 1.5, rate: 1.08 },
  motion: { hover: 0, bobAmount: 0, breathAmount: 0.02, hopHeight: 0.3, hops: 3, secondHop: 0.7, gravity: 20 },
  springs: { tilt: { stiffness: 260, damping: 15 } },
  poses: { listening: { tilt: 0.17, lean: 0.03 }, thinking: { tilt: -0.1 } },
  init: () => ({ wing: new Spring(0, { stiffness: 160, damping: 9 }), crest: new Spring(0, { stiffness: 90, damping: 6 }), flapUntil: 0, nextCock: rand(3, 6) }),
  update(a, dt) {
    const c = a.custom, s = a.sp, t = a.clock;
    if (a.state === 'idle' && t > c.nextCock) { s.tilt.v += (Math.random() < 0.5 ? -1 : 1) * rand(1.2, 1.8); c.nextCock = t + rand(3.5, 7); }
    c.wing.target = t < c.flapUntil ? 0.55 + 0.55 * Math.sin(t * 30) : 0.08 * a.P.listen + a.mouth.env * 0.18;
    c.crest.target = clamp(-s.tilt.v * 0.25 - a.air.v * 0.05 - s.stretch.v * 0.05, -0.6, 0.6);
    c.wing.step(dt); c.crest.step(dt);
  },
  onHappy: a => { a.custom.flapUntil = a.clock + 0.9; },
  onNod: a => { a.custom.wing.v += 4; },
  onLand: (a, imp) => { a.custom.crest.v += imp * 1.5; },
  draw(a, ctx, F) {
    const pal = a.pal, c = a.custom, m = a.mouth;
    const wingCol = mix(pal.body, '#000', 0.1);
    ctx.fillStyle = pal.accentDark;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.3, 1.0, 0.17, 0.075, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = wingCol;
    [-0.45, 0, 0.45].forEach((r, i) => { ctx.save(); ctx.translate(0, -0.97); ctx.rotate(r + c.crest.x); ctx.scale(1, i === 1 ? 1.25 : 0.9); ctx.fill(PIP_FEATHER); ctx.restore(); });
    glossyBody(ctx, a, PIP_BODY);
    ctx.save(); ctx.clip(PIP_BODY);
    ctx.fillStyle = rgba(mix(pal.body, '#fff', 0.45), 0.6); ctx.beginPath(); ctx.ellipse(0, 0.58, 0.6, 0.42, 0, 0, TAU); ctx.fill();
    ctx.restore();
    specSoft(ctx, a, F, PIP_BODY, -0.42, -0.55, 0.4);
    specSharp(ctx, a, F, -0.52, -0.66, 0.07, 0.035);
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * 0.86, 0.02); ctx.rotate(s * (0.35 + c.wing.x));
      ctx.fillStyle = wingCol; ctx.beginPath(); ctx.ellipse(s * 0.06, 0.2, 0.13, 0.27, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    eyes(ctx, a, F, { type: 'dot', spacing: 0.3, y: -0.2, r: 0.085 });
    const bx = F.fx * 1.1, by = 0.02 + F.fy * 1.05, open = m.env * 0.2 + F.P.joy * 0.05;
    ctx.save(); ctx.translate(bx, by);
    ctx.fillStyle = pal.accentDark;
    ctx.beginPath(); ctx.moveTo(-0.1, 0.02); ctx.quadraticCurveTo(0, 0.05 + open * 0.6, 0.1, 0.02); ctx.lineTo(0, 0.12 + open); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.accent;
    ctx.beginPath(); ctx.moveTo(-0.13, 0.02); ctx.quadraticCurveTo(0, -0.12, 0.13, 0.02); ctx.quadraticCurveTo(0, 0.11, -0.13, 0.02); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-0.04, -0.02, 0.04, 0.018, -0.3, 0, TAU); ctx.fill();
    ctx.restore();
  },
});

/* ---------------------------------------------------------------- 07 MISO — cat loaf */
const MISO_BODY = new Path2D('M0,-0.92 C0.62,-0.92 1.02,-0.6 1.02,-0.05 C1.02,0.55 0.66,0.9 0,0.9 C-0.66,0.9 -1.02,0.55 -1.02,-0.05 C-1.02,-0.6 -0.62,-0.92 0,-0.92 Z');
const MISO_EAR = new Path2D('M-0.28,0.12 C-0.27,-0.18 -0.15,-0.43 -0.03,-0.5 C0.05,-0.54 0.12,-0.47 0.16,-0.37 C0.22,-0.2 0.27,-0.02 0.28,0.14 Z');
registerStyle({
  id: 'miso', name: 'Miso', tagline: 'Cat-shaped loaf with expressive ears',
  personality: 'Cool, observant, secretly affectionate.',
  motionNote: 'Ears twitch independently, tail swishes, slow cat blinks.',
  happyNote: 'Hop, ears perk and the tail curls up.',
  colors: { body: '#2A2A2E', accent: '#F2A7B5', feature: 'auto' }, mono: { body: '#1A1A1D', accent: '#8C8C92' },
  bottom: 0.9, hit: [1.1, 1.0],
  voice: { pitch: 1.15, rate: 0.98 },
  motion: { hover: 0.04, bobAmount: 0.02, breathAmount: 0.03, breathPeriod: 4.2, hopHeight: 0.3, hops: 1 },
  config: { blink: { durationMin: 0.15, durationMax: 0.26 } },
  init: () => ({ ears: [new Spring(0, { stiffness: 180, damping: 8 }), new Spring(0, { stiffness: 180, damping: 8 })], tail: new Spring(0, { stiffness: 40, damping: 6 }), nextTwitch: rand(2, 5) }),
  update(a, dt) {
    const c = a.custom, P = a.P, t = a.clock, s = a.sp;
    if (t > c.nextTwitch) { c.ears[Math.random() < 0.5 ? 0 : 1].v += rand(7, 11); c.nextTwitch = t + rand(2.5, 7); }
    c.ears.forEach((e, i) => { e.target = -0.16 * P.listen - 0.12 * P.joy + (i === 0 ? 0.42 : 0.05) * P.think - s.stretch.v * 0.02; e.step(dt); });
    c.tail.target = Math.sin(t * 1.3) * 0.35 * (1 + P.joy) + 0.25 * P.listen + 0.6 * P.joy;
    c.tail.step(dt);
  },
  onNod: a => { a.custom.ears[1].v += 4; },
  draw(a, ctx, F) {
    const pal = a.pal, c = a.custom, m = a.mouth, P = a.P;
    const sw = c.tail.x;
    ctx.strokeStyle = mix(pal.body, '#000', 0.12); ctx.lineWidth = 0.16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0.62, 0.62);
    ctx.bezierCurveTo(1.25, 0.72, 1.32 + 0.2 * sw, 0.05, 1.06 + 0.42 * sw, -0.32 - 0.12 * clamp(sw));
    ctx.stroke();
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      ctx.save(); ctx.translate(side * 0.52, -0.66); ctx.rotate(side * (0.26 + c.ears[i].x)); ctx.scale(side, 1);
      ctx.fillStyle = mix(pal.body, '#fff', pal.isDark ? 0.06 : 0); ctx.fill(MISO_EAR);
      ctx.save(); ctx.translate(0.0, -0.02); ctx.scale(0.55, 0.62); ctx.fillStyle = rgba(pal.accent, 0.9); ctx.fill(MISO_EAR); ctx.restore();
      ctx.restore();
    }
    glossyBody(ctx, a, MISO_BODY);
    specSoft(ctx, a, F, MISO_BODY, -0.42, -0.5, 0.42);
    specSharp(ctx, a, F, -0.55, -0.6, 0.075, 0.04);
    eyes(ctx, a, F, { type: 'dot', spacing: 0.36, y: -0.1, rx: 0.1, ry: 0.135 });
    const nx = F.fx * 1.1 + P.mouthX, ny = 0.15 + F.fy * 1.05;
    ctx.fillStyle = pal.accent;
    ctx.beginPath(); ctx.moveTo(nx - 0.055, ny - 0.03); ctx.quadraticCurveTo(nx, ny - 0.05, nx + 0.055, ny - 0.03); ctx.quadraticCurveTo(nx + 0.02, ny + 0.03, nx, ny + 0.035); ctx.quadraticCurveTo(nx - 0.02, ny + 0.03, nx - 0.055, ny - 0.03); ctx.fill();
    const closed = 1 - AgentKit.util.smoothstep(0.03, 0.15, m.env);
    ctx.strokeStyle = pal.feature; ctx.lineWidth = 0.035; ctx.lineCap = 'round';
    if (closed > 0) {
      ctx.globalAlpha = closed; const w = 0.075 + 0.02 * F.smile;
      ctx.beginPath(); ctx.moveTo(nx, ny + 0.035); ctx.quadraticCurveTo(nx - 0.01, ny + 0.1, nx - w, ny + 0.08);
      ctx.moveTo(nx, ny + 0.035); ctx.quadraticCurveTo(nx + 0.01, ny + 0.1, nx + w, ny + 0.08); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (m.env > 0.03) { ctx.save(); ctx.globalAlpha = 1 - closed * 0.6; mouth(ctx, a, F, { y: 0.27, width: 0.17, maxOpen: 0.2, closedW: 0.001, lineW: 0.001 }); ctx.restore(); }
    ctx.strokeStyle = rgba(pal.feature, 0.4); ctx.lineWidth = 0.018;
    for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) {
      const wy = 0.16 + k * 0.06 + F.fy, wob = Math.sin(F.t * 2 + k) * 0.01 + m.env * 0.03 * s;
      ctx.beginPath(); ctx.moveTo(s * 0.58 + F.fx, wy); ctx.lineTo(s * 0.86 + F.fx, wy + k * 0.05 + wob); ctx.stroke();
    }
  },
});

/* ---------------------------------------------------------------- 08 BOO — friendly ghost */
registerStyle({
  id: 'boo', name: 'Boo', tagline: 'Floaty ghost with a rippling hem',
  personality: 'Shy, sweet, surprisingly funny.',
  motionNote: 'Floats high and drifts; the hem ripples; little arms wave.',
  happyNote: 'Swooshes up in a floaty loop.',
  colors: { body: '#F6F6F9', accent: '#FFB8C6', feature: 'auto' }, mono: { body: '#F6F6F9', accent: '#C9C9CF' },
  bottom: 0.92, hit: [1.0, 1.05],
  voice: { pitch: 1.3, rate: 0.95 },
  motion: { hover: 0.5, bobAmount: 0.16, bobPeriod: 3.2, drift: 0.1, driftPeriod: 6.5, breathAmount: 0.02, happy: 'float', shadow: { scale: 0.85, alpha: 0.55 } },
  poses: { thinking: { squint: 0.1 } },
  init: () => ({ arm: new Spring(0, { stiffness: 80, damping: 7 }) }),
  update(a, dt) {
    const P = a.P, t = a.clock, c = a.custom;
    c.arm.target = 0.2 * Math.sin(t * 2.2) + P.joy * 0.6 * Math.sin(t * 14) + P.listen * 0.35 + a.mouth.env * 0.2;
    c.arm.step(dt);
  },
  draw(a, ctx, F) {
    const t = F.t, pal = a.pal, P = a.P;
    const p = new Path2D();
    p.moveTo(-0.9, 0.05); p.bezierCurveTo(-0.9, -0.6, -0.5, -1, 0, -1); p.bezierCurveTo(0.5, -1, 0.9, -0.6, 0.9, 0.05);
    const N = 28; p.lineTo(0.9, 0.78 + 0.09 * Math.sin(0.9 * 7 + t * 3.5));
    for (let i = 1; i <= N; i++) { const x = 0.9 - 1.8 * i / N; p.lineTo(x, 0.78 + 0.09 * Math.sin(x * 7 + t * 3.5) + 0.04 * Math.sin(x * 13 - t * 2)); }
    p.closePath();
    ctx.globalAlpha = 0.97 - P.think * 0.15;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * 0.82, 0.18); ctx.rotate(s * (0.55 + a.custom.arm.x));
      ctx.fillStyle = a.g.body; ctx.beginPath(); ctx.ellipse(s * 0.1, 0.06, 0.2, 0.11, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
    glossyBody(ctx, a, p);
    specSoft(ctx, a, F, p, -0.4, -0.55, 0.42);
    specSharp(ctx, a, F, -0.5, -0.68, 0.07, 0.035);
    ctx.globalAlpha = 1;
    ctx.fillStyle = rgba(pal.accent, 0.5);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.47 + F.fx, 0.02 + F.fy, 0.11, 0.06, 0, 0, TAU); ctx.fill(); }
    eyes(ctx, a, F, { type: 'dot', spacing: 0.27, y: -0.2, rx: 0.085, ry: 0.13 });
    mouth(ctx, a, F, { y: 0.12, width: 0.17, maxOpen: 0.26, roundBias: 0.45, closedW: 0.05 });
  },
});

/* ---------------------------------------------------------------- 09 SPROUT — seedling bean */
const SPROUT_BODY = new Path2D('M0,-1 C0.45,-0.98 0.95,-0.52 0.95,0.1 C0.95,0.62 0.58,0.95 0,0.95 C-0.58,0.95 -0.95,0.62 -0.95,0.1 C-0.95,-0.52 -0.45,-0.98 0,-1 Z');
const SPROUT_LEAF = new Path2D('M0,0 C0.06,-0.17 0.3,-0.24 0.5,-0.1 C0.36,0.06 0.12,0.08 0,0 Z');
registerStyle({
  id: 'sprout', name: 'Sprout', tagline: 'Seedling bean with two living leaves',
  personality: 'Optimistic, nurturing, grows on you.',
  motionNote: 'Leaves sway in a breeze, perk up to listen and droop to think.',
  happyNote: 'Hops while the leaves flap.',
  colors: { body: '#E8D6B6', accent: '#5DAE63', feature: 'auto' }, mono: { body: '#EDEDEF', accent: '#2A2A2E' },
  bottom: 0.95, hit: [0.98, 1.05],
  voice: { pitch: 1.2, rate: 1.0 },
  motion: { hover: 0.02, bobAmount: 0.02, breathAmount: 0.025, hopHeight: 0.32, hops: 2 },
  init: () => ({ leaves: [new Spring(0, { stiffness: 120, damping: 7 }), new Spring(0, { stiffness: 120, damping: 7 })], stem: new Spring(0, { stiffness: 80, damping: 6 }) }),
  gradients(a, ctx, p) {
    const g = ctx.createLinearGradient(0, -0.2, 0.5, 0.05);
    g.addColorStop(0, mix(p.accent, '#fff', 0.2)); g.addColorStop(1, mix(p.accent, '#000', 0.2));
    return { leaf: g };
  },
  update(a, dt) {
    const c = a.custom, P = a.P, t = a.clock, s = a.sp;
    const wind = Math.sin(t * 1.3) * 0.07 + Math.sin(t * 2.9) * 0.03;
    const open = -0.3 * P.listen + 0.6 * P.think - 0.2 * P.joy;
    c.leaves[0].target = open + wind; c.leaves[1].target = open - wind * 0.8;
    c.stem.target = clamp(-s.tilt.v * 0.2 + wind * 0.6 - s.gazeX.x * 0.08 - a.air.v * 0.03, -0.6, 0.6);
    c.leaves.forEach(l => l.step(dt)); c.stem.step(dt);
  },
  onHappy: a => { a.custom.leaves.forEach(l => l.v -= 8); },
  onNod: a => { a.custom.leaves.forEach(l => l.v += 2.5); },
  onLand: (a, imp) => { a.custom.leaves.forEach(l => l.v += imp * 2); },
  draw(a, ctx, F) {
    const pal = a.pal, c = a.custom;
    ctx.save(); ctx.translate(0, -0.95); ctx.rotate(c.stem.x);
    ctx.strokeStyle = mix(pal.accent, '#000', 0.25); ctx.lineWidth = 0.055; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0.05); ctx.quadraticCurveTo(0.03, -0.12, 0, -0.26); ctx.stroke();
    ctx.translate(0, -0.25);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      ctx.save(); ctx.scale(side, 1); ctx.rotate(-(0.35 - c.leaves[i].x));
      ctx.fillStyle = a.g.leaf; ctx.fill(SPROUT_LEAF);
      ctx.strokeStyle = rgba(mix(pal.accent, '#000', 0.35), 0.6); ctx.lineWidth = 0.014;
      ctx.beginPath(); ctx.moveTo(0.02, 0); ctx.quadraticCurveTo(0.22, -0.07, 0.42, -0.09); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    glossyBody(ctx, a, SPROUT_BODY);
    specSoft(ctx, a, F, SPROUT_BODY, -0.4, -0.5, 0.42);
    specSharp(ctx, a, F, -0.48, -0.64, 0.07, 0.035);
    ctx.fillStyle = rgba(pal.darker, 0.35);
    for (const s of [-1, 1]) [[0.0, 0], [0.07, 0.04], [-0.06, 0.05]].forEach(([dx, dy]) => {
      ctx.beginPath(); ctx.arc(s * (0.45 + dx) + F.fx, 0.2 + dy + F.fy, 0.018, 0, TAU); ctx.fill();
    });
    eyes(ctx, a, F, { type: 'dot', spacing: 0.27, y: 0.02, r: 0.072 });
    mouth(ctx, a, F, { y: 0.28, width: 0.18, maxOpen: 0.24, closedW: 0.055 });
  },
});

/* ---------------------------------------------------------------- 10 TOK — two-tone capsule with a visor */
const TOK_BODY = rr(new Path2D(), -0.72, -1.1, 1.44, 2.2, 0.72);
const TOK_VISOR = rr(new Path2D(), -0.6, -0.58, 1.2, 0.5, 0.25);
registerStyle({
  id: 'tok', name: 'Tok', tagline: 'Two-tone capsule with a light visor',
  personality: 'Efficient, cool-headed, quietly witty.',
  motionNote: 'Metronome sway; visor eyes glow; speaker-grille mouth.',
  happyNote: 'A full 360° roll.',
  colors: { body: '#1C1D21', accent: '#E7E8EC', feature: 'auto' }, mono: { body: '#1C1D21', accent: '#E7E8EC' },
  bottom: 1.1, hit: [0.85, 1.15],
  voice: { pitch: 0.9, rate: 1.02 },
  motion: { hover: 0.1, bobAmount: 0.04, breathAmount: 0.012, happy: 'spin', dots: false },
  springs: { tilt: { stiffness: 150, damping: 14 } },
  poses: { idle: { wobble: 0.4 }, thinking: { wobble: 1.2 } },
  draw(a, ctx, F) {
    const pal = a.pal, P = a.P, t = F.t;
    glossyBody(ctx, a, TOK_BODY, { rim: false });
    ctx.save(); ctx.clip(TOK_BODY);
    ctx.fillStyle = a.g.accent; ctx.beginPath(); ctx.moveTo(-1, 0.22); ctx.quadraticCurveTo(0, 0.36, 1, 0.22); ctx.lineTo(1, 1.2); ctx.lineTo(-1, 1.2); ctx.fill();
    ctx.strokeStyle = rgba('#000000', 0.25); ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(-1, 0.22); ctx.quadraticCurveTo(0, 0.36, 1, 0.22); ctx.stroke();
    ctx.fillStyle = a.g.bounce; ctx.fillRect(-1, -1.2, 2, 2.4);
    ctx.lineWidth = 0.09; ctx.strokeStyle = a.g.rim; ctx.stroke(TOK_BODY);
    ctx.restore();
    specSoft(ctx, a, F, TOK_BODY, -0.35, -0.82, 0.32, -0.4, 0.5);
    const visor = mix(pal.body, '#000', 0.75);
    ctx.save(); ctx.translate(F.fx * 0.8, F.fy * 0.6);
    ctx.fillStyle = visor; ctx.fill(TOK_VISOR);
    ctx.lineWidth = 0.025; ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke(TOK_VISOR);
    ctx.save(); ctx.clip(TOK_VISOR);
    const eyeCol = pal.featureAuto ? '#ffffff' : pal.feature;
    const f = { ...F, fx: 0, fy: 0 };
    eyes(ctx, a, f, { type: 'pill', spacing: 0.25, y: -0.33, w: 0.25, h: 0.15, minH: 0.03, color: eyeCol, bloom: 0.18 + 0.2 * P.listen, alpha: 1 - P.think * 0.75, happyR: 0.1 });
    if (P.think > 0.01) {
      const x = Math.sin(t * 3) * 0.45;
      ctx.globalAlpha = P.think; ctx.fillStyle = eyeCol; pill(ctx, x, -0.33, 0.07, 0.22); ctx.fill();
      ctx.globalAlpha = P.think * 0.25; pill(ctx, x, -0.33, 0.2, 0.3); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(-0.6, -0.58); ctx.lineTo(-0.1, -0.58); ctx.lineTo(-0.35, -0.08); ctx.lineTo(-0.6, -0.08); ctx.fill();
    ctx.restore(); ctx.restore();
    mouth(ctx, a, F, { type: 'bars', y: 0.62, n: 3, gap: 0.1, barW: 0.05, maxOpen: 0.22, closed: 'dots', color: mix(pal.accent, '#000', 0.55) });
  },
});

/* ---------------------------------------------------------------- 11 WISP — living flame */
registerStyle({
  id: 'wisp', name: 'Wisp', tagline: 'Little living flame that flickers',
  personality: 'Energetic, warm, sparks ideas.',
  motionNote: 'Constant flicker; embers drift up; grows when listening, dims when thinking.',
  happyNote: 'Flares tall with a burst of embers.',
  colors: { body: '#FF6A3D', accent: '#FFC857', feature: 'auto' }, mono: { body: '#141416', accent: '#8E8E95' },
  bottom: 0.9, hit: [0.95, 1.15],
  voice: { pitch: 1.1, rate: 1.1 },
  motion: { hover: 0.05, bobAmount: 0.04, breathAmount: 0.03, breathPeriod: 2.2, happy: 'flare', shadow: { scale: 0.85 } },
  springs: { stretch: { stiffness: 160, damping: 9 } },
  init: () => ({ embers: [], spawn: 0 }),
  gradients(a, ctx, p) {
    const g = ctx.createRadialGradient(0, 0.45, 0, 0, 0.45, 1.5);
    g.addColorStop(0, p.accent); g.addColorStop(0.5, p.body); g.addColorStop(1, mix(p.body, '#000', 0.3));
    const core = ctx.createRadialGradient(0, 0.4, 0, 0, 0.4, 0.8);
    core.addColorStop(0, rgba(mix(p.accent, '#fff', 0.5), 0.85)); core.addColorStop(1, rgba(p.accent, 0));
    return { flame: g, core };
  },
  update(a, dt) {
    const c = a.custom, P = a.P;
    a.sp.stretch.v += (Math.random() - 0.5) * dt * 7;
    c.spawn += dt * (0.8 + P.listen * 1.5 + a.mouth.env * 4);
    while (c.spawn > 1) { c.spawn -= 1; this._ember(c); }
    for (const e of c.embers) { e.life += dt; e.x += e.vx * dt + Math.sin(e.life * 6 + e.ph) * 0.002; e.y += e.vy * dt; }
    c.embers = c.embers.filter(e => e.life < e.max).slice(-40);
  },
  _ember(c) { c.embers.push({ x: rand(-0.3, 0.3), y: rand(-0.7, -0.3), vx: rand(-0.15, 0.15), vy: -rand(0.5, 1.1), life: 0, max: rand(0.7, 1.3), r: rand(0.022, 0.045), ph: rand(0, 6) }); },
  onHappy(a) { for (let i = 0; i < 12; i++) this._ember(a.custom); },
  draw(a, ctx, F) {
    const t = F.t, P = a.P, s = a.sp;
    const tipX = 0.12 * Math.sin(t * 3.1) + 0.06 * Math.sin(t * 7.3) - s.tilt.v * 0.08;
    const tipY = -1.25 - 0.07 * Math.sin(t * 5.2) - 0.2 * P.listen + 0.18 * P.think;
    const shape = (k, ox, oy) => {
      const p = new Path2D(), X = x => ox + x * k, Y = y => oy + y * k;
      p.moveTo(X(tipX), Y(tipY));
      p.bezierCurveTo(X(0.25 + tipX * 0.4), Y(-0.95), X(0.95), Y(-0.38 + 0.05 * Math.sin(t * 4.1)), X(0.92), Y(0.25));
      p.bezierCurveTo(X(0.9), Y(0.72), X(0.5), Y(0.9), X(0), Y(0.9));
      p.bezierCurveTo(X(-0.5), Y(0.9), X(-0.9), Y(0.72), X(-0.92), Y(0.25));
      p.bezierCurveTo(X(-0.95), Y(-0.3 + 0.06 * Math.sin(t * 3.7 + 1)), X(-0.4 + tipX * 0.3), Y(-0.75), X(tipX), Y(tipY));
      return p;
    };
    const outer = shape(1, 0, 0);
    ctx.fillStyle = a.g.flame; ctx.fill(outer);
    ctx.save(); ctx.clip(outer);
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 9) * 0.3 - P.think * 0.3;
    ctx.fillStyle = a.g.core; ctx.fill(shape(0.6, 0, 0.32));
    ctx.globalAlpha = 1; ctx.lineWidth = 0.08; ctx.strokeStyle = a.g.rim; ctx.stroke(outer);
    ctx.restore();
    specSoft(ctx, a, F, outer, -0.42, -0.25, 0.35, -0.9, 0.5);
    ctx.fillStyle = a.pal.accent;
    for (const e of a.custom.embers) {
      ctx.globalAlpha = Math.sin(Math.PI * e.life / e.max) * 0.9;
      ctx.beginPath(); ctx.arc(e.x, e.y + tipY + 0.6, e.r * (1 - e.life / e.max * 0.5), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    eyes(ctx, a, F, { type: 'dot', spacing: 0.28, y: 0.12, rx: 0.075, ry: 0.095 });
    mouth(ctx, a, F, { y: 0.4, width: 0.18, maxOpen: 0.24, closedW: 0.055 });
  },
});

/* ---------------------------------------------------------------- 12 MEDU — jellyfish */
registerStyle({
  id: 'medu', name: 'Medu', tagline: 'Glowing jellyfish that swims in pulses',
  personality: 'Mellow, graceful, quietly wise.',
  motionNote: 'Swims with bell pulses; tentacles trail and sway; spots glow.',
  happyNote: 'A quick upward swim burst.',
  colors: { body: '#A99BFF', accent: '#7C6CF0', feature: 'auto' }, mono: { body: '#EDEDF0', accent: '#5C5C63' },
  bottom: 1.36, hit: [1.0, 0.85],
  voice: { pitch: 1.15, rate: 0.92 },
  motion: { hover: 0.2, bobAmount: 0.1, bobPeriod: 3.6, breathAmount: 0.0, happy: 'float', shadow: { scale: 0.8, alpha: 0.5 } },
  springs: { stretch: { stiffness: 120, damping: 8 } },
  init: () => ({ nextPulse: rand(1, 2), trail: new Spring(0, { stiffness: 40, damping: 6 }) }),
  update(a, dt) {
    const c = a.custom, P = a.P, t = a.clock;
    if (t >= c.nextPulse) {
      a.sp.stretch.v += 1.6; a.sp.rise.v += 0.9; c.trail.v += 3;
      c.nextPulse = t + rand(2.2, 3.4) / (1 + P.joy * 2 + P.listen * 0.4 + P.speak * 0.3);
    }
    c.trail.step(dt);
  },
  onHappy: a => { a.custom.trail.v += 5; a.custom.nextPulse = a.clock + 0.45; },
  draw(a, ctx, F) {
    const t = F.t, pal = a.pal, P = a.P, lenF = 1 + a.custom.trail.x * 0.18;
    ctx.lineCap = 'round';
    [-0.6, -0.3, 0, 0.3, 0.6].forEach((ax, i) => {
      const len = (0.8 + 0.18 * Math.sin(i * 2.1 + 1)) * lenF;
      ctx.strokeStyle = rgba(i % 2 ? pal.accent : mix(pal.accent, pal.body, 0.4), 0.85);
      ctx.lineWidth = i % 2 ? 0.05 : 0.08;
      ctx.beginPath();
      for (let s = 0; s <= 12; s++) {
        const u = s / 12, x = ax * (1 - 0.25 * u) + Math.sin(t * 2.3 - u * 4.2 + i * 1.4) * 0.11 * u - a.sp.tilt.x * u * 0.6, y = 0.3 + u * len;
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    });
    const p = new Path2D();
    p.moveTo(-0.95, 0.3); p.bezierCurveTo(-0.95, -0.48, -0.52, -0.86, 0, -0.86); p.bezierCurveTo(0.52, -0.86, 0.95, -0.48, 0.95, 0.3);
    for (let k = 0; k < 6; k++) { const x0 = 0.95 - k * (1.9 / 6), x1 = x0 - 1.9 / 6; p.quadraticCurveTo((x0 + x1) / 2, 0.46 + 0.03 * Math.sin(t * 3 + k), x1, 0.3); }
    p.closePath();
    ctx.globalAlpha = 0.96; glossyBody(ctx, a, p); ctx.globalAlpha = 1;
    ctx.save(); ctx.clip(p);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.moveTo(-0.9, 0.24); ctx.quadraticCurveTo(0, 0.4, 0.9, 0.24); ctx.stroke();
    [[-0.5, -0.4], [0, -0.62], [0.5, -0.4], [-0.72, 0.02], [0.72, 0.02]].forEach(([x, y], i) => {
      const g = 0.3 + 0.35 * P.listen + 0.6 * P.think * Math.max(0, Math.sin(t * 4 - i)) + 0.3 * P.joy;
      ctx.fillStyle = rgba(pal.accent, clamp(g)); ctx.beginPath(); ctx.arc(x, y, 0.065, 0, TAU); ctx.fill();
    });
    ctx.restore();
    specSoft(ctx, a, F, p, -0.42, -0.45, 0.4);
    specSharp(ctx, a, F, -0.52, -0.58, 0.07, 0.035);
    eyes(ctx, a, F, { type: 'dot', spacing: 0.3, y: -0.12, r: 0.075 });
    mouth(ctx, a, F, { y: 0.12, width: 0.16, maxOpen: 0.2, closedW: 0.05 });
  },
});

/* ---------------------------------------------------------------- colour presets (shared by the studio) */
AgentKit.PRESETS = [
  { name: 'Onyx',     body: '#0E0E10', accent: '#3A3A40' },
  { name: 'Pearl',    body: '#F5F5F7', accent: '#CFD0D6' },
  { name: 'Graphite', body: '#4A4D55', accent: '#A3A7B3' },
  { name: 'Ocean',    body: '#3F72E8', accent: '#A9C4FF' },
  { name: 'Mint',     body: '#36B892', accent: '#B7F0DD' },
  { name: 'Lilac',    body: '#9D8CF5', accent: '#E0D8FF' },
  { name: 'Sunny',    body: '#FFC94A', accent: '#FF8A3D' },
  { name: 'Coral',    body: '#FF6F61', accent: '#FFD0A8' },
];
AgentKit.adaptPreset = (id, p) => (AgentKit.styles[id] && AgentKit.styles[id].adaptPreset ? AgentKit.styles[id].adaptPreset(p) : { body: p.body, accent: p.accent });
})();
