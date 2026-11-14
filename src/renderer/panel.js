(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const main = $("#main");
  const TZ = "Asia/Kolkata";
  const fmtDay = (k, opts = { day: "numeric", month: "short" }) => new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
  const num = (n) => (n == null ? "–" : n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : n.toLocaleString("en-IN"));
  const fmtH = (h) => (h == null ? "–" : `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}m`);
  const ago = (iso) => {
    if (!iso) return "";
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    if (m < 1440) return `${Math.round(m / 60)} h ago`;
    return `${Math.round(m / 1440)} d ago`;
  };
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2400);
  }

  // ------------------------------------------------------------------ tooltip (hover layer for every chart mark)
  const tip = $("#tip");
  document.addEventListener("mousemove", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) { tip.classList.remove("show"); return; }
    tip.innerHTML = el.dataset.tip;
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY + "px";
    tip.classList.add("show");
  });
  main.addEventListener("scroll", () => tip.classList.remove("show"));

  // ------------------------------------------------------------------ navigation
  let tab = new URLSearchParams(location.search).get("tab") || "dashboard";
  function go(t) {
    tab = t;
    $$("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    main.scrollTop = 0;
    render();
  }
  $$("nav button").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
  window.ttm.onTab(go);
  let rerenderTimer = null;
  window.ttm.onMemoryChanged(() => {
    if (tab === "settings" || document.activeElement?.tagName === "INPUT") return; // don't wipe what you're typing
    clearTimeout(rerenderTimer); rerenderTimer = setTimeout(render, 300);
  });

  let BN = "Aira";   // your buddy's name (editable in Settings)
  async function sideFoot() {
    const s = await window.ttm.getSettings();
    BN = s.buddyName || "Aira";
    $(".brand-name").textContent = BN;
    document.title = `${BN} · Parley`;
    const hk = { "ctrl+alt+space": ["Ctrl", "Alt", "Space"], "ctrl+shift+space": ["Ctrl", "Shift", "Space"], "ctrl+alt+k": ["Ctrl", "Alt", "K"] }[s.hotkey] || ["Ctrl", "Alt", "Space"];
    const wake = { picovoice: `“Hey ${BN}” · offline`, openai: `“Hey ${BN}” · cloud`, off: "Wake word off" }[s.wakeRunning] || "Wake word off";
    $("#side-foot").innerHTML = `
      <div class="status-line"><span class="dot ${s.wakeRunning !== "off" ? "on" : ""}"></span>${esc(wake)}</div>
      <div class="keys">${hk.map((k) => `<kbd>${k}</kbd>`).join("<span>+</span>")}<span>to talk</span></div>`;
    return s;
  }

  async function render() {
    destroyStudio();
    const s = await sideFoot();
    updateBrand(s);
    if (tab === "dashboard") return renderDashboard(await window.ttm.getAnalytics(), s);
    if (tab === "settings") return renderSettings(s);
    const m = await window.ttm.getMemory();
    if (tab === "today") renderToday(m);
    if (tab === "projects") renderProjects(m);
    if (tab === "memory") renderMemory(m);
  }

  // ================================================================== charts (SVG)
  let W = 720;
  function barPath(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    if (h <= 0) return "";
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function axisX(series, x0, step, H) {
    return series.map((d, i) => (i % 5 === 0 || i === series.length - 1)
      ? `<text class="axis-label" x="${x0 + i * step + step / 2}" y="${H - 4}" text-anchor="middle">${esc(fmtDay(d.day))}</text>` : "").join("");
  }
  function gridY(max, H, top, bottom, fmt) {
    return [0, 0.5, 1].map((f) => {
      const y = top + (H - top - bottom) * (1 - f);
      return `<line class="grid-line" x1="36" x2="${W}" y1="${y}" y2="${y}"/><text class="axis-label" x="28" y="${y + 3.5}" text-anchor="end">${fmt(max * f)}</text>`;
    }).join("");
  }

  function barChart(series, key, { fmt = (v) => v, tipFmt = fmt, target = null, targetLabel = "", H = 210, w = 720 } = {}) {
    W = w;
    const vals = series.map((d) => d[key] ?? 0);
    if (!vals.some((v) => v > 0)) return null;
    const top = 14, bottom = 24, x0 = 40, step = (W - x0) / series.length, bw = Math.max(4, step - 4);
    const max = niceMax(Math.max(...vals, target || 0));
    const yOf = (v) => top + (H - top - bottom) * (1 - v / max);
    const bars = series.map((d, i) => {
      const v = d[key] ?? 0, y = yOf(v), x = x0 + i * step + (step - bw) / 2;
      const t = `<b>${tipFmt(v)}</b><div class="t-sub">${esc(fmtDay(d.day, { weekday: "short", day: "numeric", month: "short" }))}</div>`;
      return `<g class="col" data-tip='${t.replace(/'/g, "&#39;")}'><rect class="hit" x="${x0 + i * step}" y="${top}" width="${step}" height="${H - top - bottom}"/>
        <path class="bar ${v ? "" : "dim"}" d="${v ? barPath(x, y, bw, H - bottom - y, 4) : barPath(x, H - bottom - 2, bw, 2, 1)}"/></g>`;
    }).join("");
    const tgt = target ? `<line class="target" x1="${x0}" x2="${W}" y1="${yOf(target)}" y2="${yOf(target)}"/><text class="target-label" x="${W}" y="${yOf(target) - 6}" text-anchor="end">${esc(targetLabel)}</text>` : "";
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${gridY(max, H, top, bottom, fmt)}${tgt}${bars}${axisX(series, x0, step, H)}</svg>`;
  }

  function lineChart(series, key, { fmt = (v) => v, max = null, H = 210, w = 720 } = {}) {
    W = w;
    const pts = series.map((d, i) => ({ i, v: d[key], d })).filter((p) => p.v != null);
    if (pts.length < 2) return null;
    const top = 14, bottom = 24, x0 = 40, step = (W - x0) / series.length;
    const mx = max ?? niceMax(Math.max(...pts.map((p) => p.v)));
    const X = (i) => x0 + i * step + step / 2, Y = (v) => top + (H - top - bottom) * (1 - v / mx);
    const path = pts.map((p, j) => `${j ? "L" : "M"}${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
    const area = `${path} L${X(pts[pts.length - 1].i)},${H - bottom} L${X(pts[0].i)},${H - bottom} Z`;
    const last = pts[pts.length - 1];
    const hits = pts.map((p) => {
      const t = `<b>${fmt(p.v)}</b><div class="t-sub">${esc(fmtDay(p.d.day, { weekday: "short", day: "numeric", month: "short" }))}</div>`;
      return `<rect class="hit" data-tip='${t.replace(/'/g, "&#39;")}' x="${X(p.i) - step / 2}" y="${top}" width="${step}" height="${H - top - bottom}"/>`;
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
      <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4ff3a" stop-opacity=".22"/><stop offset="1" stop-color="#d4ff3a" stop-opacity="0"/></linearGradient></defs>
      ${gridY(mx, H, top, bottom, fmt)}<path class="area" d="${area}"/><path class="line" d="${path}"/>
      <circle class="marker" cx="${X(last.i)}" cy="${Y(last.v)}" r="4.5"/>${hits}${axisX(series, x0, step, H)}</svg>`;
  }

  function heatmap(heat) {
    const max = Math.max(1, ...heat.flat());
    if (!heat.flat().some((v) => v > 0)) return null;
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const hourLbl = (h) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
    const cells = heat.map((row, d) => `<div class="hl">${days[d]}</div>` + row.map((v, h) => {
      const a = v ? 0.18 + 0.82 * (v / max) : 0;
      const t = `<b>${v} chat${v === 1 ? "" : "s"}</b><div class="t-sub">${days[d]} · ${hourLbl(h)}–${hourLbl((h + 1) % 24)}</div>`;
      return `<div class="cell" data-tip='${t}' style="${v ? `background: rgba(212,255,58,${a.toFixed(2)})` : ""}"></div>`;
    }).join("")).join("");
    const labels = `<div></div>` + Array.from({ length: 24 }, (_, h) => `<div class="hlabel">${h % 3 === 0 ? hourLbl(h) : ""}</div>`).join("");
    return `<div class="heat">${cells}${labels}</div>
      <div class="legend-ramp">Fewer ${[0.18, 0.45, 0.72, 1].map((a) => `<i style="background: rgba(212,255,58,${a})"></i>`).join("")} More</div>`;
  }

  function hbars(entries, { empty = "Nothing yet." } = {}) {
    if (!entries.length) return `<div class="empty">${esc(empty)}</div>`;
    const max = Math.max(...entries.map((e) => e[1]));
    return `<div class="hbars">${entries.map(([k, v]) => `
      <div class="hbar" data-tip='<b>${v}</b> <span class="t-sub">${esc(k)}</span>'><span class="name">${esc(k)}</span>
      <span class="track"><span class="fill" style="width:${Math.max(3, (v / max) * 100)}%"></span></span><span class="num">${v}</span></div>`).join("")}</div>`;
  }
  const chartOrEmpty = (svg, msg) => svg || `<div class="empty-chart">${esc(msg)}</div>`;

  // ================================================================== Dashboard
  function greeting(name) {
    const h = +new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date());
    const part = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Late night";
    return `${part}, <em>${esc(name || "friend")}.</em>`;
  }
  function renderDashboard(a, s) {
    const k = a.kpis, ser = a.series;
    const week = ser.slice(-7);
    const weekMin = Math.round(week.reduce((n, d) => n + d.minutes, 0));
    const weekChats = week.reduce((n, d) => n + d.chats, 0);
    const delta = k.accuracy7 != null && k.accuracyPrev7 != null ? k.accuracy7 - k.accuracyPrev7 : null;
    const now = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date());
    const empty = !k.chats;

    main.innerHTML = `<div class="page">
      <div class="eyebrow"><span>Dashboard</span><span class="sep"></span><span>${esc(now)} IST</span></div>
      <h1 class="display">${greeting(s.name)}</h1>
      <p class="lede">${empty
        ? `Say <b>“Hey ${esc(BN)}”</b> or press <b>${esc({ "ctrl+shift+space": "Ctrl + Shift + Space", "ctrl+alt+k": "Ctrl + Alt + K" }[s.hotkey] || "Ctrl + Alt + Space")}</b> and tell ${esc(BN)} about your day. Your speaking stats will build up here.`
        : `This week you spoke for <b>${weekMin} minutes</b> across <b>${weekChats} conversation${weekChats === 1 ? "" : "s"}</b>${k.accuracy7 != null ? `, with <b>${k.accuracy7}%</b> of your sentences correct` : ""}. ${k.streak > 1 ? `You're on a <b>${k.streak}-day streak</b>, so keep it going.` : "Talk every day to build a streak."}`}</p>

      ${(() => {
        const goal = s.dailyGoalMin || 10, done = a.todayMinutes || 0, pct = Math.min(100, Math.round((done / goal) * 100));
        return `<div class="goal" data-tip='<b>${done} of ${goal} min</b> <span class="t-sub">spoken today</span>'>
          <div class="goal-head"><span>Today's goal</span><span><b>${done}</b> / ${goal} min${pct >= 100 ? " · done ✓" : ""}</span></div>
          <div class="goal-track"><div class="goal-fill" style="width:${pct}%"></div></div></div>`;
      })()}
      <div class="section grid g-6">
        <div class="card kpi hero"><div class="label">Day streak</div><div class="value">${k.streak}<small>day${k.streak === 1 ? "" : "s"}</small></div><div class="foot">Best: ${k.bestStreak}</div></div>
        <div class="card kpi"><div class="label">Speaking time</div><div class="value">${num(k.totalMinutes)}<small>min</small></div><div class="foot">${k.chats} conversations</div></div>
        <div class="card kpi"><div class="label">Words spoken</div><div class="value">${num(k.totalWords)}</div><div class="foot">${k.wpm ? `${k.wpm} words / min` : "pace appears after a few chats"}</div></div>
        <div class="card kpi"><div class="label">Vocabulary</div><div class="value">${num(k.vocab)}<small>words</small></div><div class="foot">unique words you've used</div></div>
        <div class="card kpi"><div class="label">Sentence accuracy</div><div class="value">${k.accuracy7 ?? k.accuracy ?? "–"}<small>${k.accuracy7 != null || k.accuracy != null ? "%" : ""}</small></div>
          <div class="foot">${delta != null ? `<span class="delta ${delta >= 0 ? "up" : ""}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} pts</span> vs last week` : "last 7 days"}</div></div>
        <div class="card kpi"><div class="label">Avg sleep</div><div class="value">${k.avgSleep != null ? `${k.avgSleep}<small>h</small>` : "–"}</div><div class="foot">last 14 nights · target 7h</div></div>
      </div>

      <div class="section">
        <div class="section-head"><h2>Speaking <em>time</em></h2><span class="meta">Minutes per day · last 30 days</span></div>
        <div class="card">${chartOrEmpty(barChart(ser, "minutes", { fmt: (v) => Math.round(v * 10) / 10, tipFmt: (v) => `${v} min spoken` }), "No speaking time yet. Your first conversation shows up here.")}</div>
      </div>

      <div class="section grid g-2">
        <div>
          <div class="section-head"><h2>Accuracy</h2><span class="meta">% of sentences without a correction</span></div>
          <div class="card">${chartOrEmpty(lineChart(ser, "accuracy", { fmt: (v) => `${Math.round(v)}%`, max: 100, w: 460, H: 230 }), "Appears after two days of conversations.")}</div>
        </div>
        <div>
          <div class="section-head"><h2>Sleep</h2><span class="meta">Hours per night, from “good night” to “good morning”</span></div>
          <div class="card">${chartOrEmpty(barChart(ser, "sleep", { fmt: (v) => `${Math.round(v)}h`, tipFmt: (v) => fmtH(v) + " of sleep", target: 7, targetLabel: "7h target", w: 460, H: 230 }), `Say “good night, I'm going to sleep” to ${BN} to start tracking.`)}</div>
        </div>
      </div>

      <div class="section grid g-2">
        <div>
          <div class="section-head"><h2>Words <em>per day</em></h2><span class="meta">How much you speak</span></div>
          <div class="card">${chartOrEmpty(barChart(ser, "words", { tipFmt: (v) => `${v} words`, w: 460, H: 230 }), "No words yet.")}</div>
        </div>
        <div>
          <div class="section-head"><h2>Vocabulary <em>growth</em></h2><span class="meta">Unique words used, cumulative</span></div>
          <div class="card">${chartOrEmpty(lineChart(ser, "vocab", { fmt: (v) => num(Math.round(v)), w: 460, H: 230 }), "Grows as you use new words.")}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><h2>When you <em>talk</em></h2><span class="meta">Conversations by weekday and hour · IST · last 30 days</span></div>
        <div class="card">${chartOrEmpty(heatmap(a.heat), "Your talking rhythm appears here.")}</div>
      </div>

      <div class="section grid g-3">
        <div class="card"><div class="card-title"><span>Mistake types</span><span>${k.corrections30} in 30 days</span></div>${hbars(a.mistakeTypes, { empty: "No corrections yet. Nice!" })}</div>
        <div class="card"><div class="card-title"><span>Filler words</span><span>30 days</span></div>${hbars(a.fillers, { empty: "No filler words detected." })}</div>
        <div class="card"><div class="card-title"><span>Patterns to fix</span><span>tracked by ${esc(BN)}</span></div>
          ${a.patterns.length ? `<div class="list">${a.patterns.map((p, i) => `<div class="row"><span class="muted small" style="width:18px">${String(i + 1).padStart(2, "0")}</span><span class="grow">${esc(p)}</span></div>`).join("")}</div>` : `<div class="empty">${esc(BN)} will spot your recurring mistakes here.</div>`}</div>
      </div>

      <div class="section grid g-3">
        <div class="card span-2"><div class="card-title"><span>Your most-used words</span><span>all time</span></div>
          ${a.topWords.length ? `<div class="chips">${a.topWords.map((w) => `<span class="chip" data-tip='<b>${w.n}</b> <span class="t-sub">times</span>'>${esc(w.w)} <b>${w.n}</b></span>`).join("")}</div>` : `<div class="empty">Start talking to see your vocabulary.</div>`}
          <div class="card-title" style="margin-top:26px"><span>New words this month</span><span>${a.newWords.length}</span></div>
          ${a.newWords.length ? `<div class="chips">${a.newWords.map((w) => `<span class="chip accent" data-tip='<span class="t-sub">first used</span> <b>${esc(fmtDay(w.day))}</b>'>${esc(w.w)}</span>`).join("")}</div>` : `<div class="empty">Words you use for the first time appear here.</div>`}
        </div>
        <div class="card"><div class="card-title"><span>Better words to learn</span><span>from corrections</span></div>
          ${a.betterWords.length ? `<div class="wordlist">${a.betterWords.map((b) => `<div class="wordrow"><span class="w">${esc(b.text)}</span><span class="d">${esc(fmtDay(b.day))}</span></div>`).join("")}</div>` : `<div class="empty">${esc(BN)}'s word suggestions are collected here.</div>`}
        </div>
      </div>
    </div>`;
  }

  // ================================================================== Today
  function renderToday(m) {
    const k = m.todayKey;
    const d = m.days[k] || { summary: "", events: [], chats: 0, speakingSec: 0 };
    const corr = m.corrections.filter((c) => c.day === k).reverse();
    const older = m.corrections.filter((c) => c.day !== k).slice(-12).reverse();
    const sleep = d.sleep;
    const st = d.stats || {};
    main.innerHTML = `<div class="page">
      <div class="eyebrow"><span>Today</span><span class="sep"></span><span>${esc(fmtDay(k, { weekday: "long", day: "numeric", month: "long" }))}</span></div>
      <h1 class="display">Your <em>day</em>, so far.</h1>
      ${d.summary ? `<p class="lede">${esc(d.summary)}</p>` : `<p class="lede">Nothing yet. Say <b>“Hey ${esc(BN)}”</b> and say what you're up to.</p>`}

      <div class="section grid g-6">
        <div class="card kpi"><div class="label">Sleep</div><div class="value" style="font-size:32px">${sleep ? fmtH(sleep.hours) : m.sleepPending ? "zzz" : "–"}</div><div class="foot">${sleep ? `${esc(sleep.sleptAt)} → ${esc(sleep.wokeAt)}` : "say good night to track"}</div></div>
        <div class="card kpi"><div class="label">Conversations</div><div class="value">${d.chats || 0}</div><div class="foot">${Math.round((d.speakingSec || 0) / 6) / 10} min spoken</div></div>
        <div class="card kpi"><div class="label">Words</div><div class="value">${num(st.words || 0)}</div><div class="foot">${st.sentences || 0} sentences</div></div>
        <div class="card kpi"><div class="label">Accuracy</div><div class="value">${st.sentences ? Math.round((st.clean / st.sentences) * 100) : "–"}<small>${st.sentences ? "%" : ""}</small></div><div class="foot">sentences without a fix</div></div>
        <div class="card kpi"><div class="label">Corrections</div><div class="value">${corr.length}</div><div class="foot">read them aloud once</div></div>
        <div class="card kpi"><div class="label">Follow-ups</div><div class="value">${m.followups.filter((f) => !f.done).length}</div><div class="foot">open</div></div>
      </div>

      <div class="section grid g-2">
        <div>
          <div class="section-head"><h2>Timeline</h2><span class="meta">IST · hover an entry to delete it</span></div>
          <div class="card">${d.events?.length ? `<div class="timeline">${d.events.map((e) => `
            <div class="tl"><time>${esc(e.time)}</time><span class="node"></span><span class="txt">${esc(e.text)}</span>
            <span class="actions"><button class="icon-btn del" data-del-event="${esc(e.id)}" title="Forget this">✕</button></span></div>`).join("")}</div>`
            : `<div class="empty">${esc(BN)} writes down what you share here: meals, gym, work, sleep.</div>`}
            ${d.summary ? `<div style="margin-top:14px"><button class="btn small ghost" id="clear-summary">Clear today's summary</button></div>` : ""}
          </div>
        </div>
        <div>
          <div class="section-head"><h2>Say it <em>like this</em></h2><span class="meta">Today's corrections</span></div>
          <div class="card">${corr.length ? corr.map(corrHTML).join("") : `<div class="empty">No corrections yet today.</div>`}</div>
        </div>
      </div>

      ${(m.reminders || []).filter((r) => !r.done).length ? `<div class="section"><div class="section-head"><h2>Reminders</h2><span class="meta">Say “remind me to … at 5” · ${esc(BN)} pops up on time</span></div>
        <div class="card"><div class="list">${(m.reminders || []).filter((r) => !r.done).sort((x, y) => x.dueAt.localeCompare(y.dueAt)).map((r) => `
          <div class="row"><span class="tag accent" style="margin:0">${esc(new Date(r.dueAt).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }))}</span>
          <span class="grow">${esc(r.text)}</span><span class="actions"><button class="icon-btn del" data-del-rem="${esc(r.id)}" title="Delete">✕</button></span></div>`).join("")}</div></div></div>` : ""}
      ${older.length ? `<div class="section"><div class="section-head"><h2>Earlier <em>corrections</em></h2><span class="meta">Last 30 days</span></div><div class="card">${older.map(corrHTML).join("")}</div></div>` : ""}
    </div>`;
    const edit = async (op) => { await window.ttm.editMemory(op); render(); };
    $$("[data-del-event]").forEach((b) => b.onclick = () => edit({ type: "event.delete", day: k, id: b.dataset.delEvent }));
    $$("[data-del-corr]").forEach((b) => b.onclick = () => edit({ type: "correction.delete", id: b.dataset.delCorr }));
    $("#clear-summary")?.addEventListener("click", () => edit({ type: "summary.clear", day: k }));
    $$("[data-del-rem]").forEach((b) => b.onclick = () => edit({ type: "reminder.delete", id: b.dataset.delRem }));
  }
  function corrHTML(c) {
    return `<div class="corr">
      <div class="said">${esc(c.said)}</div>
      <div class="better">${esc(c.better)}${c.type && c.type !== "none" ? `<span class="tag">${esc(c.type.replace("_", " "))}</span>` : ""}</div>
      ${c.why || c.betterWord ? `<div class="why">${esc(c.why || "")}${c.betterWord ? ` · 💡 ${esc(c.betterWord)}` : ""}</div>` : ""}
      <div class="side-actions"><button class="icon-btn del" data-del-corr="${esc(c.id)}" title="Delete">✕</button></div>
    </div>`;
  }

  // ================================================================== Projects
  function renderProjects(m) {
    const order = { blocked: 0, active: 1, paused: 2, done: 3 };
    const projects = m.projects.filter((p) => p.status !== "dropped").sort((a, b) => order[a.status] - order[b.status] || new Date(b.updated) - new Date(a.updated));
    const open = m.followups.filter((f) => !f.done);
    const done = m.followups.filter((f) => f.done && !f.expired).slice(-8).reverse();
    main.innerHTML = `<div class="page">
      <div class="eyebrow"><span>Projects</span><span class="sep"></span><span>${projects.filter((p) => p.status !== "done").length} active · ${open.length} follow-ups</span></div>
      <h1 class="display">What you're <em>building.</em></h1>
      <p class="lede">${esc(BN)} keeps track of your work and checks in on it. Mention progress while you talk and it updates by itself.</p>

      <div class="section grid g-3">
        ${projects.map((p) => `
          <div class="card proj">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><span class="status ${p.status}">${p.status}</span>
              <button class="icon-btn del" data-del-project="${esc(p.id)}" title="Delete">✕</button></div>
            <div class="pname">${esc(p.name)}</div>
            ${p.notes ? `<div class="pnotes">${esc(p.notes)}</div>` : ""}
            ${p.nextStep ? `<div class="pnext"><span>Next →</span> ${esc(p.nextStep)}</div>` : ""}
            <div class="pfoot"><span>Updated ${ago(p.updated)}</span>
              <select data-status="${esc(p.id)}">${["active", "blocked", "paused", "done"].map((s) => `<option ${s === p.status ? "selected" : ""}>${s}</option>`).join("")}</select></div>
          </div>`).join("")}
        <div class="card proj" style="justify-content:center;border-style:dashed;background:transparent">
          <div class="pname" style="color:var(--text-2)">New <em>project</em></div>
          <div class="inline-form"><input type="text" id="new-project" placeholder="e.g. Portfolio website" /><button class="btn primary" id="add-project">Add</button></div>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><h2>Follow-ups</h2><span class="meta">${esc(BN)} will ask you about these · they expire after 7 days</span></div>
        <div class="card"><div class="list">${open.map((f) => `
          <div class="row"><div class="grow"><div class="title">${esc(f.text)}<span class="tag accent">${esc(f.due)}</span></div><div class="sub">noted ${ago(f.created)}</div></div>
          <div class="actions"><button class="btn small" data-done="${esc(f.id)}">Mark done</button><button class="icon-btn del" data-del-fu="${esc(f.id)}" title="Delete">✕</button></div></div>`).join("") || `<div class="empty">Nothing pending.</div>`}</div></div>
      </div>
      ${done.length ? `<div class="section"><div class="section-head"><h2>Recently <em>done</em></h2></div><div class="card"><div class="list">${done.map((f) => `<div class="row"><span class="ok">✓</span><span class="grow">${esc(f.text)}</span><span class="muted small">${ago(f.doneAt)}</span></div>`).join("")}</div></div></div>` : ""}
    </div>`;
    const edit = async (op) => { await window.ttm.editMemory(op); render(); };
    $$("[data-status]").forEach((el) => el.addEventListener("change", () => edit({ type: "project.status", id: el.dataset.status, status: el.value })));
    $$("[data-del-project]").forEach((el) => el.addEventListener("click", () => confirm("Delete this project?") && edit({ type: "project.delete", id: el.dataset.delProject })));
    $$("[data-done]").forEach((el) => el.addEventListener("click", () => edit({ type: "followup.done", id: el.dataset.done })));
    $$("[data-del-fu]").forEach((el) => el.addEventListener("click", () => edit({ type: "followup.delete", id: el.dataset.delFu })));
    const add = () => { const n = $("#new-project").value.trim(); if (n) edit({ type: "project.add", name: n }); };
    $("#add-project").addEventListener("click", add);
    $("#new-project").addEventListener("keydown", (e) => e.key === "Enter" && add());
  }

  // ================================================================== Memory
  function renderMemory(m) {
    const days = Object.keys(m.days).sort().reverse().filter((k) => m.days[k].summary).slice(0, 14);
    main.innerHTML = `<div class="page">
      <div class="eyebrow"><span>Memory</span><span class="sep"></span><span>Stored only on this PC · details kept 30 days</span></div>
      <h1 class="display">What ${esc(BN)} <em>remembers.</em></h1>
      <p class="lede">Delete anything here, or just say it out loud: <b>“${esc(BN)}, forget the test stuff.”</b></p>

      <div class="section card">
        <div class="card-title"><span>Forget something</span><span>AI finds every related memory</span></div>
        <div class="inline-form"><input type="text" id="forget-text" placeholder="e.g. everything about the testing I did yesterday" /><button class="btn primary" id="forget-btn">Forget</button></div>
        <div id="forget-result" class="small muted" style="margin-top:10px"></div>
      </div>

      <div class="section grid g-2">
        <div>
          <div class="section-head"><h2>About <em>you</em></h2><span class="meta">${m.facts.length} facts</span></div>
          <div class="card"><div class="list">${m.facts.map((f) => `<div class="row"><span class="grow">${esc(f.text)}</span><span class="actions"><button class="icon-btn del" data-del-fact="${esc(f.id)}">✕</button></span></div>`).join("") || `<div class="empty">Nothing yet.</div>`}</div>
            <div class="inline-form" style="margin-top:14px"><input type="text" id="new-fact" placeholder="Add something about you" /><button class="btn" id="add-fact">Add</button></div></div>
        </div>
        <div>
          <div class="section-head"><h2>English <em>patterns</em></h2><span class="meta">Recurring mistakes</span></div>
          <div class="card">${m.patterns.length ? `<div class="chips">${m.patterns.map((p) => `<span class="chip">${esc(p)}<button data-del-pattern="${esc(p)}" title="Remove">×</button></span>`).join("")}</div>` : `<div class="empty">None yet.</div>`}</div>
          <div class="section-head" style="margin-top:28px"><h2>Past <em>days</em></h2><span class="meta">Summaries · last 30 days</span></div>
          <div class="card"><div class="list">${days.map((k) => `<div class="row"><div class="grow"><div class="title">${esc(fmtDay(k, { weekday: "short", day: "numeric", month: "short" }))}</div><div class="sub">${esc(m.days[k].summary)}</div></div><span class="actions"><button class="icon-btn del" data-clear-day="${k}" title="Forget this day's summary">✕</button></span></div>`).join("") || `<div class="empty">No history yet.</div>`}</div></div>
        </div>
      </div>

      <div class="section">
        <details><summary>See exactly what ${esc(BN)} is told before each conversation</summary><pre id="prompt">Loading…</pre></details>
        <p style="margin-top:22px;display:flex;gap:10px"><button class="btn" id="export">Export my data (JSON)</button><button class="btn danger" id="reset">Erase all memory</button></p>
      </div>
    </div>`;
    const edit = async (op) => { await window.ttm.editMemory(op); render(); };
    $$("[data-del-fact]").forEach((el) => el.onclick = () => edit({ type: "fact.delete", id: el.dataset.delFact }));
    $$("[data-del-pattern]").forEach((el) => el.onclick = () => edit({ type: "pattern.delete", text: el.dataset.delPattern }));
    $$("[data-clear-day]").forEach((el) => el.onclick = () => edit({ type: "summary.clear", day: el.dataset.clearDay }));
    const addFact = () => { const t = $("#new-fact").value.trim(); if (t) edit({ type: "fact.add", text: t }); };
    $("#add-fact").onclick = addFact;
    $("#new-fact").addEventListener("keydown", (e) => e.key === "Enter" && addFact());
    const forget = async () => {
      const t = $("#forget-text").value.trim();
      if (!t) return;
      $("#forget-btn").textContent = "Forgetting…";
      const r = await window.ttm.forget(t);
      $("#forget-btn").textContent = "Forget";
      if (r.ok) { toast(`Removed ${r.removed} item${r.removed === 1 ? "" : "s"}`); render(); setTimeout(() => { const el = $("#forget-result"); if (el) el.textContent = r.summary; }, 50); }
      else $("#forget-result").textContent = r.error;
    };
    $("#forget-btn").onclick = forget;
    $("#forget-text").addEventListener("keydown", (e) => e.key === "Enter" && forget());
    $("#export").onclick = async () => { const r = await window.ttm.exportData(); if (r.ok) toast("Exported ✓"); };
    $("#reset").onclick = () => confirm(`Erase everything ${BN} remembers? This can't be undone.`) && edit({ type: "reset" });
    $("details").addEventListener("toggle", async (e) => { if (e.target.open) $("#prompt").textContent = await window.ttm.getPrompt(); });
  }

  // ================================================================== Settings
  function seg(key, options, value) {
    return `<div class="seg" data-seg="${key}">${options.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(value) ? "on" : ""}">${l}</button>`).join("")}</div>`;
  }

  // ================================================================== Character studio
  const STY = AgentKit.styles, ORDER = Object.keys(STY);
  const STATES = [["idle", "Idle"], ["listening", "Listen"], ["thinking", "Think"], ["speaking", "Speak"], ["happy", "Happy"]];
  let studioAgents = [];
  let brandAgent = null;
  function destroyStudio() { studioAgents.forEach((a) => a.destroy()); studioAgents = []; }

  const sameHex = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
  // Which preset do these colours belong to? ("original", a preset name, or "custom")
  function detectPreset(styleId, c) {
    if (!c) return "original";
    const o = STY[styleId].colors;
    if (sameHex(c.body, o.body) && sameHex(c.accent, o.accent)) return "original";
    for (const p of AgentKit.PRESETS) {
      const a = AgentKit.adaptPreset(styleId, p);
      if (sameHex(c.body, a.body) && sameHex(c.accent, a.accent)) return p.name;
    }
    return "custom";
  }
  // The colours a character gets for a preset (custom colours are shared by every character)
  function presetColors(styleId, preset, custom) {
    if (preset === "custom" && custom) return { ...custom };
    if (!preset || preset === "original") return { ...STY[styleId].colors };
    const p = AgentKit.PRESETS.find((x) => x.name === preset);
    return p ? { ...AgentKit.adaptPreset(styleId, p), feature: custom && custom.feature && custom.feature !== "auto" ? custom.feature : "auto" } : { ...STY[styleId].colors };
  }

  function updateBrand(s) {
    const c = $("#brand-char");
    if (!c) return;
    const style = STY[s.characterStyle] ? s.characterStyle : "nori";
    if (!brandAgent) brandAgent = AgentKit.create(c, { style, colors: s.characterColors || undefined, size: 34, interactive: false });
    else if (brandAgent.styleId !== style || JSON.stringify(brandAgent.getConfig().colors) !== JSON.stringify(s.characterColors || {})) brandAgent.setStyle(style, s.characterColors || undefined);
  }

  function mountStudio(s) {
    const root = $("#studio");
    if (!root) return;
    let style = STY[s.characterStyle] ? s.characterStyle : "nori";
    let colors = { ...(s.characterColors || STY[style].colors) };
    if (!colors.feature) colors.feature = "auto";
    let preset = detectPreset(style, colors);
    let light = false;

    root.innerHTML = `
      <div class="studio">
        <div class="studio-stage" id="st-stage">
          <div class="stage-top"><span class="live-dot">Live preview</span>
            <div class="stage-toggle" title="Preview against a dark or light desktop"><button data-bg="dark" class="on">Dark</button><button data-bg="light">Light</button></div></div>
          <div class="stage-canvas"><canvas id="st-canvas"></canvas></div>
          <div class="stage-states">${STATES.map(([v, l]) => `<button data-st="${v}" class="${v === "idle" ? "on" : ""}">${l}</button>`).join("")}</div>
          <div class="stage-info">
            <div class="nm" id="st-name"></div><div class="tg" id="st-tag"></div>
            <dl class="traits"><dt>Personality</dt><dd id="st-pers"></dd><dt>Motion</dt><dd id="st-motion"></dd><dt>When happy</dt><dd id="st-happy"></dd></dl>
          </div>
        </div>
        <div class="studio-side">
          <div class="card"><div class="card-title"><span>Choose a character</span><span>12 originals · hover to say hi</span></div>
            <div class="char-grid" id="st-grid"></div></div>
          <div class="card"><div class="card-title"><span>Colours</span><span id="st-colname"></span></div>
            <div class="swatch-row" id="st-swatches"></div>
            <div class="color-pickers">
              <label class="picker"><input type="color" id="st-body"><div><span>Body</span><code id="st-body-v"></code></div></label>
              <label class="picker"><input type="color" id="st-accent"><div><span>Accent</span><code id="st-accent-v"></code></div></label>
              <label class="picker"><input type="color" id="st-feature"><div><span>Face</span><code id="st-feature-v"></code></div></label>
            </div>
            <div class="studio-foot">
              <label class="check"><input type="checkbox" id="st-auto"> Auto face contrast (eyes & mouth pick black or white)</label>
              <button class="btn small ghost" id="st-reset">Reset to original</button>
            </div>
          </div>
        </div>
      </div>`;

    // big live preview (click it to make it react)
    const preview = AgentKit.create($("#st-canvas"), { style, colors, size: 150 });
    studioAgents.push(preview);
    preview.on("state", (d) => $$(".stage-states button").forEach((b) => b.classList.toggle("on", b.dataset.st === d.state)));
    $$(".stage-states button").forEach((b) => b.onclick = () => {
      if (b.dataset.st === "speaking") preview.startTalking(); else preview.setState(b.dataset.st);
    });
    $$(".stage-toggle button").forEach((b) => b.onclick = () => {
      light = b.dataset.bg === "light";
      $("#st-stage").classList.toggle("light", light);
      $$(".stage-toggle button").forEach((x) => x.classList.toggle("on", x === b));
    });

    // the 12 tiles
    const tiles = {};
    ORDER.forEach((id, i) => {
      const t = document.createElement("button");
      t.className = "char-tile"; t.dataset.style = id; t.title = `${STY[id].name}: ${STY[id].tagline}`;
      t.innerHTML = `<span class="num">${String(i + 1).padStart(2, "0")}</span><canvas></canvas><span class="cn">${esc(STY[id].name)}</span>`;
      $("#st-grid").appendChild(t);
      const a = AgentKit.create(t.querySelector("canvas"), { style: id, colors: presetColors(id, preset, colors), size: 54, interactive: false });
      studioAgents.push(a);
      tiles[id] = { el: t, agent: a };
      t.onmouseenter = () => a.setState("happy", { then: "idle" });
      t.onclick = () => choose(id);
    });

    function syncInfo() {
      const st = STY[style];
      $("#st-name").textContent = st.name; $("#st-tag").textContent = st.tagline;
      $("#st-pers").textContent = st.personality; $("#st-motion").textContent = st.motionNote; $("#st-happy").textContent = st.happyNote;
      Object.entries(tiles).forEach(([id, t]) => t.el.classList.toggle("on", id === style));
    }
    function syncColors() {
      const pal = AgentKit.color.buildPalette(colors);
      $("#st-body").value = pal.body; $("#st-body-v").textContent = pal.body.toUpperCase();
      $("#st-accent").value = pal.accent; $("#st-accent-v").textContent = pal.accent.toUpperCase();
      $("#st-feature").value = pal.feature; $("#st-feature-v").textContent = pal.featureAuto ? "AUTO" : pal.feature.toUpperCase();
      $("#st-auto").checked = pal.featureAuto;
      $("#st-colname").textContent = preset === "original" ? `${STY[style].name} original` : preset === "custom" ? "Custom" : preset;
      // swatches are adapted to the current character (e.g. Bitbot keeps a dark screen)
      const list = [{ name: "original", label: "Original", ...STY[style].colors }, ...AgentKit.PRESETS.map((p) => ({ name: p.name, label: p.name, ...AgentKit.adaptPreset(style, p) }))];
      $("#st-swatches").innerHTML = list.map((p) => `<button class="swatch ${preset === p.name ? "on" : ""}" data-preset="${esc(p.name)}"><i style="background:linear-gradient(135deg, ${p.body} 0 55%, ${p.accent} 55% 100%)"></i>${esc(p.label)}</button>`).join("");
      $$("#st-swatches .swatch").forEach((b) => b.onclick = () => applyPreset(b.dataset.preset));
    }

    let saveTimer = null;
    function persist() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        await window.ttm.saveSettings({ characterStyle: style, characterColors: colors });
        updateBrand({ characterStyle: style, characterColors: colors });
        toast(`${STY[style].name} is on your desktop ✓`);
      }, 260);
    }
    function repaintTiles() { for (const id of ORDER) tiles[id].agent.setColors(presetColors(id, preset, colors)); }

    function choose(id) {
      if (id === style) { preview.setState("happy", { then: "idle" }); return; }
      style = id;
      colors = presetColors(id, preset, colors);
      preview.setStyle(style, colors);
      preview.setState("happy", { then: "idle" });
      syncInfo(); syncColors(); persist();
    }
    function applyPreset(name) {
      preset = name;
      colors = presetColors(style, preset, colors);
      preview.setColors(colors);
      repaintTiles(); syncColors(); persist();
    }
    function applyCustom(patch) {
      preset = "custom";
      colors = { ...colors, ...patch };
      preview.setColors(colors);
      repaintTiles(); syncColors(); persist();
    }
    $("#st-body").oninput = (e) => applyCustom({ body: e.target.value });
    $("#st-accent").oninput = (e) => applyCustom({ accent: e.target.value });
    $("#st-feature").oninput = (e) => applyCustom({ feature: e.target.value });
    $("#st-auto").onchange = (e) => applyCustom({ feature: e.target.checked ? "auto" : $("#st-feature").value });
    $("#st-reset").onclick = () => applyPreset("original");

    syncInfo(); syncColors();
  }

  function renderSettings(s) {
    const voices = ["marin", "cedar", "coral", "sage", "shimmer", "ballad", "alloy", "ash", "echo", "verse"];
    const running = { picovoice: "Picovoice · offline", openai: "OpenAI · cloud", off: "Off" }[s.wakeRunning] || "Off";
    const keyField = `
          <div class="field"><label>OpenAI API key<small>${s.hasKey ? `Saved · ${esc(s.keyHint)} · stored encrypted on this PC` : "Required, and the only thing you need"}</small></label>
            <div class="ctl"><input type="password" id="key" placeholder="${s.hasKey ? "Paste a new key to replace" : "sk-…"}" style="max-width:340px"/><button class="btn ${s.hasKey ? "" : "primary"}" id="save-key">Save</button><button class="btn ghost" id="test-key">Test</button></div></div>`;
    main.innerHTML = `<div class="page">
      <div class="eyebrow"><span>Settings</span><span class="sep"></span><span>Changes apply from your next conversation</span></div>
      <h1 class="display">${s.hasKey ? "Make it <em>yours.</em>" : "Let's get <em>started.</em>"}</h1>
      ${s.hasKey ? "" : `
      <div class="settings-group"><h3>1 · Add your OpenAI API key</h3>
        <p>That's the only setup. Create a key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a>, paste it below and press Save. It's stored encrypted on this computer and only ever sent to OpenAI.</p>
        <div class="card welcome-card">${keyField}</div></div>
      <div class="settings-group"><h3>2 · Say “Hey ${esc(BN)}”</h3><p>Or press Ctrl + Alt + Space. Everything below is optional.</p></div>`}

      <div class="settings-group"><h3>Character</h3><p>Pick your buddy and paint it. Saved instantly, and the one on your desktop changes right away.</p>
        <div id="studio"></div></div>

      <div class="settings-group"><h3>Basics</h3>
        <div class="card">
${s.hasKey ? keyField : ""}          <div class="field"><label>Buddy's name<small>The wake phrase follows it: “Hey ${esc(BN)}”. Pick a clear, 2–3 syllable name.</small></label><div class="ctl"><input type="text" data-text="buddyName" value="${esc(s.buddyName)}" maxlength="24" /></div></div>
          <div class="field"><label>Your name</label><div class="ctl"><input type="text" data-text="name" value="${esc(s.name)}" /></div></div>
          <div class="field"><label>First language<small>Helps catch typical mistakes</small></label><div class="ctl"><input type="text" data-text="nativeLanguage" value="${esc(s.nativeLanguage)}" placeholder="e.g. Telugu, Hindi, Kannada" /></div></div>
        </div></div>

      <div class="settings-group"><h3>Presence</h3><p>When ${esc(BN)} is on your screen.</p>
        <div class="card">
          <div class="field"><label>Auto-hide<small>Fades away after quiet minutes. Your hotkey or “Hey ${esc(BN)}” brings it back.</small></label>
            ${seg("autoHideMin", [[1, "1 min"], [3, "3 min"], [10, "10 min"], [0, "Always visible"]], s.autoHideMin)}</div>
          <div class="field"><label>Daily speaking goal<small>Shown on the dashboard</small></label>${seg("dailyGoalMin", [[5, "5 min"], [10, "10 min"], [15, "15 min"], [20, "20 min"]], s.dailyGoalMin)}</div>
          <div class="field"><label>Talk hotkey<small>Tap to start, tap again to stop</small></label>
            <div class="ctl"><select data-select="hotkey">${[["ctrl+alt+space", "Ctrl + Alt + Space"], ["ctrl+shift+space", "Ctrl + Shift + Space"], ["ctrl+alt+k", "Ctrl + Alt + K"]].map(([v, l]) => `<option value="${v}" ${s.hotkey === v ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
          <div class="field"><label>End chat after silence<small>Saves API cost when you walk away</small></label>${seg("autoSleepSec", [[45, "45 s"], [75, "75 s"], [120, "2 min"], [300, "5 min"]], s.autoSleepSec)}</div>
          <div class="field"><label>Check-in bubbles<small>Text-only reminders, never speaks by itself</small></label>${seg("nudges", [[false, "Off"], [true, "On"]], s.nudges)}</div>
          <div class="field"><label>Start with Windows</label>${seg("startWithWindows", [[true, "On"], [false, "Off"]], s.startWithWindows)}</div>
        </div></div>

      <div class="settings-group"><h3>Wake word</h3><p>Works out of the box. Optional: a free Picovoice key makes it fully offline. Running now: <span class="${s.wakeRunning === "off" ? "err" : "ok"}">${running}</span></p>
        <div class="card">
          <div class="field"><label>Mode<small>Auto uses Picovoice when it's set up, otherwise OpenAI</small></label>${seg("wakeWord", [["auto", "Auto"], ["picovoice", "Picovoice"], ["openai", "OpenAI"], ["off", "Off"]], s.wakeWord)}</div>
          <div class="field"><label>Picovoice AccessKey<small>${s.hasPvKey ? "Saved ✓" : "Free at console.picovoice.ai"}</small></label>
            <div class="ctl"><input type="password" id="pvkey" placeholder="${s.hasPvKey ? "Paste to replace" : "AccessKey"}" style="max-width:320px"/><button class="btn" id="save-pvkey">Save</button></div></div>
          <div class="field"><label>Offline wake-word model<small>${s.picovoicePpn ? "Loaded ✓" : "The .ppn file trained on Picovoice Console (Windows)"}</small></label><div class="ctl"><button class="btn" id="pick-ppn">Choose .ppn file…</button></div></div>
          <div class="field"><label>Sensitivity</label>${seg("wakeSensitivity", [[0.45, "Low"], [0.6, "Medium"], [0.75, "High"]], s.wakeSensitivity)}</div>
        </div></div>

      <div class="settings-group"><h3>Voice & coaching</h3>
        <div class="card">
          <div class="field"><label>Voice<small>marin and cedar sound the most human</small></label><div class="ctl"><select data-select="voice">${voices.map((v) => `<option ${v === s.voice ? "selected" : ""}>${v}</option>`).join("")}</select></div></div>
          <div class="field"><label>Speaking speed</label>${seg("voiceSpeed", [[0.9, "Slower"], [1, "Normal"], [1.1, "Faster"]], s.voiceSpeed)}</div>
          <div class="field"><label>Reply speed<small>How long it waits when you pause</small></label>${seg("replySpeed", [["quick", "Quick"], ["balanced", "Balanced"], ["patient", "Patient"]], s.replySpeed)}</div>
          <div class="field"><label>Coach style</label>${seg("coachStyle", [["gentle", "Gentle"], ["push", "Pushes me"], ["tough", "Tough love"]], s.coachStyle)}</div>
          <div class="field"><label>Corrections</label>${seg("correctionLevel", [["light", "Big mistakes only"], ["normal", "Normal"], ["strict", "Strict"]], s.correctionLevel)}</div>
        </div></div>

    </div>`;

    mountStudio(s);
    const save = async (patch) => { await window.ttm.saveSettings(patch); toast("Saved"); };
    $$("[data-text]").forEach((el) => el.addEventListener("change", async () => {
      const v = el.value.trim();
      if (el.dataset.text === "buddyName" && !v) { el.value = s.buddyName; return; }
      await save({ [el.dataset.text]: v });
      if (el.dataset.text === "buddyName") render();
    }));
    $$("[data-select]").forEach((el) => el.addEventListener("change", () => save({ [el.dataset.select]: el.value })));
    $$("[data-seg]").forEach((g) => $$("button", g).forEach((b) => b.addEventListener("click", async () => {
      let v = b.dataset.v;
      v = v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v;
      await save({ [g.dataset.seg]: v });
      $$("button", g).forEach((x) => x.classList.toggle("on", x === b));
      if (g.dataset.seg === "wakeWord") render();
    })));
    $("#save-key").onclick = async () => {
      const k = $("#key").value.trim(); if (!k) return;
      $("#save-key").textContent = "Checking…";
      await window.ttm.setKey(k);
      const r = await window.ttm.testKey();
      toast(r.ok ? `You're all set. Say “Hey ${BN}” ✓` : `Saved, but OpenAI said: ${r.error}`);
      render();
    };
    $("#test-key").onclick = async (e) => { e.target.textContent = "Testing…"; const r = await window.ttm.testKey(); e.target.textContent = "Test"; toast(r.ok ? "Key works ✓" : r.error); };
    $("#save-pvkey").onclick = async () => { const k = $("#pvkey").value.trim(); if (!k) return; const r = await window.ttm.setPvKey(k); toast(r.wakeRunning === "picovoice" ? "Offline wake word running ✓" : "AccessKey saved"); render(); };
    $("#pick-ppn").onclick = async () => { const r = await window.ttm.pickPpn(); toast(r.wakeRunning === "picovoice" ? `“Hey ${BN}” is listening offline ✓` : r.picovoicePpn ? ".ppn saved. Add your AccessKey too." : "No file chosen"); render(); };
  }

  go(tab);
})();
