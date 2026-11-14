// Launches the app. Clears ELECTRON_RUN_AS_NODE (set by VS Code terminals/extensions),
// which would otherwise make Electron run as plain Node.
const { spawn } = require("child_process");
const path = require("path");
const electron = require("electron"); // path to electron.exe

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [path.join(__dirname, "..")], { env, stdio: "inherit", windowsHide: false });
child.on("exit", (code) => process.exit(code ?? 0));
