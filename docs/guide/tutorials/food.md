# Food and hospitality tutorial

You will make a signature dish made in four steps at a fictional restaurant, with the `food` pack and its `bistro` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new dish-steps --pack food --template dish-in-steps --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `order-to-table` and `weekly-menu`. The [pack catalog](../../reference/packs.md#food) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit dish-steps` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** Diners, home cooks and delivery customers. Be warm, sensory and quick.

- Show the dish in four steps with `steps` and an `icon` for heat or time.
- Say the price and opening hours once, and show them as `chip` elements.
- Use your own food photos from `assets/`.

## 3. Check the content

- No health or nutrition claims ("healthy" as a promise, "burns fat").
- For ingredients, add "ask staff about allergens"; never claim "allergen-free" unless the client states it.
- Fictional restaurant names only; no real chains or delivery platforms.

## 4. Validate, record and render

```bash
reelforge validate dish-steps
reelforge align dish-steps          # after you save voice.wav in the episode folder
reelforge render dish-steps
```

A finished example is in `packs/food/examples/shakshuka-en`; render it with `--silent` to compare.
