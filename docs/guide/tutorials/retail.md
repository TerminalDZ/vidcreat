# Retail tutorial

You will make how click-and-collect works at a fictional shop, with the `retail` pack and its `retail` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new click-and-collect --pack retail --template click-and-collect --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `returns-steps` and `loyalty-program`. The [pack catalog](../../reference/packs.md#retail) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit click-and-collect` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** Shoppers and store staff. Be upbeat and concrete, benefit first, with short sentences.

- Put the benefit in the hook, for example the pickup time.
- Show the steps on a `phone` or with `steps`: order online, wait for the message, collect.
- Say any conditions (opening hours, ID to bring) and repeat them in the caption.

## 3. Check the content

- Prices, discounts and dates exactly as the client gives them, with their conditions.
- No fake urgency ("only 2 left") unless true.
- No real brands and no comparisons with named competitors.

## 4. Validate, record and render

```bash
reelforge validate click-and-collect
reelforge align click-and-collect          # after you save voice.wav in the episode folder
reelforge render click-and-collect
```

A finished example is in `packs/retail/examples/bluebell-pickup-en`; render it with `--silent` to compare.
