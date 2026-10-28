---
name: reelforge-make-video
description: >-
  Use when asked to make, draft or finish a ReelForge video end to end (topic or script in, validated and previewed episode out). Covers which tools fit your model size, the MCP/REST/CLI entry points and the validate → preview → fix loop.
---

# Make a ReelForge video end to end

A ReelForge video is one `episodes/<id>/episode.yaml` plus a voice recording. You write the script
and the scenes; ReelForge renders 1080×1920 frames deterministically. You never render audio or
voices yourself: the person records `voice.wav`.

## Quick path

1. **Pick your tier** (below) and stay in it. Lower tiers are safer; move up only when a tier
   cannot express what you need.
2. **Script**: 6–14 short lines, hook first, CTA last, about 2.3 words/s
   (`get_guide reelforge-script-writing`).
3. **Create** the episode (template, script or YAML, depending on the tier).
4. **Design** 4–7 scenes, one idea each, elements entering on the word that names them.
5. **Validate**, read `fixes`, apply them, repeat until 0 errors.
6. **Preview** frames shortly after things enter and fix what you see.
7. **Hand over**: the person records, runs `align_cues`, listens once, renders.

## Pick a tool tier

| Tier | Fits                                     | Tools                                                                           | You write                             |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| 1    | Small models, short context, weak YAML   | `list_templates`, `create_from_template` (flat slots), `suggest_scenes`         | Plain strings and numbers only        |
| 2    | Medium models                            | `create_episode` + `add_scene` with a named blueprint, `suggest_scene` per line | One scene at a time as flat fields    |
| 3    | Strong models that read schemas reliably | `edit_episode` (set/insert/delete/move by path), `write_episode_yaml`           | Any valid YAML, any of the components |

Blueprints for `add_scene`: `hook`, `problem-solution`, `stat-reveal`, `comparison`,
`process-steps`, `timeline`, `map-route`, `before-after`, `quote`, `cta`. Every tier shares
`validate_episode`, `preview_frames`, `get_episode` and the render tools. Details and call shapes:
[tool-tiers](references/tool-tiers.md).

Rules of thumb:

- Unsure? Start at Tier 1 and only use `edit_episode` for the specific fixes listed in `fixes`.
- Tier 2 output can be refined with Tier 3 edits; never the reverse (do not call
  `create_from_template` on an episode you have hand-edited).
- Tool names and arguments follow semver. Read each tool's input schema before the first call.

## Entry points

- **MCP stdio** (preferred): `node packages/cli/bin/reelforge.js mcp` (configured in `.mcp.json`).
  Limit the tool list for small models: `--toolsets basic` or `basic,design`.
- **MCP over HTTP / REST**: `reelforge studio`, then `/mcp`, or `POST /api/v1/tools/<name>` with JSON
  arguments (`GET /api/v1/openapi.json` for function calling).
- **CLI only**: `reelforge new`, `cue --draft`, `validate --json`, `snap`, `render`.

See [entry-points](references/entry-points.md) for exact commands and payloads.

## The validate → preview → fix loop

Every write tool returns `issues` (`errors`, `warnings`, `list`), `fixes` (one hint per problem) and
`next` (the recommended next step). Follow `next` literally unless you have a reason not to.

```text
loop (max 6 rounds):
  result = <write tool>(...)
  if result.issues.errors > 0: apply each entry of result.fixes, continue
  frames = preview_frames(times shortly after each scene's main element enters)
  if a frame shows overlap, overflow, platform UI hits or empty space: fix, continue
  break
```

If the same error comes back twice, change approach (move the element, shorten the text, split the
scene) instead of nudging the same value again. Explain any warning you deliberately keep.

## Good and bad

Good: one idea per scene, the element enters on the word that names it.

```yaml
scenes:
  - id: limit
    at: l3
    glow: cyan
    elements:
      - use: counter
        id: rps
        props: { from: 0, keyframes: [{ at: "l3:'thousand'", value: 1000, dur: 1 }], suffix: ' req/s' }
        place: { x: 140, y: 180, w: 800, h: 300 }
        enter: { at: "l3:'thousand'", anim: pop }
```

Bad: absolute seconds, several unrelated ideas, the text box pushed into the right rail.

```yaml
scenes:
  - id: everything
    at: l3
    elements:
      - use: title
        props: { text: 'Rate limits, retries, queues and caches explained' }
        place: { x: 300, y: 700, w: 760, h: 240 }
        enter: { at: 14.2s }
```

## Checklist

- [ ] The tier fits the model; every tool call matches its input schema.
- [ ] Script: hook in line 1, one idea per line, CTA last, ≤ 3.5 words/s (V-14).
- [ ] `validate_episode`: 0 errors; warnings fixed or explained.
- [ ] `preview_frames` checked at least once per scene (images, or the layout text).
- [ ] `meta.publish` filled in (cover, caption, hashtags, pinned).
- [ ] The person knows the next step: record `voice.wav`, `align_cues`, listen, render.

More: [full-example](references/full-example.md) is a complete episode that validates.
