#!/usr/bin/env bash
# Sparse-clone only the data/ folder of Mini Tokyo 3D at the commit pinned in
# pipeline/config/build.toml, into .cache/mt3d (gitignored).
# The raw timetables are never committed to this repo (see DECISIONS.md, licensing).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN="$(sed -n 's/^mt3d_commit = "\([0-9a-f]\{40\}\)".*/\1/p' "$ROOT/pipeline/config/build.toml")"
if [ -z "$PIN" ]; then
  echo "error: no mt3d_commit found in pipeline/config/build.toml" >&2
  exit 1
fi
DEST="$ROOT/.cache/mt3d"
if [ ! -d "$DEST/.git" ]; then
  git clone -q --filter=blob:none --no-checkout https://github.com/nagix/mini-tokyo-3d.git "$DEST"
fi
cd "$DEST"
git sparse-checkout set --no-cone /data/
git fetch -q origin "$PIN" || true
git checkout -q "$PIN"
echo "mini-tokyo-3d data at $(git rev-parse HEAD)"
