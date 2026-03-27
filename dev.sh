#!/usr/bin/env bash
# Quick start: ./dev.sh
export CC=/usr/bin/gcc
exec /home/paulmv/.local/share/mise/installs/node/latest/bin/node \
  node_modules/.bin/tauri dev "$@"
