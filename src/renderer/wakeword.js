/* Cloud wake word ("Hey Kakashi") — used only when Picovoice isn't set up.
   A local voice-activity detector finds SHORT bursts of speech (0.4–4.5 s) and only those clips
   are sent to OpenAI for a quick transcription; long talking (calls, videos) is skipped.
   Exposes window.WakeWord = { start(onDetect), stop(), running } */
(() => {
  "use strict";
  const TARGET_RATE = 16000;
  let stream = null, ctx = null, proc = null, src = null, onDetect = null, lastAudioAt = 0;

  function encodeWav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
    return buf;
  }
  function downsample(chunks, fromRate) {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(total);
    let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    const ratio = fromRate / TARGET_RATE, out = new Float32Array(Math.floor(total / ratio));
    for (let i = 0; i < out.length; i++) {
      const s = Math.floor(i * ratio), e = Math.min(total, Math.floor((i + 1) * ratio));
      let sum = 0; for (let j = s; j < e; j++) sum += all[j];
      out[i] = sum / Math.max(1, e - s);
    }
    return out;
  }

  async function start(cb) {
    if (stream) return;
    onDetect = cb;
    // Low-power capture: echo cancellation / noise suppression are the expensive parts of
    // Chrome's audio pipeline and aren't needed just to spot "Hey Kakashi".
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } });
    ctx = new AudioContext();
    src = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(4096, 1, 1);  // ~11 callbacks/s
    const chunkSec = 4096 / ctx.sampleRate;
    let floor = 0.004, inSpeech = false, seg = [], speechSec = 0, silenceSec = 0, tooLong = false, peak = 0, loudChunks = 0;
    const preroll = [];

    proc.onaudioprocess = (e) => {
      lastAudioAt = performance.now();
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      let s = 0; for (let i = 0; i < data.length; i++) s += data[i] * data[i];
      const rms = Math.sqrt(s / data.length);
      const threshold = Math.max(0.012, floor * 3.2);
      const loud = rms > threshold;
      if (!inSpeech) {
        floor = floor * 0.98 + Math.min(rms, 0.05) * 0.02;
        preroll.push(data); if (preroll.length > 3) preroll.shift();
        if (loud) { inSpeech = true; seg = [...preroll]; speechSec = 0; silenceSec = 0; tooLong = false; peak = rms; loudChunks = 1; }
        return;
      }
      seg.push(data);
      peak = Math.max(peak, rms);
      if (loud) { loudChunks++; speechSec += chunkSec + silenceSec; silenceSec = 0; } else silenceSec += chunkSec;
      if (speechSec > 4.5) tooLong = true;                     // long talking: not a wake phrase
      if (silenceSec > 0.55 || speechSec > 8) {
        inSpeech = false;
        const clip = seg; seg = [];
        // "Hey Kakashi" is ~0.7-2 s of clear voice: skip clicks, thumps, breaths and quiet background sound
        if (!tooLong && speechSec >= 0.5 && loudChunks >= 3 && peak > Math.max(0.03, floor * 6)) {
          const wav = encodeWav(downsample(clip, ctx.sampleRate), TARGET_RATE);
          window.ttm.wakeClip(wav).then((r) => { if (r && r.matched && onDetect) onDetect(r.text); }).catch(() => {});
        }
      }
    };
    src.connect(proc);
    proc.connect(ctx.destination); // required for ScriptProcessor to run (outputs silence)
  }

  function stop() {
    try { proc && (proc.onaudioprocess = null); proc && proc.disconnect(); src && src.disconnect(); } catch {}
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) ctx.close().catch(() => {});
    stream = ctx = proc = src = null;
  }

  // Healthy = mic track still live, audio engine running, and audio arrived in the last 8 s
  function healthy() {
    const t = stream && stream.getAudioTracks()[0];
    return !!(t && t.readyState === "live" && ctx && ctx.state === "running" && performance.now() - lastAudioAt < 8000);
  }

  window.WakeWord = { start, stop, healthy, get running() { return !!stream; } };
})();
