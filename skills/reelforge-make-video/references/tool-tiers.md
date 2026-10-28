# Tool tiers in detail

Every tool validates its input with a strict schema. Read the input schema from `tools/list` (MCP)
or `GET /api/v1/tools` (REST) before the first call; the shapes below are orientation, not a
substitute for the schema.

## Tier 1 · templates and flat slots

For small models (or any model with little context left). You never write YAML.

1. `list_templates` returns the available templates, each with a description, an industry or
   purpose, the target length and its **slots**: named fields such as a headline, a number, a
   short label or a call to action, with type and length limits.
2. `create_from_template` creates the episode from one template and flat slot values: strings
   and numbers only, no nested objects, no YAML. Respect each slot's length limit; long text is
   the most common cause of V-9 (text overflow).
3. `suggest_scenes` proposes elements for every line of the script at once (component, props, the
   word to enter on). Apply suggestions only through the tool that offers to apply them, or leave
   them for the person in the editor.
4. `validate_episode`, then `preview_frames`. If `fixes` mention a slot (too long, missing), call
   `create_from_template` again for a new episode id with corrected slots rather than hand-editing.

Typical sequence:

```text
list_templates → create_from_template → validate_episode → preview_frames
  → (fix slots, recreate) → open_editor for the person
```

## Tier 2 · blueprints, one scene at a time

For medium models. You write the script and choose a blueprint per scene; the blueprint turns flat
fields into positioned, word-synced elements.

1. `create_episode` with `id`, `title`, `lang` and the `script` (one sentence per entry).
2. `get_episode` to read line ids and words.
3. For each scene, `add_scene` with the line it starts on, a blueprint name and the blueprint's
   flat fields.
4. `validate_episode` and `preview_frames` after every one or two scenes, not only at the end.

| Blueprint          | Use it for                                             | Typical content                                       |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------- |
| `hook`             | Line 1: question or surprising fact                    | Big title with an accent word, optional stamp or icon |
| `problem-solution` | A pain point and its fix                               | Problem chip struck through, solution node or title   |
| `stat-reveal`      | One number that matters                                | Counter or stat card counting up on the number word   |
| `comparison`       | Two options, A vs B                                    | Comparison columns with a winner                      |
| `process-steps`    | 3–5 steps in order                                     | Steps or flow, one step per spoken step               |
| `timeline`         | Dates, phases, durations                               | Timeline with markers entering on each date           |
| `map-route`        | Places and movement between them (shipping, travel)    | Stops as nodes with a route arrow and a moving packet |
| `before-after`     | A change or transformation                             | Before/after panels with a wipe                       |
| `quote`            | A testimonial or a principle (fictional speakers only) | Quote card that types itself                          |
| `cta`              | The last line                                          | Next-episode card with a comment keyword              |

Pick the blueprint from the meaning of the line, not from the words you want on screen. Keep one
blueprint per scene; two ideas means two scenes.

## Tier 3 · structured edits and full YAML

For strong models. You control every element, prop, time and animation.

- `edit_episode` applies operations in order and keeps comments:

```json
{
  "episode": "ep10",
  "ops": [
    { "op": "set", "path": ["scenes", 1, "elements", 0, "props", "text"], "value": "Token **bucket**" },
    {
      "op": "insert",
      "path": ["scenes", 1, "elements"],
      "value": { "use": "chip", "props": { "text": "429" } }
    },
    { "op": "delete", "path": ["scenes", 2, "elements", 3] },
    { "op": "move", "path": ["scenes"], "from": 4, "to": 2 }
  ]
}
```

- `write_episode_yaml` replaces the whole file; it refuses YAML with schema errors unless
  `force: true` (do not force).
- Call `get_component_schema` before using a component for the first time. Props are strict.
- Prefer `edit_episode` for fixes: smaller diffs, fewer new mistakes.

## Shared tools

| Tool                                                     | When                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `get_episode`                                            | Before editing: YAML, line ids and words, element paths, boxes |
| `validate_episode`                                       | After every change                                             |
| `preview_frames`                                         | After every scene; up to 8 times per call                      |
| `draft_cues` / `align_cues` / `set_cues`                 | Timing (see `reelforge-timing`)                                |
| `render_episode` / `get_render_status` / `cancel_render` | Final output (see `reelforge-review-and-render`)               |
| `open_editor`                                            | Hand over to the person                                        |
| `get_guide`                                              | These guides                                                   |
