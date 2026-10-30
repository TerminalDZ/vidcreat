# Government services tutorial

You will make how residents of a fictional city renew a document online, with the `government` pack and its `civic` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new renew-online --pack government --template renew-document --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `appointment-checklist` and `program-deadlines`. The [pack catalog](../../reference/packs.md#government) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit renew-online` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** All residents, including older people and non-native speakers. Be neutral, plain and step by step.

- One step per line, shown with `steps` or `checklist`.
- Show the official channel as text, not as a real emblem or seal.
- Keep captions on and avoid fast effects.

## 3. Check the content

- Politically neutral: no parties, candidates or opinions.
- Rules, fees and deadlines exactly as provided, with "check the official website for your case".
- Accessibility: high contrast, no `flash` or `glitch` effects.

## 4. Validate, record and render

```bash
reelforge validate renew-online
reelforge align renew-online          # after you save voice.wav in the episode folder
reelforge render renew-online
```

A finished example is in `packs/government/examples/westbrook-renewal-en`; render it with `--silent` to compare.
