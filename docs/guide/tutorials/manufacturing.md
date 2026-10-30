# Manufacturing tutorial

You will make how a part is made at a fictional plant, from raw material to the box, with the `manufacturing` pack and its `industrial` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new part-journey --pack manufacturing --template part-journey --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `safety-mistake` and `downtime-causes`. The [pack catalog](../../reference/packs.md#manufacturing) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit part-journey` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** Operators, technicians, buyers and recruits. Be precise and safety-first.

- Show the stages as a `flow` with a moving token, one stage per spoken step.
- Mark quality checks with a `node` whose `status` turns green on the word.
- Keep English technical terms inside Arabic sentences.

## 3. Check the content

- Safety steps only from the client's official procedures.
- Metrics (scrap rate, downtime) only from the client, otherwise "example".
- No confidential process parameters and no real company or machine brands.

## 4. Validate, record and render

```bash
reelforge validate part-journey
reelforge align part-journey          # after you save voice.wav in the episode folder
reelforge render part-journey
```

A finished example is in `packs/manufacturing/examples/bracket-line-en`; render it with `--silent` to compare.
