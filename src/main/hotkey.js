// Global hotkey via Electron's globalShortcut (the standard Windows RegisterHotKey API).
// No low-level keyboard or mouse hooks are installed, so the hotkey can never interfere with
// your touchpad or mouse, and nothing extra needs to run or be allowed by Windows.
// (Earlier versions used the uiohook library for a bare "Ctrl+Win" tap; it also hooked the mouse
//  and could freeze laptop touchpads, so it was removed.)
const { globalShortcut } = require("electron");

const ACCELERATORS = {
  "ctrl+alt+space": "Control+Alt+Space",
  "ctrl+shift+space": "Control+Shift+Space",
  "ctrl+alt+k": "Control+Alt+K",
};
const DEFAULT = "ctrl+alt+space";
let logFn = () => {};

// Old settings may still say "ctrl+win" — map it to the default.
const normalize = (mode) => (ACCELERATORS[mode] ? mode : DEFAULT);

function register(mode, callback, log) {
  if (log) logFn = log;
  mode = normalize(mode);
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(ACCELERATORS[mode], () => callback());
  if (!ok) logFn(`hotkey ${ACCELERATORS[mode]} is taken by another app`);
  // Always keep Ctrl+Alt+Space as a backup if a different one was chosen
  if (mode !== DEFAULT) globalShortcut.register(ACCELERATORS[DEFAULT], () => callback());
  return ok;
}

function label(mode) {
  return { "ctrl+alt+space": "Ctrl+Alt+Space", "ctrl+shift+space": "Ctrl+Shift+Space", "ctrl+alt+k": "Ctrl+Alt+K" }[normalize(mode)];
}

function stop() { globalShortcut.unregisterAll(); }

module.exports = { register, stop, label, normalize };
