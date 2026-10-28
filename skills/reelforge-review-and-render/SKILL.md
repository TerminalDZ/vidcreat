---
name: reelforge-review-and-render
description: >-
  Use before calling a ReelForge episode done and when rendering it: the validation loop, visual QA on preview_frames (images or the text layout for text-only models), render options (silent, fast, denoise, share size, presets) and the publish metadata.
---

# Review and render

Rendering takes minutes; review takes seconds. Review first, render once.

## Review loop

1. `validate_episode` → fix every error; fix or explain every warning. Each result carries `fixes`
   (one hint per problem) and `next`.
2. `preview_frames` at the moments that matter (up to 8 per call):
   - each scene's hero shortly after it enters: `"l3:'bucket'+0.8"`;
   - the busiest moment of each scene (most elements visible);
   - the hook at about 1 s and the CTA at its end.
3. Fix, then preview the same times again to confirm.
4. Only when validate is clean and frames look right: render.

Vision models look at the images. **Text-only models** read the layout text that comes with every
frame:

```text
Frame at 7.9s (l3:'bucket'+0.8) · scene "limit" 6.1–12.4s · canvas 1080×1920
Visible elements (canvas coordinates):
- limit_title (title, base) box x 60 y 350 w 960 h 220
- tokens (bucket, base) box x 320 y 610 w 440 h 560 · entering
Overlaps between base elements: none
Platform UI zones: none
Caption: A bucket holds five tokens.
```

Read it like a checklist: overlaps marked `(V-8)` must go, any entry under "Platform UI zones" must
move, `entering` means the animation is still running (preview later for the settled layout), and
an empty list means a dead frame.

## Visual QA checklist (per frame)

- Text fits its box: no clipped words, no single orphan word on a line (V-9 catches overflow).
- Nothing overlaps unless it is an overlay meant to (stamp, badge, arrow).
- Nothing in the right rail or under the captions (V-7); 60 px side margins.
- One clear hero; ≤ 3–4 elements visible; the lower half of the stage is not empty by accident.
- The element on screen matches what the caption is saying at that moment.
- Colors carry meaning consistently (red = problem, lime = solution) and text is readable.
- Arabic: captions right-to-left, English terms intact, no broken shaping.

## Render

| Need                                 | MCP (`render_episode`) | CLI                                    |
| ------------------------------------ | ---------------------- | -------------------------------------- |
| Preview without a recording          | `silent: true`         | `reelforge render ep10 --silent`       |
| Quick draft                          | `fast: true`           | `--fast`                               |
| Phone or noisy recording             | `denoise: true`        | `--denoise` (or `audio.denoise: true`) |
| Share file size cap (MB, default 28) | `shareMb: 50`          | `--share-size 50`                      |
| Platform layout                      | `preset: reels`        | `--preset tiktok\|reels\|shorts`       |
| No sound effects                     | `sfx: false`           | `--no-sfx`                             |
| A section only                       | (CLI only)             | `--from 12 --to 20` → `<id>.part.mp4`  |

After `render_episode`, poll `get_render_status` every 15–30 s and do other work in between. Do not
start a second render while one runs; `cancel_render` stops it. Never delete the person's files
under `out/`; re-rendering overwrites them.

Outputs in `episodes/<id>/out/`: `<id>.master.mp4` (archive), `<id>.share.mp4` (upload this),
`<id>.srt`, `<id>.sheet.jpg` (contact sheet), `publish.md`.

## Checklist

- [ ] `validate_episode`: 0 errors; warnings fixed or explained to the person.
- [ ] Every scene previewed after its hero entered and at its busiest moment.
- [ ] No overlap, overflow or platform UI hit in any previewed frame (images or layout text).
- [ ] Real cues (aligned or marked), or `silent: true` for a preview render.
- [ ] `meta.publish` filled in: cover, caption, hashtags, pinned.
- [ ] Render polled to completion; output paths reported to the person.

References: [visual-qa](references/visual-qa.md), [render-and-publish](references/render-and-publish.md).
