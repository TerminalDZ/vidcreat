# Quick start: your first reel

This walk-through takes about 15 minutes for a 30-second episode.

## 1. Create an episode

Open the dashboard (`start.bat` / `./start.sh`) and click **+ New episode**. Give it an id such as `ep10`,
a title and your series name. ReelForge creates `episodes/ep10/episode.yaml` from a commented template.

## 2. Write the script

Open `episodes/ep10/episode.yaml` in any text editor (VS Code is recommended: the template links the
JSON Schema, so you get autocompletion and inline errors). Put **one spoken sentence per line**:

```yaml
script:
  - text: 'عمرك دفعت حاجة أونلاين، والنت فصل؟'
  - text: 'المشكلة دي اسمها Duplicate Charge'
  - text: 'والحل اسمه الـ Idempotency key'
```

## 3. Record

Record yourself reading the script with any app (phone, Audacity, OBS…). Keep a short pause between
sentences. In the dashboard click **Upload voice** and choose the file — WAV, MP3, M4A, OGG, OPUS or FLAC.
It is converted and saved as `voice.wav`.

> Not ready to record? Click **Draft cues**: ReelForge estimates timing from the text so you can design and
> preview first.

## 4. Mark the cues

Click **Mark cues**. Play the recording and press **Space** at the start of each sentence. That's it —
see [Recording and cues](#recording-and-cues) for nudging, re-marking and word-level marks.

## 5. Describe what appears

Add scenes and elements to `episode.yaml`. Each element appears **on the word that names it**:

```yaml
scenes:
  - id: hook
    at: l1
    glow: red
    elements:
      - use: title
        props: { text: '**Duplicate** Charge' }
        place: { x: 60, y: 200, w: 960, h: 260 }
        enter: { at: "l2:'Duplicate'", anim: pop }
```

## 6. Preview

Click **Preview**. The video plays in sync with your voice and reloads every time you save the YAML.
Press **Z** to show the platform safe zones and **?** for all shortcuts.

## 7. Validate and render

Click **Validate** to list any problem with its line number and a fix hint, then **Render**. When it
finishes, the card shows **Master**, **Share**, **Captions**, **Contact sheet** and **publish.md**: click
Share to watch it, then upload it with the caption from `publish.md`.
