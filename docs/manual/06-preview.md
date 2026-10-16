# Live preview

The preview renders the real 1080×1920 frame (the same engine as the final render) in sync with your
voice. Save `episode.yaml`, the theme or the cues and it reloads in under a second, keeping the playhead.

![Preview with safe zones](assets/03-studio-preview-safe-zones.jpg)

| Key   | Overlay                                                                      |
| ----- | ---------------------------------------------------------------------------- |
| **Z** | Platform UI safe zones (where TikTok/Reels/Shorts draw buttons and captions) |
| **B** | Stage bounds and the caption line                                            |
| **E** | Every element's box with its id                                              |
| **T** | Time and frame readout                                                       |

![Element boxes](assets/04-studio-preview-element-boxes.jpg)

The **Lint** panel lists every issue; click one to jump to its time, or its `episode.yaml:line` link to
open the file in VS Code.

![Lint panel](assets/08-studio-lint-panel.jpg)

If the YAML cannot be read (a typo, a bad indentation), an overlay shows the exact line and column and the
preview keeps showing the last good version.

![YAML error](assets/06-studio-yaml-error-overlay.jpg)
