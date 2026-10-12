# ADR-001: DOM/SVG in headless Chromium as the rendering surface

- Status: accepted · Date: 2026-10-15

## Context

Episodes need rich typography (Arabic shaping, bidi, variable fonts), crisp vector diagrams and code
with syntax colors. Options considered: HTML Canvas 2D, Motion Canvas, Remotion, and plain DOM/SVG
rendered by headless Chromium.

## Decision

Components render to DOM and SVG inside a 1080×1920 page. Chromium (pinned through Playwright)
captures each frame. Canvas is used only where per-pixel work is natural (grain, particles,
background glow).

## Consequences

- Text layout, Arabic shaping and bidi come from Chromium, the most battle-tested engine for them.
- The same runtime powers the studio preview and the final render (what you see is what you get).
- Remotion was rejected: its license is not permissive for companies, and it brings React.
  Motion Canvas was rejected: its own text layout lacks robust Arabic/bidi support.
- Frame capture costs ~100 ms/frame, which parallel workers absorb (ADR-005).
