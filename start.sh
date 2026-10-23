#!/usr/bin/env bash
# Opens the ReelForge dashboard in your browser. Your episodes live in ./episodes.
cd "$(dirname "$0")"
exec node packages/cli/bin/reelforge.js studio "$@"
