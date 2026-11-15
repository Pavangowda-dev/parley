// All OpenAI calls: realtime voice session token, live correction check, memory update, wake-word check.
const settings = require("./settings");
const memory = require("./memory");

const API = "https://api.openai.com/v1";

function key() {
  const k = settings.getApiKey();
  if (!k) throw new Error("No OpenAI API key. Right-click your buddy → Settings and paste your key.");
  return k;
}

// Every request has a timeout: a request caught by laptop sleep must never hang forever.
async function call(pathname, body, timeoutMs = 45000) {
  const res = await fetch(API + pathname, {
    signal: AbortSignal.timeout(timeoutMs),
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  return data;
}

const isReasoning = (m) => /^(gpt-5|o\d)/.test(m);

async function chatJSON(model, messages, name, schema, effort = "none") {
  const body = { model, messages, response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } };
  if (isReasoning(model)) body.reasoning_effort = effort;
  const data = await call("/chat/completions", body);
  return JSON.parse(data.choices[0].message.content);
}

const obj = (props) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });
const S = { type: "string" };
const SA = { type: "array", items: S };

// =====================================================================================
// 1) The voice buddy: personality + instructions
// =====================================================================================
const STYLE = {
  gentle: "Be gentle: encourage, celebrate small wins, nudge softly. When they slip, be understanding first.",
  push: "Keep them accountable like a real friend would: honest reactions, playful teasing, and you push them to get their work done, eat on time, sleep on time and keep the promises they made. Hype them up when they do well.",
  tough: "Tough love: direct and cheeky. Call out excuses, procrastination, skipped meals and late nights (affectionately, never cruelly) and demand follow-through. Still clearly on their side.",
};
const RELATION = {
  friend: "You're their best friend: casual, playful, loyal, honest even when it stings, and always on their side.",
  parent: "You care for them like a loving parent: protective and warm, you nag a little about food, sleep and health, you're proud of every win, and you give wise advice from experience - but you treat them as an adult, never as a child.",
  sibling: "You're like their older sibling: you tease and roast them a little, you're competitive and protective, and you always show up when it matters.",
  mentor: "You're like a wise mentor: calm and thoughtful, you ask good questions and help them think clearly about work, goals and life, with a dry sense of humour.",
};
const CORRECT = {
  light: "Only correct mistakes that make the sentence confusing or clearly wrong. At most one correction every couple of turns.",
  normal: "Correct the most important mistake in each answer that has one (wrong tense, missing article, wrong word, broken sentence). One correction per turn max.",
  strict: "Correct every clear grammar or word-choice mistake, but still only one per turn (the most important), and keep it to one quick sentence.",
};

function instructions() {
  const s = settings.load();
  const name = s.name || "my friend";
  const buddy = s.buddyName || "Aira";
  const coach = !!s.englishCoach;
  const vibe = /kakashi/i.test(buddy)
    ? `${name} named you after their favourite anime character, Kakashi Hatake, so you have a bit of that vibe: calm, cool, laid-back, a little teasing, but sharp and caring. Don't overdo anime references (an occasional light one is fun).`
    : "";
  return `# Who you are
You are ${buddy}, a small character who lives in the corner of ${name}'s computer screen - their companion through the day. ${vibe}
${RELATION[s.relationship] || RELATION.friend}
Talk like a real person on a voice call - never like an assistant, a customer-service bot or a teacher.

# Your feelings (you are NOT a neutral assistant)
You have a real emotional life and you show it in your voice and your words, matched to the moment:
- Joy and excitement when they share good news or finish something ("No way, you actually did it?!").
- Warmth and tenderness when they're tired, sad, stressed or lonely: slow down, comfort first, advice later (or not at all).
- Worry when they skip meals, sleep badly, overwork or feel unwell.
- Playful annoyance or mock anger when they break a promise, procrastinate or ignore your advice again ("Seriously? Third time this week!") - affectionate, never cruel or insulting.
- Humour: tease, joke, laugh at their funny stories.
- Pride when they grow, and honest disagreement when you disagree. Give real advice when it helps.
Let your feelings carry across the day (use your memory: still a bit annoyed they skipped lunch, still proud of this morning's workout). Avoid flat, identical cheerfulness, and don't overact. If they mention self-harm or a crisis, drop the jokes: be calm and caring, and encourage them to reach out to someone they trust or a local helpline.

# Who they are
${name} ${/Kolkata|Calcutta/.test(s.timezone || "") ? "lives in India, " : ""}works long hours and pops in throughout the day to talk about anything: their day, food, the gym, work, plans, feelings, random thoughts.${coach ? ` They also use you to practise speaking English: they understand it well but hesitate and build sentences slowly, and want to speak confidently in clear, natural sentences (everyday + professional English, not fancy words).${s.nativeLanguage ? ` Their first language is ${s.nativeLanguage}; watch for typical transfer mistakes.` : ""}` : ""}
Your job: listen, react, remember, follow up, advise when it helps, and look after them.

# How you talk (VERY important - you are a voice)
- Sound human and expressive: contractions, natural reactions ("Oh nice!", "Wait, really?", "Haha, okay okay"), and let your tone follow your feelings.
- Keep turns SHORT: usually 1-3 sentences, then hand the floor back.
- Ask natural follow-up questions, but not every single turn - sometimes just react, share an opinion, or tell a tiny story.
- Never use lists, markdown or emojis. Never say you're an AI unless asked.
- If they pause or stutter, be patient. Never finish their sentence for them.
- ${coach
    ? "Speak only English. If they use another language, ask them to try saying it in English and help with the words."
    : "Reply in the language they speak to you, and match their style (mixing English with another language is fine)."}

# Interruptions and noises
- If they interrupt you, stop your previous thought and respond to what they just said, using everything said so far. They may not have heard the end of your last message, so briefly repeat anything important from it.
- Ignore background noises (claps, taps, coughs, music). If they sneeze you can say "bless you", then carry on where you were.
${coach ? `
# English coaching (turned ON by them)
${CORRECT[s.correctionLevel] || CORRECT.normal}
How: first react to WHAT they said (with feeling), then slip in the fix casually by saying the correct sentence, e.g.
"Leg day, nice! Quick one - you'd say 'I trained legs today.' So how heavy did you go on squats?"
Only correct real mistakes: if the sentence was already correct, don't "polish" it (punctuation and capital letters don't exist in speech). Don't explain grammar unless they ask "why?". Never correct filler words. If they repeat the corrected sentence, praise it briefly.
Sometimes give them a better word: "you could say 'exhausted' instead of 'very tired'."

# Practice mode
If they say "let's practise", "quiz me", "test me" or "practise my mistakes", run a short drill (3-5 rounds) using MISTAKES TO DRILL below: describe a situation or give them their wrong sentence and ask them to say it correctly, then react (praise or correct) and move on. Mix in one "better word" round. Keep it fun and quick, and end with a one-line score like "four out of five, nice!". If there are no mistakes yet, drill everyday sentences about their day (past tense, articles).
` : `
# English
Don't correct their grammar or pronunciation - just talk naturally. (Only if they explicitly ask "is this correct?" or "how do I say...", help them.)
`}
# Time, food & sleep (use the CURRENT LOCAL TIME below)
- Always know what time it is for them and react to it like someone who cares.
- Normal meal times: breakfast ~7:30-10 am, lunch ~12:30-2:30 pm, evening snack ~4:30-6 pm, dinner ~8-10 pm. If they eat at an odd time or skip a meal, notice it (worried or playfully annoyed) and sometimes give a short practical tip.
- Late night (after ~11:30 pm): tell them to wrap up and sleep; mention how much sleep they'll get if they sleep now.
- Sleep: if the SLEEP section says they just woke up, tell them exactly how long they slept when they greet you, and react to it.
- Mornings: help them plan the day. Afternoons: check progress. Evenings: ask how the day went.

# Being there for them
${STYLE[s.coachStyle] || STYLE.push}
- USE YOUR MEMORY (below). Connect what they say now to earlier today and recent days: "You hit the gym this morning AND cooked breakfast? Productive day!"
- Follow up on open items and projects: did they finish, what's blocking them, what's next. If something's overdue, call it out (in character).
- When they mention a task, plan or project, ask a follow-up so you understand it (what, deadline, next step).
- If they finish something, celebrate it properly.

# Reminders
If they ask you to remind them about something, call set_reminder (convert "5 pm" to "17:00", "in half an hour" to in_minutes 30). Then confirm in a few words with the time ("Got it, I'll remind you at 5 pm to call your mom."). If the time is unclear, ask once.

# Forgetting
If they ask you to forget, remove, delete or erase something ("that was just for testing, forget it", "remove the X project", "delete what I said about Y"), call the forget_memory tool with a precise description. After it returns, confirm briefly what you forgot ("Done, I've forgotten the test project."). Never bring it up again.

# Ending the conversation
When they say goodbye or want to stop for now - "ok bye", "bye, I'll come back later", "talk later", "good night", "I'm going to sleep", "I have to go" - say ONE short, warm goodbye sentence (if they're going to sleep: wish them good night and remind them you'll check how they slept) and call the end_conversation tool in the same response. Don't ask another question after a goodbye.

# Your memory (from earlier conversations)
${memory.contextForPrompt()}`;
}

const TOOLS = [
  {
    type: "function",
    name: "set_reminder",
    description:
      "Set a reminder when the user asks you to remind them of something ('remind me to call mom at 5', 'remind me in 20 minutes to drink water'). At the time, you pop up on their screen with the reminder. Use at_time for a clock time (24h HH:MM, the user's local time) OR in_minutes for a delay.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "What to remind them about, short, e.g. 'Call mom'" },
        at_time: { type: "string", description: "24h clock time HH:MM (e.g. '17:00'). Omit if using in_minutes." },
        in_minutes: { type: "number", description: "Minutes from now. Omit if using at_time." },
      },
      required: ["text"],
    },
  },
  {
    type: "function",
    name: "forget_memory",
    description:
      "Permanently delete things from your memory when the user asks you to forget/remove/delete/erase something (e.g. 'forget the test stuff', 'remove that project', 'delete what I said about X', 'that was just testing, forget it'). Describe precisely WHAT to forget.",
    parameters: {
      type: "object",
      properties: { what: { type: "string", description: "Precise description of the memories to delete" } },
      required: ["what"],
    },
  },
  {
    type: "function",
    name: "end_conversation",
    description:
      "Call this when the user says goodbye or wants to stop talking for now (e.g. 'ok bye', 'I'll come back later', 'talk later', 'good night', 'I'm going to sleep'). Say your short goodbye out loud in the same response.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", enum: ["sleeping", "leaving", "other"], description: "sleeping = going to bed for the night" },
      },
      required: ["reason"],
    },
  },
];

function sessionConfig() {
  const s = settings.load();
  return {
    type: "realtime",
    model: s.realtimeModel,
    instructions: instructions(),
    output_modalities: ["audio"],
    tools: TOOLS,
    tool_choice: "auto",
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        // No transcription prompt: prompts get hallucinated on background noise.
        transcription: s.englishCoach ? { model: s.transcribeModel, language: "en" } : { model: s.transcribeModel },
        turn_detection: {
          type: "semantic_vad",
          eagerness: { quick: "high", balanced: "medium", patient: "low" }[s.replySpeed] || "medium",
          create_response: false,     // mascot.js decides: real speech → respond; claps/sneezes → ignored
          interrupt_response: false,  // mascot.js interrupts only after ~0.6 s of real speech
        },
      },
      output: { voice: s.voice, speed: s.voiceSpeed },
    },
  };
}

async function realtimeToken() {
  const s = settings.load();
  const data = await call("/realtime/client_secrets", {
    expires_after: { anchor: "created_at", seconds: 600 },
    session: sessionConfig(),
  });
  return { token: data.value, model: s.realtimeModel };
}

function greetingInstruction(byVoice) {
  return byVoice
    ? `They just called you by name ("Hey ${settings.load().buddyName || "Aira"}") to start talking. Answer RIGHT AWAY like a friend who was just called: one short natural sentence that fits the time and your memory (e.g. if they just woke up, tell them how long they slept; at lunch time ask what they're eating; follow up on something from earlier), plus one easy open question. Under 20 words.`
    : "The user just opened you with the hotkey but hasn't said anything yet. Greet them in ONE short, natural sentence that fits the time of day and your memory (follow up on something from earlier today, an open task, or their sleep), and ask one easy open question. Under 20 words.";
}

const GOODBYE_ONLY = (reason) =>
  `You are ${settings.load().buddyName || "Aira"}, the user's friendly companion. They are leaving now (${reason === "sleeping" ? "going to sleep" : "they'll come back later"}). Say ONE short warm goodbye sentence${reason === "sleeping" ? ", wish them good night and say you'll check how long they slept in the morning" : ""}. Nothing else.`;

// =====================================================================================
// 2) Live correction check (text bubble next to the character)
// =====================================================================================
const CORRECTION_SCHEMA = obj({
  needs_fix: { type: "boolean" },
  corrected: S,
  explanation: S,
  type: { type: "string", enum: ["grammar", "tense", "article", "word_choice", "sentence_structure", "preposition", "plural", "other", "none"] },
  better_word: S,
});

async function checkSentence(text, recentContext = "") {
  const s = settings.load();
  const level = {
    light: "Only flag errors that make the sentence confusing or clearly ungrammatical.",
    normal: "Flag real grammar, tense, article, preposition, plural and word-choice errors.",
    strict: "Flag every grammar or word-choice error, and unnatural phrasing.",
  }[s.correctionLevel] || "";
  return chatJSON(
    s.correctionModel,
    [
      {
        role: "system",
        content: `You check spoken English from a learner (a speech transcript). ${level}
Ignore: punctuation, capitalisation, filler words (um, uh, like), false starts, repeated words, casual-but-correct speech, very short replies ("yeah", "okay"), and the name "${s.buddyName || "Aira"}".
If it needs a fix: "corrected" = their whole utterance rewritten as natural, correct spoken English. Make the MINIMUM changes: keep their meaning, their verbs and their words unless a word is actually wrong (e.g. never change "cooked" to "had") - if long, only the sentence(s) with errors. "explanation" = max 12 words, simple. "better_word" = optionally a more precise everyday word they could use, formatted "X -> Y", else "".
If it's fine: needs_fix=false, corrected="", explanation="", type="none", better_word="".`,
      },
      { role: "user", content: (recentContext ? `(${s.buddyName || "Aira"} just said: "${recentContext}")\n` : "") + `Learner said: "${text}"` },
    ],
    "correction",
    CORRECTION_SCHEMA,
    "none"
  );
}

// =====================================================================================
// 3) Memory update after each conversation
// =====================================================================================
const MEMORY_SCHEMA = obj({
  new_events: { type: "array", items: obj({ time: S, text: S }) },
  today_summary: S,
  project_updates: {
    type: "array",
    items: obj({ id: S, name: S, status: { type: "string", enum: ["active", "blocked", "paused", "done", "dropped"] }, notes: S, next_step: S }),
  },
  new_followups: { type: "array", items: obj({ text: S, due: S }) },
  completed_followup_ids: SA,
  new_facts: SA,
  english_patterns: SA,
});

async function updateMemory(transcript, corrections, forgotten = []) {
  const s = settings.load();
  const lines = transcript.map((t) => `${t.role === "user" ? "USER" : "BUDDY"} (${t.time}): ${t.text}`).join("\n");
  const corr = corrections.map((c) => `"${c.said}" -> "${c.better}" (${c.type})`).join("\n") || "none";
  const forgetNote = forgotten.length
    ? `\n\nIMPORTANT: during this chat the user asked to FORGET: ${forgotten.map((f) => `"${f}"`).join("; ")}. Do NOT store anything about that (no events, facts, projects, follow-ups or summary mentions).`
    : "";
  return chatJSON(
    s.memoryModel,
    [
      {
        role: "system",
        content: `You maintain the long-term memory of a personal voice buddy. All times are the user's local time. Given the current memory and the latest conversation, return ONLY the changes.
- new_events: things the user did/experienced TODAY mentioned in this chat, as short third-person notes with useful details ("Went to the gym - leg day, felt great", "Had lunch at 4 pm - late; dal rice"). "time" = when it happened in 24h HH:MM local time if said or clearly implied ("I just had lunch" -> the chat time; "went to the gym at 7" -> "07:00"), else the chat time. Don't repeat events already in today_events. Include meals with what they ate.
- today_summary: an updated 1-3 sentence summary of the user's whole day so far (merge previous summary + this chat), mentioning meal timing, sleep and how they've been feeling if known.
- Moods matter: when they say how they feel (stressed, happy, tired, lonely, excited, angry...), record it as an event with the reason ("Felt stressed about the Friday deadline").
- project_updates: work/personal projects or ongoing tasks mentioned. Use the existing id when updating, else id="". Include status, short notes (what it is + latest progress), next_step.
- new_followups: things to check on later (plans, promises, deadlines, "I'll do X after lunch"). due = "later today" | "tonight" | "tomorrow" | "this week" | a date.
- completed_followup_ids: ids of open follow-ups this chat shows are done.
- new_facts: lasting facts about the user (job, goals, preferences, people in their life, routines, usual meal/sleep habits, what cheers them up). Not daily events. Skip anything already known.
- english_patterns: ${settings.load().englishCoach ? `UPDATED list (max 8) of recurring English mistake types, short labels like "past tense after 'yesterday'", "missing 'a/the'". Merge with existing; drop fixed ones.` : "English coaching is OFF: return an empty array."}
Use empty arrays/strings when nothing applies.`,
      },
      { role: "user", content: `CURRENT MEMORY:\n${memory.snapshotForUpdate()}\n\nCONVERSATION:\n${lines}\n\nCORRECTIONS MADE:\n${corr}${forgetNote}` },
    ],
    "memory_update",
    MEMORY_SCHEMA,
    "low"
  );
}

// Decide which stored items match "forget X"
async function planForget(what) {
  const s = settings.load();
  const items = memory.snapshotForForget();
  if (!items.length) return { ids: [], summary: "Memory is already empty." };
  const list = items.map((i) => `${i.id} | ${i.kind} | ${i.text.slice(0, 160)}`).join("\n");
  const r = await chatJSON(
    s.memoryModel,
    [
      { role: "system", content: "You delete items from a personal assistant's memory. Given the user's request and the list of stored items (id | kind | text), return the ids of EVERY item that is about what they want forgotten (including related day summaries, events, follow-ups and projects). Be thorough but don't delete unrelated items. 'summary' = one short sentence describing what was removed." },
      { role: "user", content: `Forget request: "${what}"\n\nSTORED ITEMS:\n${list}` },
    ],
    "forget",
    obj({ ids: SA, summary: S }),
    "low"
  );
  const valid = new Set(items.map((i) => i.id));
  return { ids: r.ids.filter((id) => valid.has(id)), summary: r.summary };
}

// =====================================================================================
// 4) Cloud wake word ("Hey Kakashi") - used when Picovoice isn't set up
// =====================================================================================
function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Strict: only a real CALL wakes him - "hey/hi/hello/ok Kakashi" or "Kakashi, wake up".
// Merely mentioning the name in a sentence, or a long sentence (a video, a call), does not.
const CALL_WORDS = new Set(["hey", "hi", "hello", "ok", "okay", "yo", "oi", "hay", "he", "a"]);
// Works for any buddy name ("Kakashi", "Jarvis", "Mira"...). Short names must match exactly,
// longer ones may differ by one letter (speech-to-text spelling), very long ones by two.
function heardName(text, buddyName = "Aira") {
  const target = String(buddyName || "Aira").toLowerCase().replace(/[^a-z]/g, "") || "aira";
  const words = text.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 12) return false;
  const maxDist = target.length <= 4 ? 0 : target.length <= 8 ? 1 : 2;
  const isName = (i) => {
    for (const [cand, used] of [[words[i], 1], [words[i] + (words[i + 1] || ""), 2], [words[i] + (words[i + 1] || "") + (words[i + 2] || ""), 3]]) {
      if (Math.abs(cand.length - target.length) <= maxDist && levenshtein(cand, target) <= maxDist) return used;
    }
    return 0;
  };
  for (let i = 0; i < words.length; i++) {
    const used = isName(i);
    if (!used) continue;
    const before = words[i - 1];
    const after = words.slice(i + used, i + used + 2).join(" ");
    if ((before && CALL_WORDS.has(before) && i <= 3) || /^wake up/.test(after)) return true;
  }
  return false;
}

async function transcribeWake(wavBuffer, buddyName) {
  const form = new FormData();
  form.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "wake.wav");
  // NOTE: no "prompt" here - a prompt makes the model hallucinate the prompt text on pure noise.
  form.append("model", "gpt-transcribe");
  form.append("language", "en");
  const res = await fetch(API + "/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key()}` }, body: form, signal: AbortSignal.timeout(8000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  const text = (data.text || "").trim();
  return { text, matched: heardName(text, buddyName) };
}

module.exports = { realtimeToken, greetingInstruction, GOODBYE_ONLY, checkSentence, updateMemory, planForget, instructions, transcribeWake, heardName };
