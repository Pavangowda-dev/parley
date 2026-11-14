# Contributing

Thanks for helping make Parley better.

## Run it locally
```powershell
npm install
copy .env.example .env   # add OPENAI_API_KEY
npm start
```
Use `npm start`, not `electron .`. The start script clears `ELECTRON_RUN_AS_NODE`, which VS Code terminals set.

## Where things live
- `src/main/`: the Electron main process (AI calls, memory, settings, wake word, hotkey, windows).
- `src/renderer/`: the character engine (`agentkit.js`) and the 12 characters (`agentkit-styles.js`), the voice session (`mascot.js`) and the panel (`panel.*`).
- Your data lives in `%APPDATA%\Parley\`: `memory.json`, `settings.json`, `parley.log` and `wake-log.txt`.

## Handy test switches (environment variables)
These are set before running `electron .` with the project folder as the argument:

| Variable | Effect |
|---|---|
| `TTM_AUTOHIDE_SEC=20` | Hide after 20 s instead of the configured minutes. |
| `TTM_SELFTEST_WAKE_WAV=path.wav`, `TTM_SELFTEST_AFTER_SEC=30` | Feeds a recorded "Hey <name>" clip through the real wake-word path after 30 s. Combine with the `--mute-audio` flag. |

## Guidelines
- **No low-level keyboard or mouse hooks.** They can freeze laptop touchpads. Use Electron's `globalShortcut`.
- **Every network call needs a timeout**, because a request caught by laptop sleep must never hang forever.
- **Never overwrite user files you can't parse.** Back them up first (see `settings.js` and `memory.js`).
- **Keep the voice prompt compact**, because it is sent at the start of every conversation.
- **UI text uses the buddy's configured name** (default "Aira") and neutral wording, never a hard-coded name.

## Ideas we'd love help with
- **macOS and Linux:** packaging and tray behaviour.
- **More languages:** let learners practise languages other than English.
- **Pronunciation feedback:** phoneme-level scoring.
- **Local models:** support Ollama/Whisper for a fully offline mode.
- **More characters:** add one with a single `registerStyle({...})` block in `agentkit-styles.js`.
