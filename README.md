<h1 align="center">Parley</h1>

<p align="center"><b>A voice buddy that lives in the corner of your screen and helps you speak English with confidence.</b><br>
Say <i>"Hey Aira"</i> (or any name you choose), talk about your day, and your buddy talks back like a friend. It corrects your English as you go, remembers your life and keeps you on track.</p>

<p align="center">Windows · runs on your own computer · no account, no server · all you need is an OpenAI API key</p>

---

## Contents
1. [Why this exists](#why-this-exists)
2. [What it can do](#what-it-can-do)
3. [How it works](#how-it-works)
4. [Install on your computer (step by step)](#install-on-your-computer-step-by-step)
5. [Add your OpenAI API key](#add-your-openai-api-key)
6. [Your first conversation](#your-first-conversation)
7. [Things you can say](#things-you-can-say)
8. [The dashboard](#the-dashboard)
9. [Settings explained](#settings-explained)
10. [Optional: offline wake word](#optional-offline-wake-word)
11. [Privacy and your data](#privacy-and-your-data)
12. [What it costs](#what-it-costs)
13. [Troubleshooting](#troubleshooting)
14. [Update and uninstall](#update-and-uninstall)
15. [For developers](#for-developers)
16. [License](#license)

---

## Why this exists

Many people **understand English well but freeze when they have to speak it**. They hesitate, stutter and build sentences slowly. The fix is daily speaking practice, but busy people rarely have someone to talk to.

Parley gives you that someone: **Aira**, a small animated buddy on your desktop (rename it to anything you like). Whenever you have a minute, after the gym, while cooking, or between work tasks, you call it and just talk. It listens, answers naturally, quietly fixes your mistakes, and remembers everything, so the next conversation picks up where you left off.

```
You (8:10 am):   "Hey Aira, I went to gym today and it was really good for me, I worked on legs."
Aira:            "Leg day, nice! Quick one: you'd say 'I trained legs today.' So what's the plan for work?"
                 [bubble]  Say it like this: "I went to the gym today and it was really good. I trained legs."

You (4:05 pm):   "I am having lunch now, I cooked dal rice."
Aira:            "Lunch at four? That's basically snack time! Want me to remind you at one tomorrow?"

You (12:40 am):  "Okay bye, I'm going to sleep."
Aira:            "Good night! I'll check how long you slept."         (it hangs up by itself)

You (7:05 am):   "Hey Aira, good morning!"
Aira:            "Morning! Six hours twenty-five. Let's aim for seven tonight. Big day ahead?"
```

---

## What it can do

### 🗣️ Real conversations
- **Natural voice.** It hears your actual voice and answers by voice, in under a second. You can interrupt it any time.
- **Starting a chat.** Say **"Hey Aira"** (or whatever name you give it), press **Ctrl + Alt + Space**, or click it.
- **Ending a chat.** Say **"bye"**, **"talk later"** or **"good night"** and it says goodbye and hangs up. It also hangs up by itself after a silence.
- **Patient listening.** Pause to think as long as you need; it waits until you've finished your thought.

### ✏️ English coaching
- **Gentle corrections.** It repeats your sentence the right way, casually, like a friend would.
- **Correction bubbles.** A small bubble shows the exact fix, a short reason and a better word to use.
- **Practice mode.** Say *"quiz me"* and it drills the mistakes **you** actually made this week.
- **Your recurring mistakes.** It tracks patterns (like "past tense after *yesterday*") and praises you when you get them right.

### 🧠 A buddy who remembers
- **Your day.** Meals, gym, work and sleep go into a timeline in your local time.
- **Time awareness.** It notices a late lunch, a skipped breakfast or a late night, and gives a friendly tip.
- **Sleep.** "Good night" followed by "good morning" means *"you slept 6 h 25 m"*.
- **Projects and follow-ups.** *"Did you finish that API?"* Follow-ups nobody mentions expire after a week.
- **Reminders.** *"Remind me to call mom at 5"*. It pops up on time, even while hidden.
- **Forgetting.** *"Forget the test stuff"* deletes every related memory for good.

### 🎨 Twelve characters, any colour
- **Character studio** (Settings → Character): **Nori, Lumi, Drop, Kumo, Bitbot, Pip, Miso, Boo, Sprout, Tok, Wisp** and **Medu**. Each has its own personality, movement and happy dance.
- **Colours.** Nine one-click colour themes, or pick your own body, accent and face colours. A live preview shows the result on a dark or light background.
- **Feels alive.** Real lip-sync from its voice, eyes that follow your mouse across the whole screen, blinking, breathing and bouncy physics.
- **Rename it.** "Hey Jarvis" works if you call it Jarvis.

### 📊 A dashboard that shows your progress
Streak, speaking minutes, words spoken, vocabulary size, sentence accuracy, sleep, a daily goal, 30-day charts, a "when you talk" heatmap, mistake types, filler words, your most-used words and new words. [More below.](#the-dashboard)

### 🪶 Light on your computer
- **Hidden when quiet.** It fades away after a few quiet minutes and nothing is drawn while it's hidden.
- **Battery-friendly.** It runs at 30 fps when calm.
- **No keyboard or mouse hooks.** Your touchpad and typing are never affected.
- **Recovers by itself.** If its window crashes, it restarts it. After sleep or unlock, its microphone listener restarts.

---

## How it works

Everything runs **on your computer**. The app talks directly to OpenAI with your own key; there is no server in between.

```
  "Hey Aira"
       │
       ▼
 ┌────────────────┐   short voice clip    ┌──────────────────────────┐
 │  Wake word     │ ────────────────────► │ OpenAI speech-to-text     │  (or offline with Picovoice)
 └────────────────┘   "was it my name?"   └──────────────────────────┘
       │ yes
       ▼
 ┌────────────────┐   live voice (WebRTC)  ┌──────────────────────────┐
 │  The buddy     │ ◄────────────────────► │ OpenAI Realtime voice    │  hears you, answers by voice
 │  pops up       │                        │ model                    │
 └────────────────┘                        └──────────────────────────┘
       │ what you said (text)                     ▲
       ▼                                          │ its "memory" is sent at the start of
 ┌────────────────┐                               │ every chat: local time, today's timeline,
 │ Grammar check  │ ─► correction bubble          │ sleep, projects, reminders, your mistakes
 └────────────────┘                               │
       │ when you say "bye"                       │
       ▼                                          │
 ┌────────────────┐                        ┌──────┴───────────────────┐
 │ Memory update  │ ─────────────────────► │ memory.json on your PC   │
 └────────────────┘   events, projects,    └──────────────────────────┘
                      follow-ups, patterns
```

Step by step, one conversation looks like this:

1. **Waiting.** While it's idle, a light listener checks short bursts of speech for its name. Long talking (videos, calls) is ignored.
2. **Waking up.** When it hears *"Hey Aira"* it pops up with a little hop and opens a live voice connection to OpenAI. Before the first word, it gets a compact summary of your memory: the local time, what you did today, how you slept, your projects, your reminders and your usual mistakes.
3. **Talking.** You speak naturally and it hears your real voice and answers by voice. Under the hood it can use three tools: **set a reminder**, **forget something** and **end the conversation**.
4. **Correcting.** Each thing you say is also turned into text and checked for grammar. If there's a mistake, a bubble shows the fix.
5. **Remembering.** When the chat ends, a separate model reads it and updates its memory: new events, projects, follow-ups and mistake patterns.
6. **Going quiet.** After a few quiet minutes it fades away until you call it again.

---

## Install on your computer (step by step)

**You need:** Windows 10 or 11, a microphone (a laptop mic or headset is fine), an internet connection and an [OpenAI API key](#add-your-openai-api-key).

There are two ways to install. **Option A works on every PC** and takes about 5 minutes.

### Option A: run from source (recommended)

**Step 1. Install Node.js.**
Go to [nodejs.org](https://nodejs.org), download the **LTS** version and run the installer with the default options. To check it worked, open **PowerShell** (Start menu → type *PowerShell*) and run:
```powershell
node --version
```
You should see something like `v20.x` or newer.

**Step 2. Download Parley.**
- **With Git:**
  ```powershell
  git clone https://github.com/Pavangowda-dev/parley.git
  cd parley
  ```
- **Without Git:** on the GitHub page click **Code → Download ZIP** and unzip it, for example to `Documents\talktome`. Then open PowerShell in that folder: right-click inside the folder → **Open in Terminal**.

**Step 3. Install the app's parts.**
```powershell
npm install
```
This downloads everything the app needs into a `node_modules` folder. It takes 1–3 minutes.

**Step 4. Add your OpenAI API key.**
See [Add your OpenAI API key](#add-your-openai-api-key) below. You can also skip this step and paste the key into the app when it opens.

**Step 5. Start it.**
```powershell
npm start
```
The buddy appears in the bottom-right corner of your screen. 🎉

**Step 6 (optional). Add a desktop shortcut so you never need PowerShell again.**
```powershell
npm run shortcut
```
This puts a **Parley** icon on your desktop and in the Start menu. The app also **starts automatically with Windows**; you can turn that off in Settings.

### Option B: installer (.exe)

If a release is available on the project's **Releases** page, download `Parley-Setup-x.y.z.exe` and run it.

> The installer isn't code-signed. Windows SmartScreen may show *"Windows protected your PC"*; click **More info → Run anyway**. On PCs with **Smart App Control** turned on, unsigned apps are blocked completely, so use **Option A** instead.

---

## Add your OpenAI API key

This is the **only** setup the app needs.

**1. Get a key.** Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys), sign in, click **Create new secret key** and copy it (it starts with `sk-`). Your OpenAI account needs a little prepaid credit; see [What it costs](#what-it-costs).

**2. Put it in the app.** Choose **one** of these:

| Way | How | Best for |
|---|---|---|
| **In the app** (easiest) | Start the app; Settings opens by itself on first run. Paste the key into **"Add your OpenAI API key"** and press **Save**. The app checks the key straight away. | Everyone |
| **In a `.env` file** | In the project folder, copy `.env.example` to a new file named `.env`, open it in Notepad and fill in `OPENAI_API_KEY=sk-...` | Running from source |

A key saved in the app is **encrypted** with your Windows account and stored on this computer only. If both are set, the one saved in the app wins.

> 🔒 **Never share your key or upload your `.env` file.** It's already listed in `.gitignore`, so Git won't upload it.

---

## Your first conversation

1. **Start the app.** A small character appears in the bottom-right corner. You can drag it anywhere; it always stays inside your screen.
2. **Wake it up.** Say **"Hey Aira"**, or press **Ctrl + Alt + Space**, or click it. The first time, Windows may ask for microphone permission; allow it.
3. **Wait for the chime,** then talk. Tell it what you did today.
4. **Look out for bubbles.** When you make a mistake, a bubble shows the correct sentence. Try saying it again!
5. **Say "bye"** when you're done. It'll save what you talked about.
6. **Explore the panel.** Right-click it (or click the tray icon) and choose **Dashboard** to see your stats, today's timeline and corrections.

---

## Things you can say

| You say | What happens |
|---|---|
| "Hey Aira" | It wakes up and starts talking with you |
| *anything about your day* | It reacts, asks follow-up questions and corrects your English |
| "Quiz me" / "Let's practise my mistakes" | A short drill based on your real mistakes |
| "Remind me to call mom at 5" / "…in 20 minutes" | It pops up at that time with a reminder |
| "Forget what I said about the test" | Deletes every related memory |
| "I finished the project!" | The project is marked done, and it celebrates |
| "Why is that wrong?" | It explains the grammar simply |
| "Good night, I'm going to sleep" | Records your sleep, says good night and hangs up |
| "Good morning" (the next day) | It tells you how long you slept |
| "Bye" / "Talk later" | It says goodbye and hangs up |

---

## The dashboard

Right-click the buddy → **Dashboard**, or click the tray icon while it's visible.

| Page | What you'll find |
|---|---|
| **Dashboard** | Day streak, total speaking time, words spoken, vocabulary size, sentence accuracy (and change vs last week), average sleep, today's speaking goal. There are 30-day charts for speaking minutes, accuracy, sleep, words per day and vocabulary growth, plus a weekday × hour **heatmap** of when you talk, mistake types, filler words ("um", "like"…), your most-used words, new words this month and better words to learn. |
| **Today** | Your sleep, a timeline of your day (hover an entry to delete it), today's corrections ("Say it like this"), and upcoming reminders. |
| **Projects** | What you're working on, with status and next step, and the follow-ups it'll ask you about. |
| **Memory** | Everything it remembers about you, with delete buttons. You can also **forget something** by describing it, **export** all your data as JSON, or **erase** everything. |
| **Settings** | See below. |

---

## Settings explained

| Section | What you can change |
|---|---|
| **Character** | Choose one of 12 characters and its colours (themes or custom), with a live preview. Saved instantly. |
| **Basics** | Your OpenAI key, the **buddy's name** (the wake phrase follows it: "Hey Jarvis"), your name, and your first language (helps it spot typical mistakes). |
| **Presence** | Auto-hide delay, daily speaking goal, the talk hotkey, how long a silence ends a chat, optional check-in bubbles, and start with Windows. |
| **Wake word** | On or off, plus optional offline mode ([below](#optional-offline-wake-word)). |
| **Voice & coaching** | Voice (`marin` and `cedar` sound the most natural), speaking speed, how long it waits when you pause, coach style (*Gentle · Pushes me · Tough love*), and how much it corrects. |

---

## Optional: offline wake word

The wake word works out of the box. By default, short bursts of speech (under about 4 seconds) are sent to OpenAI to check whether you said its name. To make it fully **offline and free**:

1. Create a free account at [console.picovoice.ai](https://console.picovoice.ai) and copy your **AccessKey**.
2. In **Porcupine**, create a wake word with your buddy's name (e.g. *"Hey Aira"*), choose **English** and **Windows**, then download and unzip it. You get a `.ppn` file.
3. In **Settings → Wake word**, paste the AccessKey, press **Save**, then **Choose .ppn file…**. "Running now" switches to **Picovoice · offline**.

---

## Privacy and your data

- **Stays on your computer:** everything is in `%APPDATA%\Parley\`.
  - `memory.json`: your day, projects, corrections and stats
  - `settings.json`: your choices
  - `parley.log`: app events
  - `wake-log.txt`: what the wake word heard
- **Sent to OpenAI, using your key:**
  - your voice during a conversation
  - short wake-word clips (cloud mode only)
  - the text of what you said, for corrections and memory updates
- **Not sent anywhere else:** there is no server, analytics or tracking.
- **Your key is safe:** it's stored encrypted with Windows (DPAPI) and never included in exports.
- **You're in control:** delete single items, *"forget"* by voice, export everything, or erase all memory from the **Memory** page.
- **Small memory:** details are kept for **30 days**; only small daily numbers (minutes, words, sleep) are kept longer for the charts.

---

## What it costs

The app is free. You pay OpenAI only for what you use, with your own key:

| Part | Rough cost |
|---|---|
| Live voice conversation | the main cost: a few cents per minute of talking |
| Grammar check, memory update, cloud wake word | fractions of a cent |
| Offline wake word (Picovoice) | free |

Tips to keep it low:
- **End chats when you're done.** It hangs up after a silence (Settings → *End chat after silence*), so you never pay while you're away.
- **Use the offline wake word.** It removes the wake-word cost.
- **Set a limit.** You can set a monthly spending limit on the OpenAI billing page.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **"No OpenAI API key"** | Right-click the buddy → Settings → paste your key → Save. |
| **The buddy doesn't react to its name** | Check Settings → Wake word → *Running now*. Look in `%APPDATA%\Parley\wake-log.txt`: if your phrase shows as `ignore`, the name was misheard. Speak clearly with a short pause after the name, use a clearer 2–3 syllable name, or set up the [offline wake word](#optional-offline-wake-word). |
| **"Microphone access is blocked"** | Windows Settings → Privacy & security → Microphone → turn on *Let desktop apps access your microphone*. |
| **The hotkey does nothing** | Another app may use it. Pick a different one in Settings → Presence. |
| **The buddy has disappeared** | That's auto-hide. Say its name or press the hotkey, or click the tray icon (near the clock). |
| **The buddy is in a strange place** | Tray icon → **Reset position**. |
| **No sound** | Check your speakers or headphones and the Windows volume mixer. |
| **OpenAI error about quota or billing** | Add credit to your OpenAI account. |
| **`npm start` says Electron isn't found** | Run `npm install` again in the project folder. |
| **Something else** | Open `%APPDATA%\Parley\parley.log`. Lines starting with `window:` show crashes, restarts and microphone problems. |

---

## Update and uninstall

**Update (source install):**
```powershell
cd parley
git pull          # or download the new ZIP and replace the files
npm install
npm start
```
Your memory and settings are kept, because they live in `%APPDATA%\Parley\`.

**Uninstall:**
1. **Stop the app:** tray icon → **Quit**.
2. **Stop autostart:** turn off Settings → *Start with Windows* first, or remove *Parley* from Task Manager → Startup apps.
3. **Remove the app:** delete the project folder, and the desktop and Start-menu shortcuts. If you used the installer, uninstall it from Windows Settings → Apps.
4. **Remove your data (optional):** delete `%APPDATA%\Parley\`.

---

## For developers

```
src/main/main.js                Electron main process: windows, tray, hotkey, wake word, reminders, self-healing, IPC
src/main/ai.js                  personality & instructions, realtime session + tools, grammar check, memory update, wake check
src/main/memory.js              local memory, time zone, sleep, reminders, analytics, forgetting
src/main/settings.js            settings + encrypted keys (Windows DPAPI)
src/main/hotkey.js              global hotkey (standard Windows API, no hooks)
src/main/wake.js                Picovoice Porcupine offline wake word
src/renderer/agentkit.js        character engine (springs, blinking, gaze, real lip-sync, render loop)
src/renderer/agentkit-styles.js the 12 characters + colour presets
src/renderer/mascot.*           the desktop buddy: voice session (WebRTC), tool calls, bubbles, wake listener
src/renderer/panel.*            dashboard, today, projects, memory, settings, character studio
src/renderer/wakeword.js        cloud wake word (short-clip voice detector)
scripts/                        start script + desktop shortcut installer
.github/workflows/release.yml   builds the Windows installer on GitHub
```

**Models used** (built in, not user-editable):
- live voice: `gpt-realtime-2.1` (voice `marin`)
- speech-to-text: `gpt-transcribe`
- grammar check: `gpt-5.4-mini`
- memory: `gpt-5.5`

They're defined in `src/main/settings.js`.

**Build the installer:**
- **On GitHub:** push a tag such as `v1.0.0`. The *Build Windows installer* workflow builds `Parley-Setup-1.0.0.exe` and attaches it to the release. You can also run the workflow by hand from the **Actions** tab.
- **Locally:** `npm run dist` writes to `dist/`. Machines with Smart App Control turned on block unsigned build tools, so use GitHub for those.

**Add a character:** write one `AgentKit.registerStyle({...})` block in `agentkit-styles.js`. It shows up in the studio automatically.

More in [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE). The **Satoshi** font in `assets/fonts` is made by Indian Type Foundry, comes from [Fontshare](https://www.fontshare.com) and is covered by its own license. See [LICENSE](LICENSE).
