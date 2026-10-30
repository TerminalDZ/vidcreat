# Real estate tutorial

You will make a short tour of an apartment for a fictional agency, with the `real-estate` pack and its `estate` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new apartment-tour --pack real-estate --template property-tour --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `neighborhood-guide` and `buying-steps`. The [pack catalog](../../reference/packs.md#real-estate) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit apartment-tour` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** First-time buyers, renters and sellers. Be confident and practical, without hype.

- Lead with the one fact buyers ask first (size, rooms or price) in the hook.
- Use your own photos from the episode `assets/` folder; never use images you do not own.
- End with one clear next step, such as booking a visit.

## 3. Check the content

- No promises of appreciation, rental yield or "guaranteed" returns.
- Prices and fees only as the client provides them; label anything else "example".
- Describe the property and the area, never who the home is "for" (family status, origin, religion or disability).

## 4. Validate, record and render

```bash
reelforge validate apartment-tour
reelforge align apartment-tour          # after you save voice.wav in the episode folder
reelforge render apartment-tour
```

A finished example is in `packs/real-estate/examples/maple-court-en`; render it with `--silent` to compare.
