# Render options and publish metadata

## CLI options

```bash
./reelforge render ep10                          # master + share + SRT + sheet + publish.md
./reelforge render ep10 --silent                 # no voice yet (preview render)
./reelforge render ep10 --fast                   # faster encoding, slightly larger master
./reelforge render ep10 --denoise                # RNNoise on the voice before mastering
./reelforge render ep10 --preset reels --share-size 50
./reelforge render ep10 --from 12 --to 20        # partial → out/ep10.part.mp4
./reelforge render --all                         # every episode in episodes/
./reelforge render ep10 --json                   # machine-readable result
```

Other flags: `--workers <n>`, `--no-sfx`, `--no-share`, `--lossless`, `--no-denoise`,
`--keep-tmp`, `--no-measure`. A 2-minute episode takes roughly 5–10 minutes on 4–8 cores.

Every file is verified after encoding (H.264 High, yuv420p, 30 fps, AAC 48 kHz, fast start, size
cap). The master is loudness-normalized to −14 LUFS.

## Presets

| Preset   | Use for          | Max duration | Notes                                |
| -------- | ---------------- | ------------ | ------------------------------------ |
| `tiktok` | TikTok (default) | 600 s        | Widest right rail; the safest layout |
| `reels`  | Instagram Reels  | 900 s        |                                      |
| `shorts` | YouTube Shorts   | 180 s        | Upload `<id>.srt` as subtitles       |

`meta.preset` sets the default; `--preset` / `preset` overrides it per render. Re-validate with the
target preset (`reelforge validate ep10 --preset reels`) before rendering for another platform.

## Publish metadata

`meta.publish` becomes `out/publish.md`, ready to paste:

```yaml
meta:
  id: azur01
  publish:
    cover: 'Why 5 days at the port?' # ≤ 6 words, the hook as a promise
    caption: 'Where container days really go, and the one habit that saves three of them.'
    hashtags: ['#logistics', '#shipping', '#supplychain']
    pinned: 'Comment SLOTS for part two: how truck slots work.'
```

- **cover**: short, readable at thumbnail size; matches the hook. Make the image with
  `reelforge snap <id> <time> --cover`.
- **caption**: one or two sentences, no claims the video does not make; no real brands.
- **hashtags**: 3–6, specific before generic, in the video's language (Arabic tags are fine).
- **pinned**: repeats the CTA (comment keyword, next episode).
- Chapters from `chapters:` are added to `publish.md` automatically.
