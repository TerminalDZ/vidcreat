# ADR-006: Two outputs (master + size-targeted share) and the bitrate formula

- Status: accepted · Date: 2026-10-15

## Decision

- **Master:** H.264 High, CRF 18, `slow`, yuv420p, 30 fps CFR, AAC 192 kb/s 48 kHz, faststart.
- **Share:** two-pass at `video_kbps = floor((MB × 8192 × 0.97) / duration) − 128`, maxrate 1.5×,
  bufsize 3×, AAC 128 kb/s, capped at 8 Mb/s (higher buys nothing visible at 1080×1920@30).
  If the result exceeds the cap it is re-encoded once at 90 %.

## Consequences

Platforms re-encode uploads anyway; a predictable, compliant share file avoids rejection and keeps
upload fast, while the master stays archival quality. Every output is verified with ffprobe (NFR-13).
