# Healthcare tutorial

You will make a 30-second guide to a first visit at a fictional hospital, with the `healthcare` pack and its `clinical` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new first-visit --pack healthcare --template patient-journey --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `department-intro` and `health-tip`. The [pack catalog](../../reference/packs.md#healthcare) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit first-visit` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** Patients and families, often anxious or in a hurry. Use a calm, warm tone and plain language; Modern Standard Arabic suits institutional content.

- Name each step on screen as you say it: reception, waiting area, nurse, doctor.
- Keep red for genuine warnings; use the `cyan` or `lime` glow.
- Give one number at most (for example a typical check-in time) and say where it comes from.

## 3. Check the content

- No diagnosis, treatment advice, dosages or efficacy claims.
- No real patients, staff or recognizable cases; fictional names only.
- Add "General information, not medical advice. Ask your care team." to the caption when the topic touches symptoms or treatment.

## 4. Validate, record and render

```bash
reelforge validate first-visit
reelforge align first-visit          # after you save voice.wav in the episode folder
reelforge render first-visit
```

A finished example is in `packs/healthcare/examples/first-visit-en`; render it with `--silent` to compare.
