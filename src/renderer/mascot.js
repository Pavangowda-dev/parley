/* Kakashi window: live voice conversation over WebRTC (OpenAI Realtime), wake word,
   goodbye handling, speech bubbles, drag & click. The character itself is kakashi.js. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  // The character on screen: one of the 12 AgentKit characters, chosen in Settings → Character.
  // `K` is a small adapter so the rest of this file doesn't care which character is shown.
  // Desktop buddy: light frame budget so it never competes with your work (eyes still follow the mouse).
  Object.assign(AgentKit.defaults, { maxFps: 30, calmFps: 20, pointerBoost: false });
  const agent = AgentKit.create("#kakashi", { style: "nori", size: 72, interactive: false });
  let charKey = "";
  const K = {
    setState: (s, opts) => agent.setState(s, opts),
    getState: () => agent.getState(),
    setAfterHappy: (s) => { agent.happyReturn = s; },
    feedPointer: (x, y) => AgentKit.feedPointer(x, y),
    setVoiceStream: (stream) => agent.attachVoice(stream),
    hitTest: (x, y) => agent.hitTest(x, y),
    pause: () => AgentKit.pause(),
    resume: () => AgentKit.resume(),
    setCharacter(c) {
      if (!c) return;
      const key = JSON.stringify(c);
      if (key === charKey) return;
      const first = !charKey;
      charKey = key;
      agent.setStyle(c.style || "nori", c.colors || undefined);
      if (!first) agent.setState("happy", { then: agent.getState() === "happy" ? agent.happyReturn : agent.getState() }); // say hi in the new look
    },
  };
  const canvas = $("#kakashi");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let info = { hotkey: "Ctrl+Alt+Space", buddyName: "Aira", character: null, wakeMode: "off" };
  function applyInfo(i) {
    Object.assign(info, i);
    K.setCharacter(info.character);
    $("#hint").textContent = info.wakeMode !== "off" ? `Say “Hey ${info.buddyName}” or ${info.hotkey}` : `${info.hotkey} to talk · right-click for menu`;
  }
  window.ttm.info().then(applyInfo);
  window.ttm.onSettingsChanged(applyInfo);

  // =====================================================================================
  // Conversation state → character pose
  // =====================================================================================
  // phase: off | connecting | listening | userSpeaking | thinking | speaking
  let phase = "off";
  const POSE = { off: "idle", connecting: "thinking", listening: "listening", userSpeaking: "listening", thinking: "thinking", speaking: "speaking" };
  function setPhase(p) {
    phase = p;
    if (K.getState() === "happy") { K.setAfterHappy(POSE[p]); return; } // let the hop finish first
    K.setState(POSE[p]);
  }
  function celebrate(then) { K.setState("happy", { then: POSE[then] || "idle" }); }

  window.ttm.onCursor(({ x, y }) => K.feedPointer(x, y));

  // Auto-hide: fade out + stop drawing; pop back in when called
  let pauseTimer = null;
  window.ttm.onVisibility(({ visible }) => {
    clearTimeout(pauseTimer);
    if (visible) {
      K.resume();
      document.body.classList.add("away");
      requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("away")));
      if (phase === "off") celebrate("off");
    } else {
      document.body.classList.add("away");
      hideBubble();
      pauseTimer = setTimeout(() => K.pause(), 420);
    }
  });
  let lastPing = 0;
  const ping = () => { if (Date.now() - lastPing > 5000) { lastPing = Date.now(); window.ttm.activity(); } };

  // =====================================================================================
  // Bubble
  // =====================================================================================
  const bubble = $("#bubble"), bubbleContent = $("#bubble-content");
  let bubbleTimer = null, bubbleKind = "";
  function showBubble(html, { kind = "info", ms = 9000 } = {}) {
    clearTimeout(bubbleTimer);
    bubbleKind = kind;
    bubble.className = "bubble " + kind;
    bubbleContent.innerHTML = html;
    if (ms) bubbleTimer = setTimeout(hideBubble, ms);
  }
  function hideBubble() {
    if (bubble.classList.contains("hidden")) return;
    bubble.classList.add("leaving");
    setTimeout(() => { bubble.className = "bubble hidden"; }, 240);
  }
  $("#bubble-close").addEventListener("click", (e) => { e.stopPropagation(); hideBubble(); });
  bubble.addEventListener("click", () => {
    if (bubbleKind === "nudge") { hideBubble(); if (phase === "off") start(); }
    else if (bubbleKind === "correction") window.ttm.openPanel("today");
  });

  window.ttm.onBubble((b) => {
    if (b.kind === "reminder") {
      chime(true);
      celebrate(phase);
      showBubble(`<div class="b-title">⏰ Reminder</div><div class="b-text">${esc(b.text)}</div>`, { kind: "nudge", ms: 20 * 60000 });
      return;
    }
    if (b.kind === "correction") {
      showBubble(
        `<div class="b-title">✏️ Say it like this</div>
         <div class="b-better">“${esc(b.better)}”</div>
         ${b.why ? `<div class="b-why">${esc(b.why)}</div>` : ""}
         ${b.betterWord ? `<div class="b-why">💡 ${esc(b.betterWord)}</div>` : ""}
         <div class="b-said">${esc(b.said)}</div>`,
        { kind: "correction", ms: 14000 }
      );
    } else if (b.kind === "word") {
      showBubble(`<div class="b-title">💡 Better word</div><div class="b-text">${esc(b.text)}</div>`, { kind: "word", ms: 8000 });
    } else {
      showBubble(`<div class="b-text">${esc(b.text)}</div>`, { kind: "info", ms: 8000 });
    }
  });

  window.ttm.onNudge(({ text }) => {
    if (phase !== "off") return;
    celebrate("off");
    showBubble(`<div class="b-text">${esc(text)}</div><div class="b-sub">Say “Hey ${esc(info.buddyName)}”, press ${esc(info.hotkey)}, or click here</div>`, { kind: "nudge", ms: 15 * 60000 });
  });

  // =====================================================================================
  // Mouse: click = talk, drag = move, right-click = menu (only over the character / bubble)
  // =====================================================================================
  let overInteractive = false;
  function isOver(e) {
    if (!bubble.classList.contains("hidden") && bubble.contains(e.target)) return true;
    return K.hitTest(e.clientX, e.clientY);
  }
  document.addEventListener("mousemove", (e) => {
    const over = isOver(e);
    if (over) ping(); // hovering keeps the buddy visible
    if (over !== overInteractive) {
      overInteractive = over;
      window.ttm.interactive(over);
      const onChar = over && K.hitTest(e.clientX, e.clientY);
      $("#hint").classList.toggle("hidden", !(onChar && phase === "off" && bubble.classList.contains("hidden")));
    }
  });
  document.addEventListener("mouseleave", () => { overInteractive = false; window.ttm.interactive(false); $("#hint").classList.add("hidden"); });

  let down = null, dragging = false;
  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !K.hitTest(e.clientX, e.clientY)) return;
    down = { x: e.screenX, y: e.screenY }; dragging = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (!down || dragging) return;
    if (Math.hypot(e.screenX - down.x, e.screenY - down.y) > 5) { dragging = true; window.ttm.dragStart(); }
  });
  window.addEventListener("mouseup", (e) => {
    if (!down || e.button !== 0) return;
    if (dragging) window.ttm.dragEnd(); else toggle();
    down = null; dragging = false;
  });
  document.addEventListener("contextmenu", (e) => {
    if (!K.hitTest(e.clientX, e.clientY)) return;
    e.preventDefault(); window.ttm.openMenu();
  });

  // =====================================================================================
  // Wake word
  // =====================================================================================
  let wakeMode = "off";
  window.ttm.onWakeMode(({ mode }) => {
    wakeMode = mode; info.wakeMode = mode; applyInfo({});
    syncCloudWake();
  });
  let wakeStarting = false;
  function syncCloudWake() {
    const want = wakeMode === "openai" && phase === "off";
    if (want && !window.WakeWord.running && !wakeStarting) {
      wakeStarting = true;
      window.WakeWord.start(() => { /* main process shows Kakashi and starts the chat */ })
        .then(() => window.ttm.log("wake listener started"))
        .catch((e) => { window.ttm.log(`wake listener mic error: ${e.name} ${e.message}`); window.WakeWord.stop(); })
        .finally(() => { wakeStarting = false; });
    } else if (!want && window.WakeWord.running) {
      window.WakeWord.stop();
    }
  }
  // Self-check every 15 s: (re)start the listener if the mic wasn't ready, stalled, or died after sleep
  setInterval(() => {
    if (wakeMode !== "openai" || phase !== "off" || wakeStarting) return;
    if (window.WakeWord.running && !window.WakeWord.healthy()) {
      window.ttm.log("wake listener stalled → restarting");
      window.WakeWord.stop();
    }
    syncCloudWake();
  }, 15000);
  window.ttm.onWakeRestart(() => { if (phase !== "off") return; window.WakeWord.stop(); syncCloudWake(); });
  // Heartbeat so the main process knows this window is alive
  setInterval(() => window.ttm.alive(), 20000);
  window.ttm.alive();

  // =====================================================================================
  // Realtime voice conversation (WebRTC)
  // =====================================================================================
  let pc = null, dc = null, micStream = null, remoteAudio = null;
  let lastActivity = 0, userSpoke = false, greetTimer = null, sleepTimer = null, endTimer = null;
  let speechStartedAt = 0, speakingSec = 0, autoSleepSec = 75, connectId = 0;
  let ending = null;            // { reason, stage: 'awaitAudio' | 'awaitGoodbye' }
  // ---- turn-taking (noise-robust barge-in) ----
  // The server only detects speech; this window decides what counts as a real turn.
  const BARGE_MS = 650;         // speech this long while the buddy talks = a real interruption
  const SHORT_MS = 400;         // shorter sounds while the buddy is quiet are double-checked (clap? cough?)
  let sessionInstructions = "";
  let botSpeaking = false, responseActive = false, botItemId = null, botAudioStartedAt = 0;
  let turn = null;              // { startAt, duringBot, barged, noise, verify, itemId, timer }

  // Warm up WebRTC once in the background: on Windows the first peer connection scans every
  // network adapter (slow with Docker/Hyper-V/VPN adapters). Doing it now makes "Hey Kakashi" connect fast.
  async function warmUpWebRTC() {
    try {
      const t = performance.now();
      const w = new RTCPeerConnection();
      w.createDataChannel("warmup");
      await w.setLocalDescription(await w.createOffer({ offerToReceiveAudio: true }));
      w.close();
      window.ttm.log(`webrtc warm-up ${((performance.now() - t) / 1000).toFixed(1)}s`);
    } catch {}
  }
  setTimeout(warmUpWebRTC, 4000);

  function toggle(opts = {}) { phase === "off" ? start(opts) : stop("user"); }
  window.ttm.onToggle((opts) => toggle(opts || {}));
  const sendEvent = (ev) => { if (dc && dc.readyState === "open") dc.send(JSON.stringify(ev)); };

  // little "ready" / "bye" sounds
  let actx = null;
  function chime(up = true) {
    try {
      actx = actx || new AudioContext();
      (up ? [660, 880] : [700, 520]).forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = "sine"; o.frequency.value = f;
        const t = actx.currentTime + i * 0.09;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g).connect(actx.destination);
        o.start(t); o.stop(t + 0.3);
      });
    } catch {}
  }

  async function start({ byVoice = false } = {}) {
    if (phase !== "off") return;
    const myId = ++connectId;
    hideBubble();
    $("#hint").classList.add("hidden");
    window.WakeWord.stop();                // free the mic for the conversation
    celebrate("connecting");
    setPhase("connecting");
    userSpoke = false; speakingSec = 0; ending = null;
    try {
      // Fetch the session token and open the microphone at the same time (faster start)
      const t0 = performance.now();
      const [tkR, micR] = await Promise.allSettled([
        window.ttm.token({ byVoice }),
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
      ]);
      if (micR.status === "fulfilled") micStream = micR.value;   // assigned first so cleanup() always releases it
      if (tkR.status === "rejected") throw tkR.reason;
      if (micR.status === "rejected") throw micR.reason;
      const { token, instructions, greeting, autoSleepSec: s } = tkR.value;
      sessionInstructions = instructions;
      botSpeaking = false; responseActive = false; botItemId = null; turn = null;
      const tReady = performance.now();
      autoSleepSec = s || 75;
      if (myId !== connectId) { micStream.getTracks().forEach((t) => t.stop()); return; }

      pc = new RTCPeerConnection();
      remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      pc.ontrack = (e) => { remoteAudio.srcObject = e.streams[0]; K.setVoiceStream(e.streams[0]); };
      pc.addTrack(micStream.getAudioTracks()[0], micStream);

      dc = pc.createDataChannel("oai-events");
      dc.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch (err) { console.error(err); } };
      dc.onopen = () => {
        const f = (a, b) => ((b - a) / 1000).toFixed(1);
        window.ttm.log(`connected in ${f(t0, performance.now())}s (token+mic ${f(t0, tReady)}s, offer ${f(tReady, tOffer)}s, sdp ${f(tOffer, tSdp)}s, channel ${f(tSdp, performance.now())}s)`);
        setPhase("listening");
        chime(true);
        lastActivity = Date.now();
        window.ttm.chatStarted();
        const greet = () => sendEvent({ type: "response.create", response: { instructions: `${instructions}\n\n# Right now\n${greeting}` } });
        // Called by name → answer right away. Hotkey → give them a moment to start talking first.
        if (byVoice) greet();
        else greetTimer = setTimeout(() => { if (!userSpoke) greet(); }, 3000);
        clearInterval(sleepTimer);
        sleepTimer = setInterval(() => {
          if (phase === "listening" && !ending && Date.now() - lastActivity > autoSleepSec * 1000) stop("idle");
        }, 1000);
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(pc?.connectionState) && phase !== "off") {
          stop("error");
          showBubble(`<div class="b-text b-error">Connection lost. Press ${esc(info.hotkey)} to reconnect.</div>`, { ms: 8000 });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const tOffer = performance.now();
      const res = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST", body: offer.sdp,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/sdp" },
      });
      if (!res.ok) throw new Error(`Couldn't connect (${res.status}): ${(await res.text()).slice(0, 180)}`);
      const answer = await res.text();
      const tSdp = performance.now();
      if (myId !== connectId) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (err) {
      console.error(err);
      cleanup();
      setPhase("off");
      K.setState("idle");
      window.ttm.chatError();
      syncCloudWake();
      let msg = err.message || String(err);
      if (err.name === "NotAllowedError") msg = "I can't hear you — microphone access is blocked. Windows Settings → Privacy → Microphone.";
      showBubble(`<div class="b-text b-error">${esc(msg)}</div>`, { ms: 12000 });
    }
  }

  // --- goodbye: the buddy says bye, then we hang up once the voice finishes
  function finishAfterSpeech() {
    clearTimeout(endTimer);
    // If the buddy isn't speaking within 1.5 s, end anyway; never wait more than 10 s.
    endTimer = setTimeout(() => { if (phase !== "speaking") stop("bye"); }, 1500);
    setTimeout(() => { if (ending) stop("bye"); }, 10000);
  }

  const meaningful = (t) => ((t || "").match(/\p{L}/gu) || []).length >= 2 && !/^\W*\[?(noise|music|applause|clap|cough|sneeze|laugh)/i.test(t || "");
  function respond() { sendEvent({ type: "response.create" }); setPhase("thinking"); }
  function bargeIn() {
    if (!turn || turn.barged) return;
    turn.barged = true;
    // Stop the voice. Clearing the output buffer also makes the server cut the buddy's last message
    // to exactly what was heard, so the next reply knows what the user did and didn't hear.
    if (responseActive) sendEvent({ type: "response.cancel" });
    sendEvent({ type: "output_audio_buffer.clear" });
    botSpeaking = false;
    setPhase("userSpeaking");
  }
  function dropTurn(itemId) { if (itemId) sendEvent({ type: "conversation.item.delete", item_id: itemId }); }

  async function onEvent(ev) {
    switch (ev.type) {
      case "input_audio_buffer.speech_started": {
        clearTimeout(greetTimer);
        lastActivity = Date.now();
        const duringBot = botSpeaking || responseActive;
        turn = { startAt: performance.now(), duringBot, barged: false, noise: false, verify: false, itemId: null, timer: null };
        if (duringBot) {
          // Don't stop talking for a clap or a sneeze: only real, continuing speech interrupts.
          const t = turn;
          t.timer = setTimeout(() => { if (turn === t) bargeIn(); }, BARGE_MS);
        } else {
          userSpoke = true;
          speechStartedAt = performance.now();
          setPhase("userSpeaking");
        }
        break;
      }
      case "input_audio_buffer.speech_stopped": {
        lastActivity = Date.now();
        if (!turn) break;
        clearTimeout(turn.timer);
        const dur = performance.now() - turn.startAt;
        if (turn.duringBot && !turn.barged) { turn.noise = true; break; }   // short sound over the buddy's voice → ignore
        userSpoke = true;
        speakingSec += dur / 1000;
        speechStartedAt = 0;
        turn.verify = turn.barged || dur < SHORT_MS;    // check the words before answering
        setPhase("thinking");
        break;
      }
      case "input_audio_buffer.committed": {
        const t = turn;
        if (!t) { respond(); break; }
        t.itemId = ev.item_id;
        if (t.noise) { dropTurn(ev.item_id); turn = null; break; }
        if (!t.verify) { turn = null; respond(); break; }
        // wait (briefly) for the transcript to decide: real words → answer, noise → ignore / carry on
        t.timer = setTimeout(() => { if (turn === t) { turn = null; respond(); } }, 2500);
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const text = ev.transcript || "";
        if (meaningful(text)) window.ttm.chatLine("user", text);
        const t = turn;
        if (t && t.itemId === ev.item_id && t.verify) {
          clearTimeout(t.timer);
          turn = null;
          if (meaningful(text)) respond();
          else {
            dropTurn(ev.item_id);
            if (t.barged) {
              // it was a noise after all: pick up where we left off
              sendEvent({ type: "response.create", response: { instructions: `${sessionInstructions}\n\n# Right now\nYou were cut off by a background noise, not by the user speaking. Continue naturally from where you stopped, in one or two short sentences.` } });
            } else setPhase("listening");
          }
        }
        break;
      }
      case "response.created":
        responseActive = true;
        break;
      case "response.output_item.added":
        if (ev.item && ev.item.type === "message") botItemId = ev.item.id;
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        window.ttm.chatLine("assistant", ev.transcript || "");
        break;
      case "output_audio_buffer.started":
        botSpeaking = true; botAudioStartedAt = performance.now();
        if (!(turn && turn.barged)) setPhase("speaking");
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        botSpeaking = false;
        lastActivity = Date.now();
        if (ending && ending.stage === "awaitAudio") { stop("bye"); break; }
        if (phase === "speaking") setPhase("listening");
        break;
      case "response.done": {
        responseActive = false;
        lastActivity = Date.now();
        const r = ev.response || {};
        if (r.status === "failed") {
          const m = r.status_details?.error?.message || "Response failed";
          showBubble(`<div class="b-text b-error">${esc(m)}</div>`, { ms: 9000 });
        }
        const items = r.output || [];
        // "Forget that" → delete from memory, then let the buddy confirm out loud
        const forgetCall = items.find((i) => i.type === "function_call" && i.name === "forget_memory");
        if (forgetCall) {
          let what = "";
          try { what = JSON.parse(forgetCall.arguments || "{}").what || ""; } catch {}
          setPhase("thinking");
          const res = await window.ttm.forget(what);
          if (res.ok) showBubble(`<div class="b-title">🧹 Forgotten</div><div class="b-text">${esc(res.summary)}</div>`, { ms: 7000 });
          sendEvent({ type: "conversation.item.create", item: { type: "function_call_output", call_id: forgetCall.call_id, output: JSON.stringify(res) } });
          sendEvent({ type: "response.create" });
          break;
        }
        // "Remind me to … at 5" → schedule it, then let the buddy confirm the time out loud
        const remindCall = items.find((i) => i.type === "function_call" && i.name === "set_reminder");
        if (remindCall) {
          let args = {};
          try { args = JSON.parse(remindCall.arguments || "{}"); } catch {}
          const res = await window.ttm.setReminder(args);
          if (res.ok) showBubble(`<div class="b-title">⏰ Reminder set · ${esc(res.when)}${res.today ? "" : " tomorrow"}</div><div class="b-text">${esc(res.text)}</div>`, { ms: 8000 });
          sendEvent({ type: "conversation.item.create", item: { type: "function_call_output", call_id: remindCall.call_id, output: JSON.stringify(res) } });
          sendEvent({ type: "response.create" });
          break;
        }
        const call = items.find((i) => i.type === "function_call" && i.name === "end_conversation");
        if (call && !ending) {
          let reason = "leaving";
          try { reason = JSON.parse(call.arguments || "{}").reason || "leaving"; } catch {}
          window.ttm.chatGoodbye(reason);
          const spokeBye = items.some((i) => i.type === "message");
          if (spokeBye) {
            ending = { reason, stage: "awaitAudio" };
            finishAfterSpeech();
          } else {
            // The model only called the tool - ask for the spoken goodbye, then hang up after it.
            ending = { reason, stage: "awaitGoodbye" };
            sendEvent({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ ok: true }) } });
            sendEvent({ type: "response.create", response: { instructions: await window.ttm.goodbyeInstructions(reason) } });
            setTimeout(() => { if (ending) stop("bye"); }, 10000);
          }
          break;
        }
        if (ending && ending.stage === "awaitGoodbye") { ending.stage = "awaitAudio"; finishAfterSpeech(); break; }
        setTimeout(() => { if (phase === "thinking") setPhase("listening"); }, 2500);
        break;
      }
      case "error": {
        const m = ev.error?.message || "Something went wrong";
        if (/no active response|cancel/i.test(m)) break;
        console.error("Realtime error:", ev.error);
        showBubble(`<div class="b-text b-error">${esc(m)}</div>`, { ms: 9000 });
        break;
      }
    }
  }

  function cleanup() {
    clearTimeout(greetTimer); clearTimeout(endTimer); clearInterval(sleepTimer);
    try { dc && dc.close(); } catch {}
    try { pc && pc.close(); } catch {}
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    if (remoteAudio) remoteAudio.srcObject = null;
    K.setVoiceStream(null);
    pc = dc = micStream = remoteAudio = null;
  }

  function stop(reason) {
    if (phase === "off") return;
    connectId++;
    if (speechStartedAt) speakingSec += (performance.now() - speechStartedAt) / 1000;
    speechStartedAt = 0;
    const wasEnding = ending;
    ending = null;
    cleanup();
    phase = "off";
    if (reason === "bye") celebrate("off"); else K.setState("idle");
    chime(false);
    window.ttm.chatEnded({ speakingSec: Math.round(speakingSec) });
    if (reason === "idle") showBubble(`<div class="b-text">I'll be right here.</div><div class="b-sub">Say “Hey ${esc(info.buddyName)}” or ${esc(info.hotkey)} when you're back</div>`, { ms: 6000 });
    if (reason === "bye" && wasEnding?.reason === "sleeping") showBubble(`<div class="b-text">Good night 🌙 Sleep well!</div>`, { ms: 6000 });
    setTimeout(syncCloudWake, 1200);
  }

  setPhase("off");
})();
