# CodeCanyon submission package (author's notes, not shipped to buyers)

These notes follow Envato's author help center pages: Item Information and Metadata Requirements, Item
Presentation Requirements, Code Item Preparation & Technical Requirements, Common Rejection Factors for
Code Items, Adding Key Features, and the Item Support Policy. Every value below is ready to copy and paste
into the upload form.

## 1. Item name (≤ 100 characters, English only, Title Case, no trademarks, no hype words)

```
ReelForge - Vertical Explainer Video Editor and Generator with Animated Captions
```

(80 characters.) Platform names (TikTok, Reels, Shorts) are kept out of the title, tags and preview images.
Envato rejects third-party trademarks in metadata. They appear only once in the description, with a
trademark notice.

## 2. Category

`CodeCanyon › JavaScript › Media`. If the reviewer moves the item, accept
`JavaScript › Miscellaneous` (the catch-all category that holds most Node.js tools).

## 3. Key features (shown in search results: up to 3, ≤ 45 characters each, no caps or special characters)

```
Visual editor timed to your spoken words
English and Arabic word by word captions
AI agent ready with a built in MCP server
```

## 4. Short pitch (for the first line of the description, social posts and the YouTube video)

```
Design animated vertical explainer videos in a visual editor that times everything to your own voice: word-by-word captions, sound effects and platform-ready MP4s. Runs offline. No subscription.
```

## 5. Description

Paste the HTML from `item-description.html` (headings, paragraphs, lists, `pre` and `code` only, with no
inline styles or scripts). If you later host images on your own server, you can add `<img>` tags between
sections. Envato does not host description images.

## 6. Tags (code items: maximum 15, lowercase, no trademarks, no username, no other authors' item names)

```
video editor, video generator, explainer video, vertical video, short video, animated captions, subtitles, motion graphics, video maker, timeline editor, arabic, mcp, ai agent, typescript, nodejs
```

## 7. Attributes

| Field               | Value                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Software version    | Node.js (select it if the list offers it; otherwise pick the closest JavaScript option and give the versions in the description) |
| Compatible browsers | Chrome, Edge, Firefox (the local dashboard and editor). Do not tick IE or Safari                                                 |
| Files included      | JavaScript JS, HTML, CSS, JSON (TypeScript, YAML and Markdown are inside the source tree; tick the closest options available)    |
| High resolution     | Yes (1080×1920 output)                                                                                                           |
| Documentation       | Well Documented (offline HTML in `documentation/`, English)                                                                      |
| Layout              | Responsive (dashboard), if the field is shown                                                                                    |
| Demo URL            | YouTube link to `demo.mp4` (see §9)                                                                                              |
| Item support        | Enable. 6 months included, as described in SUPPORT.md                                                                            |
| Suggested price     | Regular license $39 to $49 (comparable desktop video tools on CodeCanyon). Envato makes the final pricing decision               |

## 8. Files to upload

| Upload field                        | File (produced by `pnpm release`)                              | Spec checked                                             |
| ----------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Thumbnail                           | `release/ReelForge-<v>-marketing/thumbnail.png`                | 80×80 PNG                                                |
| Inline preview (if the form asks)   | `release/ReelForge-<v>-marketing/inline-preview.jpg`           | 590×300 JPEG                                             |
| Cover image (if the form asks)      | `release/ReelForge-<v>-marketing/cover-2340x1560.jpg`          | 3:2 ratio, 2340×1560 recommended, JPEG < 20 MB           |
| Main files                          | `release/ReelForge-<v>.zip`                                    | Source + prebuilt dist + English HTML docs + installers  |
| Preview screenshots (ZIP)           | `release/ReelForge-<v>-previews.zip`                           | 18 screenshots ≥ 1170 px wide + 8 full-resolution frames |
| Video preview                       | `release/ReelForge-<v>-marketing/demo.mp4` → upload to YouTube | Rendered with ReelForge from example ep02                |
| Wide banner (social media, YouTube) | `release/ReelForge-<v>-marketing/cover-1920x1080.jpg`          | 16:9                                                     |

## 9. Video preview (YouTube)

- **Title:** `ReelForge - Voice and YAML to Vertical Explainer Videos (Demo)`
- **Description:** the short pitch from §4, then "Made entirely with ReelForge, available on CodeCanyon."
- Upload `demo.mp4` as a public or unlisted Short. Optionally add a 60–90 second screen recording of the
  dashboard flow (create → upload voice → mark cues → preview → render) as a second video.

## 10. Message to the reviewer

```
Hello, and thank you for reviewing ReelForge.

ReelForge is a desktop tool built on Node.js. It is not a website script and needs no server or hosting.
It turns a voice recording into a finished 1080×1920 vertical video designed in a browser-based visual
editor (canvas, inspector, timeline) served on 127.0.0.1. Rendering runs in headless Chromium (Playwright)
and encoding in FFmpeg. An optional MCP server lets AI assistants drive it; no AI is needed to use it.

How to test it quickly (about 5 minutes):
1. Unzip, then run install.bat (Windows) or ./install.sh (macOS/Linux). The installer checks Node.js 22,
   offers to install FFmpeg, installs dependencies, downloads Chromium and runs "reelforge doctor".
2. Run start.bat, ReelForge.command or ./start.sh. The dashboard opens at http://127.0.0.1:4310.
3. Click "Open editor" on any example episode to try the editor, or click Render (tick "Allow rendering without a voice recording", because no voice recording is included) and play the result in the dashboard.
The documentation is in documentation/index.html.

Notes:
- Full, unminified TypeScript source is included next to the prebuilt dist; 117 automated tests run with "pnpm test".
- All preview images and the demo video were made with ReelForge and the included examples; nothing in them
  is missing from the download.
- Bundled fonts are SIL OFL 1.1 and npm dependencies are MIT/ISC/Apache-2.0. Credits are in
  THIRD-PARTY-NOTICES.md. FFmpeg and Chromium are not bundled.
- The dashboard listens on 127.0.0.1 only and checks request origins.
- This item is exclusive to Envato Market and is not published or sold anywhere else.
```

## 11. Pre-submission checklist (common rejection reasons)

| Envato requirement / rejection reason                                 | Status                                                                                                                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Documentation in English, HTML or PDF, covering install/use/customize | `documentation/index.html` (15 chapters: 12 manual chapters, the authoring guide, the component reference and the changelog) |
| Credits for third-party assets in the documentation                   | `THIRD-PARTY-NOTICES.md` + License chapter in the docs                                                                       |
| Unminified source code included                                       | `packages/*/src` (TypeScript) included alongside `dist`                                                                      |
| Third-party assets licensed for redistribution                        | OFL fonts and permissive npm packages only; FFmpeg/Chromium not bundled                                                      |
| Preview content not included in the download is disclosed             | None. Every preview is made from the included examples (stated in the description)                                           |
| No trademarks in title, tags or preview images                        | Done. Platform names appear only in the description, with a trademark notice                                                 |
| Item not available free or elsewhere (exclusivity)                    | **Action: make the GitHub repository private before submitting** (see below)                                                 |
| Works on a clean machine                                              | `pnpm release` installs from the ZIP and renders two videos; also test real Windows and Mac                                  |
| No security or malware issues                                         | `pnpm audit` clean; localhost-only server with origin checks and path containment                                            |
| Quality / not too general                                             | 21 components, dashboard, visual editor, MCP server, 13 lint rules, audio mastering, 117 tests                               |
| Support policy stated                                                 | `SUPPORT.md`, plus the Support section of the description                                                                    |
| Changelog                                                             | `CHANGELOG.md` and the end of the description                                                                                |
| Thumbnail 80×80, inline preview 590×300, cover 3:2                    | Generated and checked by `scripts/marketing.mjs`                                                                             |

### Before you press Submit

1. Run `pnpm release` and use the files in `release/`.
2. Make the GitHub repository **private**. Earlier commits were MIT-licensed, and an item that is
   available free elsewhere gets a hard rejection.
3. Install from the ZIP once on a real Windows 10/11 PC and once on a Mac.
4. Upload `demo.mp4` to YouTube and set it as the preview or demo link.
5. Fill in your author profile (avatar, short bio) and Envato tax information. Turn on item support.
