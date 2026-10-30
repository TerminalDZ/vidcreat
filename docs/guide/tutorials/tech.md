# Tech and software tutorial

You will make rate limiting with a token bucket, for backend developers, with the `tech` pack and its `default` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new rate-limiting --pack tech --template system-concept --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `latency-numbers` and `request-path`. The [pack catalog](../../reference/packs.md#tech) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit rate-limiting` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** Developers, students and technical founders. Be sharp, concrete and a little playful.

- Use `node` and `arrow` with moving packets for the request path, and `bucket` for the limiter.
- Make each element enter on the word that names it: "bucket", "token", "429".
- The `examples/season1` episodes show complete scenes for this style.

## 3. Check the content

- Code must be correct and runnable as shown; keep it to 8 lines per `code` element.
- No real company or product logos; describe generic technologies.
- Security topics: explain defenses, not working exploits; use `example.com`.

## 4. Validate, record and render

```bash
reelforge validate rate-limiting
reelforge align rate-limiting          # after you save voice.wav in the episode folder
reelforge render rate-limiting
```

A finished example is in `packs/tech/examples/rate-limiting-en`; render it with `--silent` to compare.
