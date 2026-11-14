// Offline wake word with Picovoice Porcupine ("Hey Kakashi" .ppn trained at console.picovoice.ai).
// Runs in the main process, listens to the default microphone, uses very little CPU, sends nothing anywhere.
let running = false;
let paused = false;
let loopDone = null;

async function start({ accessKey, ppnPath, sensitivity = 0.6, onWake, onError }) {
  await stop();
  let porcupine, recorder;
  try {
    const { Porcupine } = require("@picovoice/porcupine-node");
    const { PvRecorder } = require("@picovoice/pvrecorder-node");
    porcupine = new Porcupine(accessKey, [ppnPath], [sensitivity]);
    recorder = new PvRecorder(porcupine.frameLength, -1);
    recorder.start();
  } catch (e) {
    try { porcupine?.release(); } catch {}
    onError?.(e);
    return false;
  }
  running = true;
  loopDone = (async () => {
    let lastFire = 0;
    while (running) {
      let frame;
      try { frame = await recorder.read(); } catch (e) { onError?.(e); break; }
      if (paused) continue;
      try {
        if (porcupine.process(frame) >= 0 && Date.now() - lastFire > 2000) {
          lastFire = Date.now();
          onWake();
        }
      } catch (e) { onError?.(e); break; }
    }
    try { recorder.stop(); } catch {}
    try { recorder.release(); } catch {}
    try { porcupine.release(); } catch {}
    running = false;
  })();
  return true;
}

async function stop() {
  if (!running) return;
  running = false;
  await loopDone;
}

// While a conversation is going on, ignore detections (Kakashi's own voice says his name!)
function setPaused(p) { paused = p; }
const isRunning = () => running;

module.exports = { start, stop, setPaused, isRunning };
