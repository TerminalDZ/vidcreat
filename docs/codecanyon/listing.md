# CodeCanyon listing checklist (author's notes — not shipped to buyers)

| Field               | Value                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Item name           | ReelForge — Vertical Explainer Video Generator for TikTok, Reels & Shorts                                                                                                |
| Category            | CodeCanyon › JavaScript › Miscellaneous (or › Video)                                                                                                                     |
| Short description   | Turn a voice recording and a simple YAML file into animated vertical explainer videos with word-by-word captions, sound effects and platform-ready MP4s. Offline. No AI. |
| Tags                | video generator, tiktok, reels, shorts, explainer, captions, arabic, animation, motion graphics, typescript, ffmpeg, node, cli                                           |
| Software version    | Node.js 22, Chromium (Playwright 1.56), FFmpeg 6                                                                                                                         |
| Compatible browsers | Chrome, Edge, Firefox (studio and dashboard)                                                                                                                             |
| Files included      | JavaScript, TypeScript, HTML, CSS, YAML, JSON                                                                                                                            |
| Layout              | Responsive (dashboard)                                                                                                                                                   |
| Documentation       | Well documented (offline HTML)                                                                                                                                           |

## Files to upload

| Envato field                 | File (produced by `pnpm release`)                                                |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Thumbnail (80×80)            | `release/ReelForge-<version>-marketing/thumbnail.png`                            |
| Inline preview (590×300)     | `release/ReelForge-<version>-marketing/inline-preview.jpg`                       |
| Main files (ZIP)             | `release/ReelForge-<version>.zip`                                                |
| Screenshots / previews (ZIP) | `release/ReelForge-<version>-previews.zip`                                       |
| Item description             | `docs/codecanyon/item-description.html`                                          |
| Video preview (optional)     | `release/ReelForge-<version>-marketing/demo.mp4` (upload to YouTube and link it) |

## Before submitting

1. `pnpm release` (builds, tests, generates docs/notices/marketing and verifies a clean install from the ZIP).
2. Open `documentation/index.html` from the unzipped package and click through every chapter.
3. Test the installer once on a real Windows machine and a Mac.
4. Replace the support contact in `SUPPORT.md` if you use a dedicated support email or site.
