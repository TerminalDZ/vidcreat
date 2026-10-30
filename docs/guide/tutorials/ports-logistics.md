# Ports and logistics tutorial

You will make the journey of a container from ship to truck at a fictional port, with the `ports-logistics` pack and its `harbor` theme. Allow about ten minutes
before recording.

## 1. Create the episode

```bash
reelforge new container-journey --pack ports-logistics --template container-journey --lang en
```

Use `--lang ar` for an Arabic version. The pack also has `terminal-in-numbers` and `new-route`. The [pack catalog](../../reference/packs.md#ports-logistics) lists
every template and its slots.

## 2. Fill in your details

Open the episode with `reelforge edit container-journey` and replace the default names, numbers and keyword with
your own, or start from the dashboard (**+ New episode** → **Start from template**), whose form asks for each field. Keep within
the length limits shown for each slot.

**Audience and tone.** Importers, exporters, forwarders, drivers and port staff. Be precise and operational; numbers matter.

- Show the stages as a `flow` with a moving token, one stage per spoken step.
- Keep English terms inside Arabic sentences (`الـ container`, `الـ customs`).
- Label times and volumes as "example" unless the client gives real figures.

## 3. Check the content

- No real ports, carriers, vessels or terminal operators.
- Customs rules vary by country: present them as examples and point to the local authority.
- No security-sensitive details such as gate or inspection procedures.

## 4. Validate, record and render

```bash
reelforge validate container-journey
reelforge align container-journey          # after you save voice.wav in the episode folder
reelforge render container-journey
```

A finished example is in `packs/ports-logistics/examples/azur-container-en`; render it with `--silent` to compare.
