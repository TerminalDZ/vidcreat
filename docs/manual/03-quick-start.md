# Quick start: your first reel

This walk-through takes about 15 minutes for a 30-second episode.

## 1. Create an episode

Open the dashboard (`start.bat` / `./start.sh`) and click **+ New episode**. Give it an id such as
`ep10`, a title, your series name and the language of your voice-over. Choose **English** or
**Arabic**; Arabic sentences can mix in English terms. ReelForge creates
`episodes/ep10/episode.yaml` and opens the **editor**.

## 2. Write the script

In the editor, open the **Script** tab on the left. Write **one spoken sentence per line**:

```yaml
script:
  - text: 'Ever paid online and your connection dropped?'
  - text: 'That problem is called a Duplicate Charge.'
  - text: 'The fix is an Idempotency key.'
```

Keep sentences short. Line 1 is your hook.

## 3. Design the scenes

Click **Insert** and pick a component. For example, add a **title** and type
`**Duplicate** Charge` (words between `**` get the accent color). Then drag it into place on the
canvas. In the inspector, put the playhead on the word _Duplicate_ and click the **target** button
next to **Enter at**. The title now appears exactly when you say that word.

Repeat for each idea: nodes and arrows for systems, code that types itself, counters, tables,
checklists, stamps. Drag clips on the timeline to retime them; they snap to your words.

> Not recorded yet? That's fine. ReelForge writes estimated (draft) cues, so the preview already
> plays with realistic timing.

## 4. Record

Record yourself reading the script with any app (phone, Audacity, OBS…). Leave a short pause
between sentences. In the dashboard, click **Upload voice** and choose the file (WAV, MP3, M4A,
OGG, OPUS or FLAC). It is converted and saved as `voice.wav`.

## 5. Mark the cues

In the editor, switch to **Cues** (**Alt+2**). Play the recording and press **Space** at the start
of each sentence. See [Recording and cues](#recording-and-cues) for nudging, re-marking and
word-level marks. Every animation follows your real timing automatically.

## 6. Review and render

Switch to **Review** (**Alt+3**). It lists any problem with a fix hint, such as text that
overflows or an element under the platform buttons. Fix the problems, then click **Render**.
When rendering finishes, watch the result and upload `out/ep10.share.mp4` with the caption from
`out/publish.md`.

> Prefer working with an AI assistant? See [AI agents & MCP](#ai-agents-mcp). An assistant can
> write the script, build the scenes and check the frames for you.
