# Finance tutorial

You will make how a simple monthly budget works, with the `finance` pack and its `ledger` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new budget-basics --pack finance --template budget-basics --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `compound-interest` and `scam-alert`. The [pack catalog](../../reference/packs.md#finance) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit budget-basics` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** Everyday customers, young earners and small business owners. Be neutral and trustworthy; explain jargon once.

- Use a `donut-chart` for shares of a budget and a `counter` for one key amount.
- Mark illustrative numbers on screen with a `label` such as "example values".
- One idea per episode: budgeting, interest or scams, not all three.

## 3. Check the content

- No financial advice: no "buy", "sell", "invest in", products or allocations.
- No promised returns and no "risk-free".
- Add "General information, not financial advice." to the caption, and on screen when numbers appear.

## 4. Validate, record and render

```bash
reelforge validate budget-basics
reelforge align budget-basics          # after you save voice.wav in the episode folder
reelforge render budget-basics
```

A finished example is in `packs/finance/examples/budget-split-en`; render it with `--silent` to compare.
