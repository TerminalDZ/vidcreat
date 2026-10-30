# Education tutorial

You will make one concept explained in 45 seconds, with the `education` pack and its `campus` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new concept-45s --pack education --template concept-explainer --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `study-plan` and `enrollment-steps`. The [pack catalog](../../reference/packs.md#education) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit concept-45s` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** Students, parents and teachers. Be encouraging and clear, with one concept per episode.

- Open with a question the viewer has asked themselves.
- Build the idea step by step with `steps` or `tree`, one element per spoken idea.
- Close with a short recap or a question for the comments.

## 3. Check the content

- Definitions and formulas must be correct; check them before recording.
- No real exam papers, teachers or schools.
- Content for minors: no requests for personal data and no links to off-platform chats.

## 4. Validate, record and render

```bash
reelforge validate concept-45s
reelforge align concept-45s          # after you save voice.wav in the episode folder
reelforge render concept-45s
```

A finished example is in `packs/education/examples/photosynthesis-en`; render it with `--silent` to compare.
