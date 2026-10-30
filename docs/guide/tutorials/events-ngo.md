# Events and non-profits tutorial

You will make a call for volunteers for a beach clean-up day, with the `events-ngo` pack and its `editorial` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new volunteer-day --pack events-ngo --template volunteer-signup --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `event-agenda` and `donation-impact`. The [pack catalog](../../reference/packs.md#events-ngo) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit volunteer-day` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** Attendees, volunteers, donors and partners. Be human, hopeful and transparent.

- Answer what, where, when and how to register, one per line.
- Show registration steps on a `phone` or with `steps`.
- Use honest numbers from the organizer; stories work better than statistics.

## 3. Check the content

- Impact and fundraising numbers only from the organizer, never rounded up.
- No real beneficiaries' names or faces.
- No pressure tactics and no tax claims unless confirmed.

## 4. Validate, record and render

```bash
reelforge validate volunteer-day
reelforge align volunteer-day          # after you save voice.wav in the episode folder
reelforge render volunteer-day
```

A finished example is in `packs/events-ngo/examples/open-hands-en`; render it with `--silent` to compare.
