# Tourism and travel tutorial

You will make a three-day itinerary for a fictional coastal town, with the `tourism` pack and its `voyage` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new three-days --pack tourism --template itinerary-3-days --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `airport-to-town` and `best-time-to-visit`. The [pack catalog](../../reference/packs.md#tourism) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit three-days` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** Travelers planning a trip and visitors on site. Be inviting and practical.

- Use a `timeline` for the days and a `chip` for each stop.
- Give one practical tip per day (transport, timing or tickets).
- End with a question that invites comments, such as which stop to cover next.

## 3. Check the content

- No real hotels, airlines, tour operators or booking platforms.
- Prices, schedules and visa rules only as provided, with "check before you travel".
- Respect local culture and sacred sites; no stereotypes.

## 4. Validate, record and render

```bash
reelforge validate three-days
reelforge align three-days          # after you save voice.wav in the episode folder
reelforge render three-days
```

A finished example is in `packs/tourism/examples/azur-bay-en`; render it with `--silent` to compare.
