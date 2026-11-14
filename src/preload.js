const { contextBridge, ipcRenderer } = require("electron");

const on = (ch) => (cb) => {
  const fn = (_e, data) => cb(data);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld("ttm", {
  platform: process.platform,
  // character window
  info: () => ipcRenderer.invoke("app:info"),
  token: (opts) => ipcRenderer.invoke("rt:token", opts),
  goodbyeInstructions: (reason) => ipcRenderer.invoke("rt:goodbye-instructions", reason),
  chatStarted: () => ipcRenderer.send("chat:started"),
  chatLine: (role, text) => ipcRenderer.send("chat:line", { role, text }),
  chatGoodbye: (reason) => ipcRenderer.send("chat:goodbye", { reason }),
  chatEnded: (data) => ipcRenderer.send("chat:ended", data),
  chatError: () => ipcRenderer.send("chat:error"),
  wakeClip: (wav) => ipcRenderer.invoke("wake:clip", wav),
  forget: (what) => ipcRenderer.invoke("chat:forget", what),
  activity: () => ipcRenderer.send("win:activity"),
  onVisibility: on("visibility"),
  getAnalytics: () => ipcRenderer.invoke("analytics:get"),
  setReminder: (args) => ipcRenderer.invoke("reminder:set", args),
  exportData: () => ipcRenderer.invoke("data:export"),
  interactive: (on) => ipcRenderer.send("win:interactive", on),
  dragStart: () => ipcRenderer.send("win:drag-start"),
  dragEnd: () => ipcRenderer.send("win:drag-end"),
  openMenu: () => ipcRenderer.send("menu:open"),
  openPanel: (tab) => ipcRenderer.send("panel:open", tab),
  onToggle: on("toggle"),
  onCursor: on("cursor"),
  onBubble: on("bubble"),
  onNudge: on("nudge"),
  onWakeMode: on("wake:mode"),
  onWakeRestart: on("wake:restart"),
  alive: () => ipcRenderer.send("mascot:alive"),
  log: (msg) => ipcRenderer.send("mascot:log", msg),
  onSettingsChanged: on("settings:changed"),
  // panel
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (p) => ipcRenderer.invoke("settings:save", p),
  setKey: (k) => ipcRenderer.invoke("settings:setKey", k),
  setPvKey: (k) => ipcRenderer.invoke("settings:setPvKey", k),
  pickPpn: () => ipcRenderer.invoke("settings:pickPpn"),
  testKey: () => ipcRenderer.invoke("settings:testKey"),
  getPrompt: () => ipcRenderer.invoke("settings:prompt"),
  getMemory: () => ipcRenderer.invoke("memory:get"),
  editMemory: (op) => ipcRenderer.invoke("memory:edit", op),
  onMemoryChanged: on("memory:changed"),
  onTab: on("panel:tab"),
});
