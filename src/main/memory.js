// Long-term memory + analytics. Stored in %APPDATA%/Parley/memory.json. All times in IST.
//
// Retention (keeps the file small and every conversation fast):
//   - Details (timeline events, day summaries, corrections): last 30 days
//   - Tiny per-day stats (minutes, words, accuracy, sleep): kept for the dashboard
//   - What Kakashi is told before each chat: only the most relevant, recent slice
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const settings = require("./settings");

const DETAIL_DAYS = 30;
const EMPTY = {
  facts: [],          // [{id, text, added}]
  projects: [],       // [{id, name, status, notes, nextStep, updated, created}]
  followups: [],      // [{id, text, due, created, done, doneAt}]
  days: {},           // { "YYYY-MM-DD": { summary, events:[{id,time,text}], chats, speakingSec, sleep, stats } }
  corrections: [],    // [{id, said, better, why, type, betterWord, at, day}]
  patterns: [],       // recurring mistake labels
  lexicon: {},        // { word: [count, firstDay] } — your spoken vocabulary
  reminders: [],      // [{id, text, dueAt, created, done, firedAt}]
  pending: [],        // chats not yet processed into memory (retried if offline)
  lastChatAt: null,
  sleepPending: null,
  lastWake: null,
};

let mem = null;
let saveTimer = null;
const file = () => path.join(app.getPath("userData"), "memory.json");
const uid = () => Math.random().toString(36).slice(2, 9);
const nowISO = () => new Date().toISOString();

// ---------------------------------------------------------------- time (IST)
const tz = () => settings.load().timezone || "Asia/Kolkata";
function parts(d = new Date()) {
  const p = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-GB", {
    timeZone: tz(), year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(d)) p[type] = value;
  return p;
}
const today = (d = new Date()) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
const hhmm = (d = new Date()) => { const p = parts(d); return `${p.hour}:${p.minute}`; };
const hour = (d = new Date()) => { const p = parts(d); return +p.hour + +p.minute / 60; };
const clock12 = (d = new Date()) => new Intl.DateTimeFormat("en-IN", { timeZone: tz(), hour: "numeric", minute: "2-digit", hour12: true }).format(d);
const longDate = (d = new Date()) => new Intl.DateTimeFormat("en-GB", { timeZone: tz(), weekday: "long", day: "numeric", month: "long" }).format(d);
const fmtHours = (h) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}m`;
const dayOffset = (key, n) => { const d = new Date(key + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------------------------------------------------------------- load / save / prune
function load() {
  if (mem) return mem;
  try { mem = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(file(), "utf8").replace(/^﻿/, "")) }; }
  catch {
    // If the file exists but can't be read, keep a backup before starting fresh — never lose memory silently.
    if (fs.existsSync(file())) { try { fs.copyFileSync(file(), file().replace(/\.json$/, `.unreadable-${Date.now()}.json`)); } catch {} }
    mem = structuredClone(EMPTY);
  }
  // migrate: ids on events and corrections
  for (const d of Object.values(mem.days)) for (const e of d.events || []) if (!e.id) e.id = uid();
  for (const c of mem.corrections) { if (!c.id) c.id = uid(); if (!c.day && c.at) c.day = today(new Date(c.at)); }
  prune();
  return mem;
}

function prune() {
  const m = mem;
  const cutoff = dayOffset(today(), -DETAIL_DAYS);
  for (const [k, d] of Object.entries(m.days)) {
    if (k < cutoff) { delete d.events; delete d.summary; }            // keep stats/sleep only
  }
  const keys = Object.keys(m.days).sort();
  for (const k of keys.slice(0, -400)) delete m.days[k];             // stats for ~13 months max
  m.corrections = m.corrections.filter((c) => (c.day || "") >= cutoff).slice(-300);
  // follow-ups: open ones older than 7 days quietly expire; keep 40 recent done ones
  const week = Date.now() - 7 * 864e5;
  for (const f of m.followups) if (!f.done && new Date(f.created) < week) { f.done = true; f.expired = true; f.doneAt = nowISO(); }
  m.followups = [...m.followups.filter((f) => f.done).slice(-40), ...m.followups.filter((f) => !f.done)];
  m.projects = m.projects.filter((p) => !(p.status === "dropped" || (p.status === "done" && Date.now() - new Date(p.updated) > 30 * 864e5)));
  m.facts = m.facts.slice(-60);
  m.reminders = (m.reminders || []).filter((r) => !r.done || Date.now() - new Date(r.firedAt || r.dueAt) < 2 * 864e5).slice(-50);
  // lexicon: cap to the 6000 most used words
  const lex = Object.entries(m.lexicon);
  if (lex.length > 6000) m.lexicon = Object.fromEntries(lex.sort((a, b) => b[1][0] - a[1][0]).slice(0, 6000));
}

function save() {
  // debounce disk writes (cheap on battery / SSD)
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
function flush() {
  clearTimeout(saveTimer);
  if (!mem) return;
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = file() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(mem));
  fs.renameSync(tmp, file());
}

function day(key = today()) {
  const m = load();
  if (!m.days[key]) m.days[key] = { summary: "", events: [], chats: 0, speakingSec: 0 };
  const d = m.days[key];
  if (!d.events) d.events = [];
  if (d.summary == null) d.summary = "";
  if (!d.stats) d.stats = { words: 0, sentences: 0, clean: 0, fillers: {}, corrections: 0, newWords: [], hours: {}, vocab: 0 };
  return d;
}

function addCorrection(c) {
  load().corrections.push({ id: uid(), ...c, at: nowISO(), day: today() });
  save();
}

// ---------------------------------------------------------------- analytics capture
const FILLERS = ["um", "uh", "umm", "uhh", "er", "hmm", "like", "you know", "i mean", "basically", "actually", "literally", "so yeah"];
const FILLER_RE = new RegExp(`\\b(${FILLERS.map((f) => f.replace(" ", "\\s+")).join("|")})\\b`, "gi");
const STOP = new Set("a an the and or but so to of in on at for with is am are was were be been it its i you he she we they me my your our their this that these those do did does have has had not no yes yeah ok okay just very really then there here what when where how why which who will would can could should".split(" "));

function recordChatStats(lines, corrections, startedAt) {
  const m = load();
  const d = day();
  const s = d.stats;
  const userLines = lines.filter((l) => l.role === "user");
  let words = 0, sentences = 0;
  for (const l of userLines) {
    const toks = l.text.toLowerCase().match(/[a-z']+/g) || [];
    words += toks.length;
    if (toks.length >= 3) sentences++;
    for (const f of l.text.toLowerCase().match(FILLER_RE) || []) {
      const k = f.replace(/\s+/g, " ");
      s.fillers[k] = (s.fillers[k] || 0) + 1;
    }
    for (const w of toks) {
      if (w.length < 3 || w === "kakashi") continue;
      if (!m.lexicon[w]) {
        m.lexicon[w] = [0, today()];
        if (!STOP.has(w) && s.newWords.length < 60 && Object.keys(m.lexicon).length > 150) s.newWords.push(w);
      }
      m.lexicon[w][0]++;
    }
  }
  s.words += words;
  s.sentences += sentences;
  s.corrections += corrections.length;
  s.clean += Math.max(0, sentences - corrections.length);
  const h = String(Math.floor(hour(new Date(startedAt))));
  s.hours[h] = (s.hours[h] || 0) + 1;
  s.vocab = Object.keys(m.lexicon).length;
  save();
}

// ---------------------------------------------------------------- sleep
function recordSleep() {
  const m = load();
  m.sleepPending = nowISO();
  day().events.push({ id: uid(), time: hhmm(), text: "Said good night and went to sleep" });
  save();
}

function checkWake() {
  const m = load();
  if (!m.sleepPending) return null;
  const slept = new Date(m.sleepPending);
  const h = (Date.now() - slept) / 3.6e6;
  if (h > 18) { m.sleepPending = null; save(); return null; }
  if (h < 2) return null;
  const info = { sleptAt: hhmm(slept), wokeAt: hhmm(), hours: Math.round(h * 10) / 10, at: nowISO() };
  day().sleep = info;
  day().events.push({ id: uid(), time: hhmm(), text: `Woke up after ${fmtHours(h)} of sleep (${info.sleptAt} → ${info.wokeAt})` });
  m.lastWake = info;
  m.sleepPending = null;
  save();
  return info;
}

// ---------------------------------------------------------------- context for the voice model (kept compact = fast)
function partOfDay(h) {
  if (h < 4.5) return "late night - they should be asleep";
  if (h < 6.5) return "early morning";
  if (h < 10) return "morning - breakfast time is ~7:30-10:00";
  if (h < 12.5) return "late morning";
  if (h < 14.75) return "lunch time (normal lunch: ~12:30-2:30 pm)";
  if (h < 17) return "afternoon - lunch time is over; evening tea/snack time is ~4:30-6:00 pm";
  if (h < 19.5) return "evening";
  if (h < 22) return "dinner time (normal dinner: ~8:00-10:00 pm)";
  if (h < 23.5) return "night - time to wind down";
  return "late night - they should be sleeping (7-8 hours of sleep is healthy)";
}

function ago(iso) {
  if (!iso) return "never";
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 2) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function sleepContext() {
  const m = load();
  if (m.sleepPending) {
    const min = Math.round((Date.now() - new Date(m.sleepPending)) / 60000);
    return `They told you at ${hhmm(new Date(m.sleepPending))} (${min} min ago) that they were going to sleep - but they're back! Tease them a little and tell them to go to sleep.`;
  }
  if (m.lastWake && Date.now() - new Date(m.lastWake.at) < 4 * 3.6e6) {
    return `They JUST WOKE UP: slept from ${m.lastWake.sleptAt} to ${m.lastWake.wokeAt} = ${fmtHours(m.lastWake.hours)}. When they greet you, tell them exactly how long they slept and react (7-8 h is great, under 6 h: gently scold + a tip), then motivate them for a productive day.`;
  }
  const lastNight = Object.values(m.days).map((d) => d.sleep).filter(Boolean).pop();
  return lastNight ? `Last recorded sleep: ${lastNight.sleptAt} → ${lastNight.wokeAt} (${fmtHours(lastNight.hours)}).` : "No sleep recorded yet.";
}

function contextForPrompt() {
  const m = load();
  const now = new Date();
  const t = day();
  const keys = Object.keys(m.days).sort().filter((k) => k !== today() && m.days[k].summary).slice(-3).reverse();
  const recentDays = keys.map((k) => `- ${k}: ${m.days[k].summary}`).join("\n");
  const projects = m.projects.filter((p) => p.status !== "done" && p.status !== "dropped").sort((a, b) => new Date(b.updated) - new Date(a.updated)).slice(0, 8);
  const recentlyDone = m.projects.filter((p) => p.status === "done" && Date.now() - new Date(p.updated) < 3 * 864e5);
  const followups = m.followups.filter((f) => !f.done).slice(-8);
  const todaysCorrections = m.corrections.filter((c) => c.day === today());

  return `CURRENT INDIAN TIME (IST): ${longDate(now)}, ${clock12(now)} (${hhmm(now)}) - ${partOfDay(hour(now))}.
Last conversation: ${ago(m.lastChatAt)}. Conversations today so far: ${t.chats}.

SLEEP:
${sleepContext()}

TODAY SO FAR (IST):
${t.summary ? t.summary + "\n" : ""}${t.events.slice(-14).map((e) => `- ${e.time} ${e.text}`).join("\n") || "- nothing yet (this may be the first chat of the day)"}

RECENT DAYS:
${recentDays || "- no history yet"}

THEIR PROJECTS / WORK (follow up on these!):
${projects.map((p) => `- ${p.name} [${p.status}] - ${p.notes || ""}${p.nextStep ? ` | next: ${p.nextStep}` : ""} | updated ${ago(p.updated)}`).join("\n") || "- none known yet - ask what they're working on"}
${recentlyDone.length ? "Recently finished: " + recentlyDone.map((p) => p.name).join(", ") : ""}

OPEN FOLLOW-UPS:
${followups.map((f) => `- ${f.text} (due: ${f.due}, noted ${ago(f.created)})`).join("\n") || "- none"}

WHAT YOU KNOW ABOUT THEM:
${m.facts.slice(-40).map((f) => `- ${f.text}`).join("\n") || "- not much yet - get to know them naturally"}

UPCOMING REMINDERS YOU SET FOR THEM:
${(m.reminders || []).filter((r) => !r.done).map((r) => `- ${clock12(new Date(r.dueAt))}: ${r.text}`).join("\n") || "- none"}

MISTAKES TO DRILL IN PRACTICE MODE (last 7 days):
${m.corrections.filter((c) => (c.day || "") >= dayOffset(today(), -7)).slice(-8).map((c) => `- they said "${c.said}" → correct: "${c.better}"${c.betterWord ? ` (better word: ${c.betterWord})` : ""}`).join("\n") || "- none yet"}

THEIR RECURRING ENGLISH MISTAKES (listen for these; praise when they get it right):
${m.patterns.map((p) => `- ${p}`).join("\n") || "- none recorded yet"}
${todaysCorrections.length ? `Already corrected today: ${todaysCorrections.slice(-5).map((c) => `"${c.said}" -> "${c.better}"`).join("; ")}` : ""}`;
}

function snapshotForUpdate() {
  const m = load();
  const t = day();
  return JSON.stringify({
    now_ist: `${today()} ${hhmm()}`,
    today_summary: t.summary,
    today_events: t.events.map(({ time, text }) => ({ time, text })),
    projects: m.projects.filter((p) => p.status !== "dropped").map(({ id, name, status, notes, nextStep }) => ({ id, name, status, notes, nextStep })),
    open_followups: m.followups.filter((f) => !f.done).map(({ id, text, due }) => ({ id, text, due })),
    facts: m.facts.map((f) => f.text),
    english_patterns: m.patterns,
  });
}

function applyUpdate(u, chatMeta = {}) {
  const m = load();
  const t = day(chatMeta.dayKey || today());
  const time = chatMeta.time || hhmm();
  for (const e of u.new_events || []) {
    if (!e || !e.text || !e.text.trim()) continue;
    t.events.push({ id: uid(), time: /^\d{1,2}:\d{2}$/.test(e.time || "") ? e.time.padStart(5, "0") : time, text: e.text.trim() });
  }
  t.events.sort((a, b) => a.time.localeCompare(b.time));
  if (u.today_summary) t.summary = u.today_summary;

  for (const p of u.project_updates || []) {
    const existing = m.projects.find((x) => (p.id && x.id === p.id) || x.name.toLowerCase() === (p.name || "").toLowerCase());
    if (existing) {
      Object.assign(existing, {
        name: p.name || existing.name, status: p.status || existing.status, notes: p.notes || existing.notes,
        nextStep: p.next_step ?? existing.nextStep, updated: nowISO(),
      });
    } else if (p.name) {
      m.projects.push({ id: uid(), name: p.name, status: p.status || "active", notes: p.notes || "", nextStep: p.next_step || "", created: nowISO(), updated: nowISO() });
    }
  }
  for (const f of u.new_followups || []) {
    if (f.text && !m.followups.some((x) => !x.done && x.text.toLowerCase() === f.text.toLowerCase())) {
      m.followups.push({ id: uid(), text: f.text, due: f.due || "later", created: nowISO(), done: false });
    }
  }
  for (const id of u.completed_followup_ids || []) {
    const f = m.followups.find((x) => x.id === id);
    if (f) { f.done = true; f.doneAt = nowISO(); }
  }
  for (const fact of u.new_facts || []) {
    if (fact && !m.facts.some((x) => x.text.toLowerCase() === fact.toLowerCase())) m.facts.push({ id: uid(), text: fact, added: nowISO() });
  }
  if (Array.isArray(u.english_patterns) && u.english_patterns.length) m.patterns = u.english_patterns.slice(0, 8);
  if (chatMeta.speakingSec) t.speakingSec += chatMeta.speakingSec;
  save();
}

function markChat() {
  const m = load();
  m.lastChatAt = nowISO();
  day().chats += 1;
  prune();
  save();
}

// ---------------------------------------------------------------- reminders
// at_time "HH:MM" (24h, local/IST) → next occurrence; or in_minutes from now.
function addReminder({ text, at_time, in_minutes }) {
  const m = load();
  let due;
  if (in_minutes != null && +in_minutes > 0) due = Date.now() + +in_minutes * 60000;
  else if (/^\d{1,2}:\d{2}$/.test(at_time || "")) {
    const [h, mi] = at_time.split(":").map(Number);
    const nowMin = Math.floor(hour() * 60);
    let diff = h * 60 + mi - nowMin;
    if (diff <= 0) diff += 1440;                   // already passed today → tomorrow
    due = Date.now() + diff * 60000 - (new Date().getSeconds() * 1000);
  } else throw new Error("Need at_time (HH:MM) or in_minutes");
  const r = { id: uid(), text: String(text || "Reminder").slice(0, 200), dueAt: new Date(due).toISOString(), created: nowISO(), done: false };
  (m.reminders ||= []).push(r);
  save();
  return { ...r, when: clock12(new Date(due)), today: today(new Date(due)) === today() };
}
function dueReminders() {
  const m = load();
  const due = (m.reminders || []).filter((r) => !r.done && new Date(r.dueAt) <= Date.now());
  for (const r of due) { r.done = true; r.firedAt = nowISO(); }
  if (due.length) save();
  return due;
}

// ---------------------------------------------------------------- forgetting
// Everything the user could ask to forget, each with an id the AI can point at.
function snapshotForForget() {
  const m = load();
  const items = [];
  for (const f of m.facts) items.push({ id: "fact:" + f.id, kind: "fact", text: f.text });
  for (const p of m.projects) items.push({ id: "project:" + p.id, kind: "project", text: `${p.name} - ${p.notes}` });
  for (const f of m.followups.filter((x) => !x.done)) items.push({ id: "followup:" + f.id, kind: "follow-up", text: f.text });
  for (const [k, d] of Object.entries(m.days)) {
    if (d.summary) items.push({ id: "summary:" + k, kind: `day summary ${k}`, text: d.summary });
    for (const e of d.events || []) items.push({ id: `event:${k}:${e.id}`, kind: `event ${k} ${e.time}`, text: e.text });
  }
  for (const c of m.corrections) items.push({ id: "correction:" + c.id, kind: "correction", text: c.said });
  for (const p of m.patterns) items.push({ id: "pattern:" + p, kind: "english pattern", text: p });
  return items;
}

function forgetIds(ids) {
  const m = load();
  let n = 0;
  for (const id of ids) {
    const [kind, a, b] = id.split(":");
    const before = n;
    if (kind === "fact") { const l = m.facts.length; m.facts = m.facts.filter((x) => x.id !== a); n += l - m.facts.length; }
    else if (kind === "project") { const l = m.projects.length; m.projects = m.projects.filter((x) => x.id !== a); n += l - m.projects.length; }
    else if (kind === "followup") { const l = m.followups.length; m.followups = m.followups.filter((x) => x.id !== a); n += l - m.followups.length; }
    else if (kind === "summary" && m.days[a]) { m.days[a].summary = ""; n++; }
    else if (kind === "event" && m.days[a]) { const d = m.days[a]; const l = d.events.length; d.events = d.events.filter((e) => e.id !== b); n += l - d.events.length; }
    else if (kind === "correction") { const l = m.corrections.length; m.corrections = m.corrections.filter((x) => x.id !== a); n += l - m.corrections.length; }
    else if (kind === "pattern") { const p = id.slice(8); const l = m.patterns.length; m.patterns = m.patterns.filter((x) => x !== p); n += l - m.patterns.length; }
    void before;
  }
  save();
  return n;
}

// ---------------------------------------------------------------- analytics (dashboard)
function analytics() {
  const m = load();
  const t = today();
  const range = (n) => Array.from({ length: n }, (_, i) => dayOffset(t, i - n + 1));
  const days30 = range(30);
  const get = (k) => m.days[k] || {};
  const st = (k) => get(k).stats || {};

  // streak: consecutive days with at least one chat (today counts if already talked)
  let streak = 0;
  for (let k = (get(t).chats ? t : dayOffset(t, -1)); get(k).chats; k = dayOffset(k, -1)) streak++;
  let best = 0, run = 0;
  for (const k of Object.keys(m.days).sort()) { run = get(k).chats ? (get(dayOffset(k, -1)).chats ? run + 1 : 1) : 0; best = Math.max(best, run); }

  const all = Object.values(m.days);
  const sum = (arr, f) => arr.reduce((n, x) => n + (f(x) || 0), 0);
  const totalWords = sum(all, (d) => d.stats?.words);
  const totalSec = sum(all, (d) => d.speakingSec);
  const totalSentences = sum(all, (d) => d.stats?.sentences);
  const totalClean = sum(all, (d) => d.stats?.clean);
  const last7 = range(7), prev7 = range(14).slice(0, 7);
  const acc = (ks) => { const s = sum(ks, (k) => st(k).sentences), c = sum(ks, (k) => st(k).clean); return s ? Math.round((c / s) * 100) : null; };
  const sleeps = range(14).map((k) => get(k).sleep?.hours).filter(Boolean);

  // when you talk: weekday x hour heatmap (last 30 days)
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const k of days30) {
    const wd = (new Date(k + "T12:00:00Z").getUTCDay() + 6) % 7; // Mon=0
    for (const [h, n] of Object.entries(st(k).hours || {})) heat[wd][+h] += n;
  }

  const fillers = {};
  for (const k of days30) for (const [w, n] of Object.entries(st(k).fillers || {})) fillers[w] = (fillers[w] || 0) + n;
  const mistakeTypes = {};
  for (const c of m.corrections) { const k = (c.type || "other").replace("_", " "); mistakeTypes[k] = (mistakeTypes[k] || 0) + 1; }
  const topWords = Object.entries(m.lexicon).filter(([w]) => !STOP.has(w) && w.length > 3).sort((a, b) => b[1][0] - a[1][0]).slice(0, 24).map(([w, [n]]) => ({ w, n }));
  const seen = new Set();
  const newWords = [...days30].reverse().flatMap((k) => (st(k).newWords || []).map((w) => ({ w, day: k })))
    .filter((x) => !seen.has(x.w) && seen.add(x.w)).slice(0, 40);
  const betterWords = m.corrections.filter((c) => c.betterWord).slice(-12).reverse().map((c) => ({ text: c.betterWord, day: c.day }));

  return {
    today: t,
    kpis: {
      streak, bestStreak: best,
      totalMinutes: Math.round(totalSec / 60),
      totalWords,
      vocab: Object.keys(m.lexicon).length,
      accuracy: totalSentences ? Math.round((totalClean / totalSentences) * 100) : null,
      accuracy7: acc(last7), accuracyPrev7: acc(prev7),
      wpm: totalSec > 60 ? Math.round(totalWords / (totalSec / 60)) : null,
      avgSleep: sleeps.length ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 10) / 10 : null,
      chats: sum(all, (d) => d.chats),
      corrections30: m.corrections.length,
    },
    series: days30.map((k) => ({
      day: k,
      minutes: Math.round(((get(k).speakingSec || 0) / 60) * 10) / 10,
      words: st(k).words || 0,
      chats: get(k).chats || 0,
      accuracy: st(k).sentences ? Math.round((st(k).clean / st(k).sentences) * 100) : null,
      sleep: get(k).sleep?.hours ?? null,
      vocab: st(k).vocab || null,
      corrections: st(k).corrections || 0,
    })),
    heat,
    fillers: Object.entries(fillers).sort((a, b) => b[1] - a[1]).slice(0, 8),
    mistakeTypes: Object.entries(mistakeTypes).sort((a, b) => b[1] - a[1]),
    topWords, newWords, betterWords,
    patterns: m.patterns,
    todayMinutes: Math.round(((get(t).speakingSec || 0) / 60) * 10) / 10,
  };
}

// ---------------------------------------------------------------- edits from the panel
function edit(op) {
  const m = load();
  const find = (arr) => arr.find((x) => x.id === op.id);
  switch (op.type) {
    case "project.status": { const p = find(m.projects); if (p) { p.status = op.status; p.updated = nowISO(); } break; }
    case "project.delete": m.projects = m.projects.filter((x) => x.id !== op.id); break;
    case "project.add": m.projects.push({ id: uid(), name: op.name, status: "active", notes: op.notes || "", nextStep: "", created: nowISO(), updated: nowISO() }); break;
    case "followup.done": { const f = find(m.followups); if (f) { f.done = true; f.doneAt = nowISO(); } break; }
    case "followup.delete": m.followups = m.followups.filter((x) => x.id !== op.id); break;
    case "fact.delete": m.facts = m.facts.filter((x) => x.id !== op.id); break;
    case "fact.add": if (op.text) m.facts.push({ id: uid(), text: op.text, added: nowISO() }); break;
    case "pattern.delete": m.patterns = m.patterns.filter((p) => p !== op.text); break;
    case "event.delete": { const d = m.days[op.day]; if (d) d.events = (d.events || []).filter((e) => e.id !== op.id); break; }
    case "summary.clear": { const d = m.days[op.day]; if (d) d.summary = ""; break; }
    case "correction.delete": m.corrections = m.corrections.filter((x) => x.id !== op.id); break;
    case "reminder.delete": m.reminders = (m.reminders || []).filter((x) => x.id !== op.id); break;
    case "reset": mem = structuredClone(EMPTY); break;
  }
  save();
  return load();
}

module.exports = {
  load, save, flush, day, today, hhmm, hour, clock12, longDate, contextForPrompt, snapshotForUpdate, applyUpdate,
  addCorrection, markChat, edit, ago, recordSleep, checkWake, recordChatStats, snapshotForForget, forgetIds, analytics,
  addReminder, dueReminders,
};
