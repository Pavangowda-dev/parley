// `npm run shortcut` — creates a launcher so you can start Parley without a terminal.
//   Windows: Desktop + Start-menu shortcuts (scripts/install-shortcut.ps1)
//   macOS:   ~/Applications/Parley.app (a tiny launcher app with the Parley icon)
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const electron = require("electron"); // absolute path to the Electron binary

if (process.platform === "win32") {
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "install-shortcut.ps1")], { stdio: "inherit" });
} else if (process.platform === "darwin") {
  const appDir = path.join(os.homedir(), "Applications", "Parley.app");
  const q = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  // Launch Electron with this project folder, detached, without a Terminal window.
  const script = `do shell script "nohup \\"${q(electron)}\\" \\"${q(root)}\\" > /dev/null 2>&1 &"`;
  fs.mkdirSync(path.dirname(appDir), { recursive: true });
  if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
  execFileSync("osacompile", ["-o", appDir, "-e", script]);

  // Give it the Parley icon (assets/icon.png → .icns)
  try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "parley-icon-"));
    const set = path.join(tmp, "Parley.iconset");
    fs.mkdirSync(set);
    for (const n of [16, 32, 128, 256, 512]) {
      execFileSync("sips", ["-z", String(n), String(n), path.join(root, "assets", "icon.png"), "--out", path.join(set, `icon_${n}x${n}.png`)], { stdio: "ignore" });
      execFileSync("sips", ["-z", String(n * 2), String(n * 2), path.join(root, "assets", "icon.png"), "--out", path.join(set, `icon_${n}x${n}@2x.png`)], { stdio: "ignore" });
    }
    execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(appDir, "Contents", "Resources", "applet.icns")]);
    execFileSync("touch", [appDir]);
  } catch (e) {
    console.warn("Couldn't set the app icon (Parley still works):", e.message);
  }
  console.log(`Created ${appDir}\nOpen it from Launchpad, Spotlight (⌘ Space → "Parley") or Finder → Applications.`);
} else {
  console.log("Shortcuts are created automatically on Windows and macOS. On other systems, start Parley with: npm start");
}
