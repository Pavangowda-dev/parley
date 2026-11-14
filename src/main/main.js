const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, session, nativeImage, shell, dialog, powerMonitor } = require("electron");
const settings = require("./settings");
const memory = require("./memory");
const ai = require("./ai");
const hotkey = require("./hotkey");
const wake = require("./wake");

const ASSETS = path.join(__dirname, "..", "..", "assets");
const RENDERER = path.join(__dirname, "..", "renderer");
const PRELOAD = path.join(__dirname, "..", "preload.js");
const MASCOT_W = 340, MASCOT_H = 300;

// Kakashi may need to speak without a click first (wake word / hotkey)
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let mascotWin = null, panelWin = null, tray = null;
let talking = false;
let chat = null;
let lastNudgeAt = Date.now();
let wakeMode = "off";       // what's actually running: "picovoice" | "openai" | "off"
let lastActive = Date.now(); // for auto-hide
let hiding = false;
let shown = false;          // our own visibility state (isVisible() is unreliable for transparent windows)

// Only one Kakashi. A second launch (desktop icon, startup) exits immediately and just shows the first one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.exit(0);
const AUTOSTART = process.argv.includes("--autostart");
// Opening the app again (desktop icon / startup) just shows Kakashi — never starts a conversation.
app.on("second-instance", () => { log("second launch → showing Kakashi"); showMascot("second launch"); });
app.setAppUserModelId("com.parley.app");

// ------------------------------------------------------------------------- one-time move from the old name
// Earlier versions were called "Talk to Me" and kept data in %APPDATA%\Talk to Me. Copy it over once.
(function migrateFromOldName() {
  try {
    const oldDir = path.join(app.getPath("appData"), "Talk to Me");
    const newDir = app.getPath("userData");
    if (oldDir === newDir || !fs.existsSync(oldDir) || fs.existsSync(path.join(newDir, "memory.json"))) return;
    fs.mkdirSync(newDir, { recursive: true });
    // "Local State" holds the key Windows uses to decrypt the saved API key
    for (const f of ["memory.json", "settings.json", "wake-log.txt", "Local State", "hey-kakashi.ppn"]) {
      const src = path.join(oldDir, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(newDir, f));
    }
    if (fs.existsSync(path.join(oldDir, "kakashi.log"))) fs.copyFileSync(path.join(oldDir, "kakashi.log"), path.join(newDir, "parley.log"));
    const sf = path.join(newDir, "settings.json");
    if (fs.existsSync(sf)) {
      const j = JSON.parse(fs.readFileSync(sf, "utf8").replace(/^\uFEFF/, ""));
      if (j.picovoicePpn && j.picovoicePpn.startsWith(oldDir)) j.picovoicePpn = path.join(newDir, path.basename(j.picovoicePpn));
      j.oldAutostartCleanup = false;
      fs.writeFileSync(sf, JSON.stringify(j, null, 2));
    }
  } catch (e) { console.error("Data migration failed:", e); }
})();

// ------------------------------------------------------------------------- windows
function defaultPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - MASCOT_W, y: wa.y + wa.height - MASCOT_H };
}
// The character occupies the bottom-right corner of the (mostly transparent) window:
// canvas 108×126 px at right 12 / bottom 4 (see mascot.css + AgentKit size 72).
const CHAR_BOX = { left: MASCOT_W - 12 - 108, right: MASCOT_W - 12, top: MASCOT_H - 4 - 126, bottom: MASCOT_H - 4 };
// Keep the character fully inside the usable area of a screen (never under the taskbar or off-screen).
function clampPos(x, y, display) {
  const d = display || screen.getDisplayNearestPoint({ x: Math.round(x + (CHAR_BOX.left + CHAR_BOX.right) / 2), y: Math.round(y + (CHAR_BOX.top + CHAR_BOX.bottom) / 2) });
  const a = d.workArea;
  return {
    x: Math.round(Math.min(Math.max(x, a.x - CHAR_BOX.left), a.x + a.width - CHAR_BOX.right)),
    y: Math.round(Math.min(Math.max(y, a.y - CHAR_BOX.top), a.y + a.height - CHAR_BOX.bottom)),
  };
}

function validPos(p) {
  if (!p) return false;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    const cx = p.x + MASCOT_W - 70, cy = p.y + MASCOT_H - 60; // where the character sits
    return cx > a.x && cx < a.x + a.width && cy > a.y && cy < a.y + a.height;
  });
}

// ------------------------------------------------------------------------- self-healing window
let mascotReady = false, readyTimer = null, rebuilds = 0, lastAlive = Date.now();
function rebuildMascot(reason) {
  if (rebuilds > 20) { log(`window: too many rebuilds, giving up (${reason})`); return; }
  rebuilds++;
  log(`window: rebuilding (${reason})`);
  const old = mascotWin;
  mascotWin = null; shown = false; talking = false; mascotReady = false;
  try { old && !old.isDestroyed() && old.destroy(); } catch {}
  setTimeout(createMascot, Math.min(30000, 1500 * rebuilds));
}

function createMascot() {
  const s = settings.load();
  mascotReady = false;
  const pos = validPos(s.windowPos) ? clampPos(s.windowPos.x, s.windowPos.y) : defaultPos();
  mascotWin = new BrowserWindow({
    ...pos, width: MASCOT_W, height: MASCOT_H,
    transparent: true, frame: false, resizable: false, maximizable: false, minimizable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, focusable: true, show: false,
    backgroundColor: "#00000000",
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  mascotWin.setAlwaysOnTop(true, "screen-saver");
  mascotWin.setVisibleOnAllWorkspaces(true);
  mascotWin.setIgnoreMouseEvents(true, { forward: true });
  mascotWin.loadFile(path.join(RENDERER, "mascot.html"));
  const me = mascotWin;
  me.once("ready-to-show", () => {
    if (mascotWin !== me) return;
    clearTimeout(readyTimer);
    mascotReady = true; lastAlive = Date.now();
    me.showInactive(); shown = true; lastActive = Date.now();
    log("window ready");
    if (!settings.getApiKey()) {
      setTimeout(() => send("bubble", { kind: "info", text: `Hi, I'm ${BN()}! I need an OpenAI API key to talk. Right-click me → Settings and paste it (one time only).` }), 2000);
    } else if (!settings.load().welcomed) {
      setTimeout(() => send("bubble", { kind: "info", text: `Hi, I'm ${BN()}! Say “Hey ${BN()}” or press ${hotkeyLabel()} whenever you want to talk.` }), 2000);
      settings.save({ welcomed: true });
    }
  });
  me.webContents.on("did-finish-load", () => applyWake());
  // If the window's process dies or hangs, rebuild it instead of silently running without a face/ears
  me.webContents.on("render-process-gone", (_e, d) => { if (mascotWin === me) rebuildMascot(`renderer gone: ${d.reason} (${d.exitCode})`); });
  me.webContents.on("unresponsive", () => { if (mascotWin === me) rebuildMascot("renderer unresponsive"); });
  me.webContents.on("did-fail-load", (_e, code, desc) => { if (mascotWin === me) rebuildMascot(`load failed: ${desc} (${code})`); });
  clearTimeout(readyTimer);
  readyTimer = setTimeout(() => { if (mascotWin === me && !mascotReady) rebuildMascot("not ready after 20s"); }, 20000);
  me.on("closed", () => { if (mascotWin === me) mascotWin = null; });
  startCursorFeed();
}

function openPanel(tab = "dashboard") {
  if (panelWin) {
    panelWin.show(); panelWin.focus();
    panelWin.webContents.send("panel:tab", tab);
    return;
  }
  panelWin = new BrowserWindow({
    width: 1180, height: 780, minWidth: 820, minHeight: 560, show: false,
    title: BN(), icon: path.join(ASSETS, "icon.png"), autoHideMenuBar: true,
    backgroundColor: "#0a0a0b",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#0a0a0b", symbolColor: "#a1a1aa", height: 40 },
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  panelWin.loadFile(path.join(RENDERER, "panel.html"), { query: { tab } });
  panelWin.once("ready-to-show", () => panelWin.show());
  panelWin.on("closed", () => (panelWin = null));
  panelWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

const send = (ch, data) => mascotWin && !mascotWin.isDestroyed() && mascotWin.webContents.send(ch, data);
const notifyPanel = () => panelWin && !panelWin.isDestroyed() && panelWin.webContents.send("memory:changed");

// Eyes follow the mouse anywhere on screen (only while visible; nothing runs when hidden)
let cursorTimer = null, lastCursor = "";
function startCursorFeed() {
  clearInterval(cursorTimer);
  cursorTimer = setInterval(() => {
    if (!mascotWin || mascotWin.isDestroyed() || !shown) return;
    const c = screen.getCursorScreenPoint();
    const b = mascotWin.getBounds();
    const k = `${c.x},${c.y},${b.x},${b.y}`;
    if (k === lastCursor) return;
    lastCursor = k;
    send("cursor", { x: c.x - b.x, y: c.y - b.y });
  }, 80);
}

// ------------------------------------------------------------------------- event log (%APPDATA%/Parley/parley.log)
function log(msg) {
  try {
    const f = path.join(app.getPath("userData"), "parley.log");
    if (fs.existsSync(f) && fs.statSync(f).size > 300000) fs.writeFileSync(f, "");
    fs.appendFileSync(f, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

// ------------------------------------------------------------------------- show / auto-hide
function showMascot(reason = "show") {
  log(`show (${reason})`);
  lastActive = Date.now();
  if (!mascotWin) return;
  hiding = false;
  if (!shown) {
    mascotWin.showInactive();
    shown = true;
    send("visibility", { visible: true });
  }
  refreshTrayMenu();
}
function hideMascot() {
  if (!mascotWin || !shown || hiding) return;
  hiding = true;
  send("visibility", { visible: false });          // fade out + stop rendering
  setTimeout(() => {
    if (hiding && mascotWin && !talking) { mascotWin.hide(); shown = false; }
    hiding = false;
    refreshTrayMenu();
  }, 450);
}
function autoHideTick() {
  const s = settings.load();
  const ms = process.env.TTM_AUTOHIDE_SEC ? +process.env.TTM_AUTOHIDE_SEC * 1000 : (s.autoHideMin ?? 3) * 60000;
  if (!ms || talking || !shown || !mascotWin) return;
  if (Date.now() - lastActive > ms) { log(`auto-hide after ${Math.round((Date.now() - lastActive) / 1000)}s quiet`); hideMascot(); }
}

// ------------------------------------------------------------------------- tray
function buildTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, "tray.png")));
  tray.setToolTip(`${BN()} — press ${hotkeyLabel()} or say “Hey ${BN()}”`);
  tray.on("click", () => (shown ? openPanel("dashboard") : showMascot("tray")));
  refreshTrayMenu();
}
function contextMenuTemplate() {
  return [
    { label: talking ? "Stop talking" : `Start talking  (${hotkeyLabel()} / “Hey ${BN()}”)`, click: () => toggleTalk() },
    { type: "separator" },
    {
      label: `Listen for “Hey ${BN()}”`, type: "checkbox", checked: settings.load().wakeWord !== "off",
      click: async (item) => { settings.save({ wakeWord: item.checked ? "auto" : "off" }); await applyWake(); refreshTrayMenu(); send("settings:changed", uiInfo()); },
    },
    {
      label: "Check-in reminders (bubbles)", type: "checkbox", checked: !!settings.load().nudges,
      click: (item) => { settings.save({ nudges: item.checked }); refreshTrayMenu(); },
    },
    { type: "separator" },
    { label: "Dashboard", click: () => openPanel("dashboard") },
    { label: "Today & corrections", click: () => openPanel("today") },
    { label: "Projects & follow-ups", click: () => openPanel("projects") },
    { label: `What ${BN()} remembers`, click: () => openPanel("memory") },
    { label: "Settings", click: () => openPanel("settings") },
    { type: "separator" },
    { label: shown ? `Hide ${BN()}` : `Show ${BN()}`, click: () => (shown ? hideMascot() : showMascot("tray")) },
    { label: "Reset position", click: () => { const p = defaultPos(); mascotWin?.setPosition(p.x, p.y); settings.save({ windowPos: null }); } },
    { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
  ];
}
function refreshTrayMenu() { tray?.setContextMenu(Menu.buildFromTemplate(contextMenuTemplate())); }

// ------------------------------------------------------------------------- talking
function toggleTalk(opts = {}) {
  if (!mascotWin || mascotWin.isDestroyed() || mascotWin.webContents.isCrashed()) {
    log("toggle requested but window is missing → rebuilding");
    rebuildMascot("toggle with no window");
    return;
  }
  log(`toggle (${opts.byVoice ? "wake word" : opts.source || "hotkey/click"})`);
  const wasHidden = !shown;
  showMascot("toggle");
  // If the buddy was hidden, give the pop-in animation a moment before connecting
  setTimeout(() => send("toggle", opts), wasHidden ? 120 : 0);
}

function applyHotkey() {
  const ok = hotkey.register(settings.load().hotkey, () => toggleTalk(), log);
  if (!ok) send("bubble", { kind: "info", text: "Couldn't register the hotkey. Use Ctrl+Alt+Space or click me." });
}

function applyStartup() {
  const s = settings.load();
  if (!s.oldAutostartCleanup) {
    // the old "Talk to Me" autostart entry would launch a second copy at login — remove it once
    try { app.setLoginItemSettings({ openAtLogin: false, name: "com.talktome.buddy", path: process.execPath, args: app.isPackaged ? ["--autostart"] : [path.resolve(app.getAppPath()), "--autostart"] }); } catch {}
    settings.save({ oldAutostartCleanup: true });
  }
  app.setLoginItemSettings({
    openAtLogin: !!s.startWithWindows,
    path: process.execPath,
    args: app.isPackaged ? ["--autostart"] : [path.resolve(app.getAppPath()), "--autostart"],
  });
}

// Wake word: Picovoice (offline) if set up, otherwise OpenAI cloud check in the mascot window
async function applyWake() {
  const s = settings.load();
  await wake.stop();
  const pvKey = settings.getPicovoiceKey();
  const pvReady = pvKey && s.picovoicePpn && fs.existsSync(s.picovoicePpn);
  wakeMode = "off";
  if (s.wakeWord === "off") {
    // nothing
  } else if ((s.wakeWord === "picovoice" || s.wakeWord === "auto") && pvReady) {
    const ok = await wake.start({
      accessKey: pvKey, ppnPath: s.picovoicePpn, sensitivity: s.wakeSensitivity,
      onWake: () => { logWake("picovoice", "(offline detection)", true); if (!talking && Date.now() > wakeCooldownUntil) { wakeCooldownUntil = Date.now() + 8000; toggleTalk({ byVoice: true }); } },
      onError: (e) => { console.error("Porcupine:", e.message); send("bubble", { kind: "info", text: `Wake word error: ${e.message.slice(0, 140)}` }); },
    });
    wakeMode = ok ? "picovoice" : (s.wakeWord === "auto" ? "openai" : "off");
  } else if (s.wakeWord === "openai" || s.wakeWord === "auto") {
    wakeMode = "openai";
  }
  send("wake:mode", { mode: wakeMode });
  return wakeMode;
}

async function processPending() {
  const m = memory.load();
  while (m.pending.length) {
    const p = m.pending[0];
    try {
      const u = await ai.updateMemory(p.lines, p.corrections, p.forgotten || []);
      memory.applyUpdate(u, { speakingSec: p.speakingSec, dayKey: p.dayKey, time: p.time });
      m.pending.shift();
      memory.save();
    } catch (e) {
      console.error("Memory update failed, will retry later:", e.message);
      return;
    }
  }
  notifyPanel();
}

// ------------------------------------------------------------------------- nudges
function nudgeText() {
  const m = memory.load();
  const h = memory.hour();
  const d = m.days[memory.today()];
  const chattedToday = d && d.chats > 0;
  const ate = (word) => d && d.events.some((e) => new RegExp(word, "i").test(e.text));
  const open = m.followups.filter((f) => !f.done);
  const projects = m.projects.filter((p) => p.status === "active" || p.status === "blocked");
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  if (!chattedToday && h < 12) return `Good morning! ☀️ Say “Hey ${BN()}” and tell me your plan for today.`;
  if (h >= 13.5 && h < 16 && !ate("lunch")) return "It's past lunch time… did you eat? 🍛";
  if (h >= 12.5 && h < 15 && Math.random() < 0.6) return pick(["Lunch time! 🍛 What are you eating?", "Did you eat lunch yet? Tell me what you had!"]);
  if (h >= 20 && h < 22 && Math.random() < 0.5) return pick(["What's for dinner tonight? 🍽️", "How was your day? Come tell me!"]);
  if (h >= 23.5 || h < 4) return "It's late! 🌙 Wrap up and sleep. Tell me good night first.";
  if (open.length && Math.random() < 0.6) return `Hey… did you do this yet? “${pick(open).text}” 👀`;
  if (projects.length) return `How's “${pick(projects).name}” going? Any progress? 💪`;
  return pick(["Take a 2-minute break and talk to me!", "What are you working on right now?", "Bored here 😄 Tell me what you're up to!"]);
}

function nudgeTick() {
  const s = settings.load();
  if (!s.nudges || talking || !mascotWin) return;
  const h = memory.hour();
  const [from, to] = s.activeHours || [8, 23];
  if (memory.load().sleepPending) return;           // they said good night — don't disturb
  if (h < from || h >= to + 1) return;
  const last = Math.max(lastNudgeAt, memory.load().lastChatAt ? new Date(memory.load().lastChatAt).getTime() : 0);
  if (Date.now() - last < s.nudgeEveryMin * 60000) return;
  lastNudgeAt = Date.now();
  showMascot();
  send("nudge", { text: nudgeText() });
}

// ------------------------------------------------------------------------- IPC
const BN = () => settings.load().buddyName || "Aira";
function hotkeyLabel() {
  return hotkey.label(settings.load().hotkey);
}
function uiInfo() {
  const s = settings.load();
  return { hotkey: hotkeyLabel(), buddyName: s.buddyName, hasKey: !!settings.getApiKey(), character: { style: s.characterStyle || "nori", colors: s.characterColors }, wakeMode };
}

ipcMain.handle("app:info", () => uiInfo());

ipcMain.handle("rt:token", async (_e, { byVoice } = {}) => {
  memory.checkWake(); // "you slept 6 hours" - must run before the instructions are built
  const t = await ai.realtimeToken();
  return {
    ...t,
    instructions: ai.instructions(),
    greeting: ai.greetingInstruction(byVoice),
    autoSleepSec: settings.load().autoSleepSec,
  };
});
ipcMain.handle("rt:goodbye-instructions", (_e, reason) => ai.GOODBYE_ONLY(reason));

ipcMain.on("chat:started", () => {
  log("chat started");
  talking = true;
  wake.setPaused(true);
  chat = { startedAt: Date.now(), lines: [], corrections: [], forgotten: [] };
  lastActive = Date.now();
  refreshTrayMenu();
});

// "Forget that" — Kakashi's forget_memory tool
ipcMain.handle("chat:forget", async (_e, what) => {
  try {
    const plan = await ai.planForget(what);
    const n = memory.forgetIds(plan.ids);
    chat?.forgotten.push(what); // the end-of-chat memory update is told not to re-learn it
    notifyPanel();
    return { ok: true, removed: n, summary: n ? plan.summary : "Nothing matching was stored." };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

let lastActivityLog = 0;
ipcMain.on("win:activity", () => {
  lastActive = Date.now();
  if (Date.now() - lastActivityLog > 60000) { lastActivityLog = Date.now(); log("activity (mouse over Kakashi)"); }
});
ipcMain.handle("analytics:get", () => memory.analytics());

ipcMain.on("chat:line", async (_e, { role, text }) => {
  if (!chat || !text || !text.trim()) return;
  chat.lines.push({ role, text: text.trim(), time: memory.hhmm() });
  if (role !== "user") return;
  if (text.trim().split(/\s+/).length < 3) return;
  const lastBuddy = [...chat.lines].reverse().find((l) => l.role === "assistant");
  try {
    const r = await ai.checkSentence(text, lastBuddy?.text || "");
    if (r.needs_fix && r.corrected) {
      const c = { said: text.trim(), better: r.corrected, why: r.explanation, type: r.type, betterWord: r.better_word };
      chat?.corrections.push(c);
      memory.addCorrection(c);
      send("bubble", { kind: "correction", ...c });
      notifyPanel();
    } else if (r.better_word) {
      send("bubble", { kind: "word", text: r.better_word });
    }
  } catch (e) {
    console.error("Correction check failed:", e.message);
  }
});

ipcMain.on("chat:goodbye", (_e, { reason }) => {
  if (reason === "sleeping") memory.recordSleep();
  notifyPanel();
});

ipcMain.on("chat:ended", async (_e, { speakingSec = 0 } = {}) => {
  log(`chat ended (${speakingSec}s spoken)`);
  talking = false;
  lastActive = Date.now();
  setTimeout(() => wake.setPaused(false), 1500);
  refreshTrayMenu();
  const c = chat;
  chat = null;
  if (!c || !c.lines.some((l) => l.role === "user")) return;
  memory.markChat();
  memory.recordChatStats(c.lines, c.corrections, c.startedAt);
  memory.load().pending.push({ lines: c.lines, corrections: c.corrections, forgotten: c.forgotten, speakingSec, dayKey: memory.today(), time: memory.hhmm(new Date(c.startedAt)) });
  memory.save();
  processPending();
});

ipcMain.on("chat:error", () => { log("chat error"); talking = false; wake.setPaused(false); refreshTrayMenu(); });

// Cloud wake word: short speech clips from the mascot window
let wakeBusy = false, wakeCount = { day: "", n: 0 };
let wakeBusySince = 0, wakeCooldownUntil = 0, capLogged = "";
ipcMain.handle("wake:clip", (_e, wav) => handleWakeClip(wav));
async function handleWakeClip(wav) {
  if (talking || Date.now() < wakeCooldownUntil) return { matched: false };
  // never stay "busy" forever (e.g. a request interrupted by laptop sleep)
  if (wakeBusy && Date.now() - wakeBusySince < 10000) return { matched: false };
  const d = memory.today();
  if (wakeCount.day !== d) wakeCount = { day: d, n: 0 };
  if (++wakeCount.n > 4000) {                       // generous cost guard (~$0.30/day worst case)
    if (capLogged !== d) { capLogged = d; log("wake word: daily clip limit reached"); }
    return { matched: false };
  }
  wakeBusy = true; wakeBusySince = Date.now();
  try {
    const r = await ai.transcribeWake(Buffer.from(wav), settings.load().buddyName);
    if (r.text) logWake("openai", r.text, r.matched);
    if (r.matched && !talking) {
      wakeCooldownUntil = Date.now() + 8000;
      toggleTalk({ byVoice: true });               // main shows the window first, then starts the chat
    }
    return r;
  }
  catch (e) { log(`wake check failed: ${e.name === "TimeoutError" ? "timeout" : e.message}`); return { matched: false }; }
  finally { wakeBusy = false; }
}

// %APPDATA%/Parley/wake-log.txt — what the wake word heard (helps tune false wakes)
function logWake(engine, text, matched) {
  try {
    const f = path.join(app.getPath("userData"), "wake-log.txt");
    if (fs.existsSync(f) && fs.statSync(f).size > 200000) fs.writeFileSync(f, "");
    fs.appendFileSync(f, `${memory.today()} ${memory.hhmm()} [${engine}] ${matched ? "WAKE  " : "ignore"} "${text}"\n`);
  } catch {}
}

// Mascot window: click-through except over the character / bubble
ipcMain.on("win:interactive", (_e, on) => { mascotWin?.setIgnoreMouseEvents(!on, { forward: true }); });

let dragTimer = null;
ipcMain.on("win:drag-start", () => {
  if (!mascotWin) return;
  const start = screen.getCursorScreenPoint();
  const [wx, wy] = mascotWin.getPosition();
  clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    const c = screen.getCursorScreenPoint();
    const p = clampPos(wx + c.x - start.x, wy + c.y - start.y, screen.getDisplayNearestPoint(c));
    mascotWin?.setPosition(p.x, p.y);
  }, 10);
});
ipcMain.on("win:drag-end", () => {
  clearInterval(dragTimer);
  if (mascotWin) { const [x, y] = mascotWin.getPosition(); settings.save({ windowPos: { x, y } }); }
});

ipcMain.on("menu:open", () => Menu.buildFromTemplate(contextMenuTemplate()).popup({ window: mascotWin }));
ipcMain.on("panel:open", (_e, tab) => openPanel(tab));

ipcMain.handle("settings:get", () => ({ ...settings.publicSettings(), wakeRunning: wakeMode }));
ipcMain.handle("settings:save", async (_e, patch) => {
  const before = settings.load();
  settings.save(patch);
  if (patch.hotkey && patch.hotkey !== before.hotkey) applyHotkey();
  if ("startWithWindows" in patch) applyStartup();
  if ("wakeWord" in patch || "wakeSensitivity" in patch) await applyWake();
  if ("buddyName" in patch) { log(`buddy renamed to ${BN()}`); refreshTrayMenu(); tray?.setToolTip(`${BN()} — press ${hotkeyLabel()} or say “Hey ${BN()}”`); panelWin?.setTitle(BN()); }
  send("settings:changed", uiInfo());
  return { ...settings.publicSettings(), wakeRunning: wakeMode };
});
ipcMain.handle("settings:setKey", (_e, k) => { settings.setApiKey(k); send("settings:changed", uiInfo()); return settings.publicSettings(); });
ipcMain.handle("settings:setPvKey", async (_e, k) => { settings.setPicovoiceKey(k); await applyWake(); return { ...settings.publicSettings(), wakeRunning: wakeMode }; });
ipcMain.handle("settings:pickPpn", async () => {
  const r = await dialog.showOpenDialog(panelWin, { title: "Choose your Hey-Kakashi .ppn file", filters: [{ name: "Porcupine keyword", extensions: ["ppn"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return { ...settings.publicSettings(), wakeRunning: wakeMode };
  const dest = path.join(app.getPath("userData"), "hey-kakashi.ppn");
  fs.copyFileSync(r.filePaths[0], dest);
  settings.save({ picovoicePpn: dest });
  await applyWake();
  return { ...settings.publicSettings(), wakeRunning: wakeMode };
});
ipcMain.handle("settings:testKey", async () => {
  try { await ai.realtimeToken(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("settings:prompt", () => ai.instructions());

ipcMain.handle("memory:get", () => ({ ...memory.load(), todayKey: memory.today() }));
ipcMain.handle("memory:edit", (_e, op) => memory.edit(op));
ipcMain.on("mascot:alive", () => { lastAlive = Date.now(); });

// Reminders ("remind me to call mom at 5")
ipcMain.handle("reminder:set", (_e, args = {}) => {
  try {
    const r = memory.addReminder(args);
    log(`reminder set for ${r.when}: ${r.text}`);
    notifyPanel();
    return { ok: true, text: r.text, when: r.when, today: r.today };
  } catch (e) { return { ok: false, error: e.message }; }
});
function reminderTick() {
  for (const r of memory.dueReminders()) {
    log(`reminder fired: ${r.text}`);
    showMascot("reminder");
    setTimeout(() => send("bubble", { kind: "reminder", text: r.text }), 500);
    notifyPanel();
  }
}

// Export everything (memory + settings, never API keys) as one JSON file
ipcMain.handle("data:export", async () => {
  const { encKey, encPvKey, ...safeSettings } = settings.load();
  const r = await dialog.showSaveDialog(panelWin, {
    title: "Export your data",
    defaultPath: `parley-export-${memory.today()}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), settings: safeSettings, memory: memory.load() }, null, 2));
  return { ok: true, path: r.filePath };
});
ipcMain.on("mascot:log", (_e, msg) => log(`window: ${String(msg).slice(0, 200)}`));

// ------------------------------------------------------------------------- app
if (gotLock) app.whenReady().then(() => {
  log(`app start (v${app.getVersion()})${AUTOSTART ? " at Windows login" : ""}`);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "media"));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "media");

  // At Windows login the display/audio stack is still starting — wait a little before building the window
  setTimeout(createMascot, AUTOSTART ? 8000 : 0);
  buildTray();
  applyHotkey();
  applyStartup();
  setInterval(nudgeTick, 60000);
  setInterval(autoHideTick, 10000);
  setInterval(reminderTick, 20000);
  if (process.env.TTM_SELFTEST_WAKE_WAV) {   // developer self-test: feed a recorded "Hey <name>" clip through the real wake path
    setTimeout(() => { log("self-test: feeding wake clip"); handleWakeClip(fs.readFileSync(process.env.TTM_SELFTEST_WAKE_WAV)); }, +(process.env.TTM_SELFTEST_AFTER_SEC || 40) * 1000);
  }
  setTimeout(reminderTick, 15000);   // catch reminders that came due while the laptop was off
  setTimeout(processPending, 5000);

  if (!settings.getApiKey()) openPanel("settings");
  // Watchdog: the window says "alive" every 20 s; if it goes silent for 75 s, rebuild it.
  setInterval(() => {
    if (mascotWin && mascotReady && Date.now() - lastAlive > 75000) rebuildMascot("no heartbeat for 75s");
  }, 15000);
  // After sleep / unlock the microphone stream is often dead — tell the window to restart its listener
  let powerTimer = null;
  for (const ev of ["resume", "unlock-screen"]) powerMonitor.on(ev, () => {
    clearTimeout(powerTimer);
    powerTimer = setTimeout(() => { log(`system ${ev} → restarting wake listener`); wakeBusy = false; send("wake:restart"); }, 3000);
  });

  const keepOnScreen = () => {
    if (!mascotWin) return;
    const [x, y] = mascotWin.getPosition();
    const p = validPos({ x, y }) ? clampPos(x, y) : defaultPos();
    mascotWin.setPosition(p.x, p.y);
  };
  screen.on("display-removed", keepOnScreen);
  screen.on("display-metrics-changed", keepOnScreen);   // resolution / scaling / taskbar changes
});

app.on("window-all-closed", (e) => e.preventDefault());
app.on("will-quit", () => { hotkey.stop(); wake.stop(); memory.flush(); });
