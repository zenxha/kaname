#!/usr/bin/env bash
# Sparse-clone only the data/ folder of Mini Tokyo 3D at the commit the M0 spike used.
# The raw timetables are NOT committed to this repo (see DECISIONS.md, licensing).
set -euo pipefail
PIN=fa7833f18a288aeca171b68892bb7f67e229e4ca   # 2026-11-02 "Update station exit poi data"
DEST="$(cd "$(dirname "$0")" && pwd)/.cache/mt3d"
if [ ! -d "$DEST/.git" ]; then
  git clone -q --filter=blob:none --no-checkout https://github.com/nagix/mini-tokyo-3d.git "$DEST"
fi
cd "$DEST"
git sparse-checkout set --no-cone /data/
git fetch -q origin "$PIN" || true
git checkout -q "$PIN"
echo "mini-tokyo-3d data at $(git rev-parse HEAD)"
