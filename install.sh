#!/usr/bin/env bash
# ReelForge installer for macOS and Linux.
# Usage: ./install.sh            (interactive)
#        ./install.sh --yes      (accept every prompt, e.g. installing ffmpeg)
set -euo pipefail
cd "$(dirname "$0")"

YES=0
[[ "${1:-}" == "--yes" || "${1:-}" == "-y" ]] && YES=1
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*"; exit 1; }
ask() { # ask "question" → 0 for yes
  [[ $YES == 1 ]] && return 0
  read -r -p "$1 [Y/n] " a </dev/tty || true
  [[ -z "$a" || "$a" =~ ^[Yy] ]]
}

bold "ReelForge installer"
echo

# 1. Node.js 22+
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js 22 or newer is required. Install it from https://nodejs.org (LTS), then run ./install.sh again."
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[[ $NODE_MAJOR -ge 22 ]] || fail "Node.js $(node -v) found; ReelForge needs 22 or newer. Update from https://nodejs.org"
ok "Node.js $(node -v)"

# 2. pnpm via Corepack (ships with Node.js; nothing is installed globally)
PNPM=(corepack pnpm)
if ! corepack pnpm --version >/dev/null 2>&1; then
  warn "Corepack is unavailable; using npx pnpm instead"
  PNPM=(npx --yes pnpm@10.28.0)
fi
ok "pnpm $("${PNPM[@]}" --version)"

# 3. ffmpeg
if command -v ffmpeg >/dev/null 2>&1; then
  ok "$(ffmpeg -hide_banner -version | head -1 | cut -d' ' -f1-3)"
else
  warn "ffmpeg is not installed (needed to render videos)."
  CMD=""
  if [[ "$(uname)" == "Darwin" ]]; then
    command -v brew >/dev/null 2>&1 && CMD="brew install ffmpeg" || warn "Install Homebrew from https://brew.sh, then run: brew install ffmpeg"
  elif command -v apt-get >/dev/null 2>&1; then CMD="sudo apt-get update && sudo apt-get install -y ffmpeg"
  elif command -v dnf >/dev/null 2>&1; then CMD="sudo dnf install -y ffmpeg"
  elif command -v pacman >/dev/null 2>&1; then CMD="sudo pacman -S --noconfirm ffmpeg"
  elif command -v zypper >/dev/null 2>&1; then CMD="sudo zypper install -y ffmpeg"
  fi
  if [[ -n "$CMD" ]] && ask "Install ffmpeg now with: $CMD ?"; then
    eval "$CMD"
    ok "ffmpeg installed"
  else
    warn "Skipping ffmpeg. You can preview episodes, but rendering needs ffmpeg 6 or newer."
  fi
fi

# 4. Dependencies (and build, when running from source)
if [[ -f packages/runtime/dist/page/runtime.js && -f packages/cli/dist/index.js ]]; then
  bold "Installing runtime dependencies (prebuilt package)…"
  "${PNPM[@]}" install --prod --frozen-lockfile
else
  bold "Installing dependencies and building from source…"
  "${PNPM[@]}" install --frozen-lockfile
  "${PNPM[@]}" build
fi
ok "Dependencies installed"

# 5. Chromium (pinned by Playwright) + environment check
bold "Checking the environment…"
if ! node packages/cli/bin/reelforge.js doctor --fix; then
  if [[ "$(uname)" == "Linux" ]] && ask "Install Chromium's system libraries (needs sudo)?"; then
    PW=$(node -p 'require.resolve("playwright/cli.js", { paths: [require.resolve("./packages/renderer/package.json")] })')
    sudo "$(command -v node)" "$PW" install-deps chromium
    node packages/cli/bin/reelforge.js doctor || true
  fi
fi

chmod +x start.sh reelforge 2>/dev/null || true
echo
bold "ReelForge is installed."
echo "  Open the dashboard:   ./start.sh"
echo "  Command line:         ./reelforge --help"
echo "  Documentation:        documentation/index.html"
