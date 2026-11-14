// Settings: stored in %APPDATA%/Parley/settings.json. The API key is encrypted with
// Windows DPAPI (Electron safeStorage). Falls back to OPENAI_API_KEY in the project's .env.
const fs = require("fs");
const path = require("path");
const { app, safeStorage, nativeTheme } = require("electron");

const DEFAULTS = {
  name: "",
  nativeLanguage: "",
  // Models (newest that work well; all changeable in Settings)
  realtimeModel: "gpt-realtime-2.1",
  transcribeModel: "gpt-transcribe",
  correctionModel: "gpt-5.4-mini",
  memoryModel: "gpt-5.5",
  voice: "marin",
  voiceSpeed: 1.0,
  buddyName: "Aira",
  characterStyle: "nori",      // one of the 12 AgentKit characters (see src/renderer/agentkit-styles.js)
  characterColors: null,       // { body, accent, feature: "auto" | "#hex" } — null = the character's own colours
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",   // the computer's time zone (saved on first run)
  // Wake word: "auto" = Picovoice if configured, else OpenAI; "picovoice" | "openai" | "off"
  wakeWord: "auto",
  wakeSensitivity: 0.6,
  picovoicePpn: "",            // path to your "Hey Kakashi" .ppn file (copied into app data)
  coachStyle: "push",          // "gentle" | "push" | "tough"
  correctionLevel: "normal",   // "light" | "normal" | "strict"
  hotkey: "ctrl+alt+space",    // "ctrl+alt+space" | "ctrl+shift+space" | "ctrl+alt+k" (no keyboard/mouse hooks)
  replySpeed: "balanced",      // "quick" | "balanced" | "patient" (how long it waits when you pause)
  autoSleepSec: 75,            // end the conversation after this much silence
  dailyGoalMin: 10,            // speaking-minutes goal shown on the dashboard
  autoHideMin: 3,              // hide Kakashi after this many quiet minutes (0 = always visible)
  nudges: false,               // optional check-in bubbles (never start a conversation by themselves)
  settingsVersion: 4,
  nudgeEveryMin: 120,
  activeHours: [8, 23],
  startWithWindows: true,
  windowPos: null,
};

let cache = null;
const file = () => path.join(app.getPath("userData"), "settings.json");

function readEnv(name) {
  try {
    const env = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
    const m = env.match(new RegExp(`^${name}=(.*)$`, "m"));
    return (m && m[1].trim()) || "";
  } catch {
    return "";
  }
}
function readEnvKey() {
  const k = readEnv("OPENAI_API_KEY");
  return k && k !== "sk-..." ? k : "";
}

function load() {
  if (cache) return cache;
  let data = {};
  let unreadable = false;
  if (fs.existsSync(file())) {
    try {
      // strip a UTF-8 byte-order mark (added by some editors / PowerShell) before parsing
      data = JSON.parse(fs.readFileSync(file(), "utf8").replace(/^﻿/, ""));
    } catch {
      // Never overwrite a settings file we can't read: keep a backup and run on defaults.
      unreadable = true;
      try { fs.copyFileSync(file(), file().replace(/\.json$/, `.unreadable-${Date.now()}.json`)); } catch {}
    }
  }
  cache = { ...DEFAULTS, ...data };
  if (cache.buddyName === "Miko") cache.buddyName = "Kakashi"; // renamed in v2.1
  if (unreadable) { cache.settingsVersion = DEFAULTS.settingsVersion; }
  else if ((data.settingsVersion || 0) < 2) {
    // v2.2: Kakashi only speaks when called — check-in bubbles are now opt-in
    cache.nudges = false;
    cache.settingsVersion = 2;
    try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(cache, null, 2)); } catch {}
  }
  if (!unreadable && (cache.settingsVersion || 0) < 4 && !cache.characterColors) {
    // v2.6: character studio — keep the look the user already had (white / black Nori)
    const dark = cache.characterColor === "white" || (cache.characterColor !== "black" && nativeTheme.shouldUseDarkColors);
    cache.characterColors = dark ? { body: "#F5F5F7", accent: "#CFD0D6", feature: "auto" } : { body: "#0E0E10", accent: "#2E2E33", feature: "auto" };
    cache.characterStyle = cache.characterStyle || "nori";
  }
  if (!unreadable && (cache.settingsVersion || 0) < 3) {
    // v2.4: the bare Ctrl+Win tap needed a low-level hook (uiohook) that could freeze touchpads — removed
    if (cache.hotkey === "ctrl+win") cache.hotkey = "ctrl+alt+space";
    cache.settingsVersion = 3;
    try { fs.writeFileSync(file(), JSON.stringify(cache, null, 2)); } catch {}
  }
  if (!unreadable && (data.settingsVersion || 0) < 4) {
    cache.settingsVersion = 4;           // persist the v2.6 character migration
    try { fs.writeFileSync(file(), JSON.stringify(cache, null, 2)); } catch {}
  }
  // Models are part of the app, not a user setting: always use the built-in defaults.
  for (const k of ["realtimeModel", "transcribeModel", "correctionModel", "memoryModel"]) cache[k] = DEFAULTS[k];
  if (!cache.name) { const n = readEnv("LEARNER_NAME"); if (n && n !== "YourName") cache.name = n; }
  if (!cache.nativeLanguage) cache.nativeLanguage = readEnv("NATIVE_LANGUAGE");
  return cache;
}

function save(patch) {
  const s = { ...load(), ...patch };
  delete s.apiKey;
  cache = s;
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(s, null, 2));
  return s;
}

function getApiKey() {
  const s = load();
  if (s.encKey && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(s.encKey, "base64")); } catch {}
  }
  return readEnvKey();
}

function setApiKey(key) {
  key = (key || "").trim();
  if (!key) return save({ encKey: null });
  const enc = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(key).toString("base64")
    : null;
  return save({ encKey: enc });
}

// Picovoice AccessKey (for the offline "Hey Kakashi" wake word), also encrypted
function getPicovoiceKey() {
  const s = load();
  if (s.encPvKey && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(s.encPvKey, "base64")); } catch {}
  }
  return readEnv("PICOVOICE_ACCESS_KEY");
}
function setPicovoiceKey(key) {
  key = (key || "").trim();
  if (!key) return save({ encPvKey: null });
  return save({ encPvKey: safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key).toString("base64") : null });
}

// What the UI may see (never the keys themselves)
function publicSettings() {
  const { encKey, encPvKey, ...rest } = load();
  const key = getApiKey();
  const pv = getPicovoiceKey();
  return { ...rest, hasKey: !!key, keyHint: key ? key.slice(0, 7) + "…" + key.slice(-4) : "", hasPvKey: !!pv };
}

module.exports = { load, save, getApiKey, setApiKey, getPicovoiceKey, setPicovoiceKey, publicSettings, DEFAULTS };
