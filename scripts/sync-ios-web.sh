#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/ios/PeakSet/Web"

mkdir -p "$WEB_DIR/assets"
cp "$ROOT_DIR/index.html" "$ROOT_DIR/styles.css" "$WEB_DIR/"
# Every script index.html loads, in order.
grep -o 'src="\./[A-Za-z0-9_-]*\.js"' "$ROOT_DIR/index.html" | sed 's/src="\.\///; s/"$//' | while read -r script; do
  cp "$ROOT_DIR/$script" "$WEB_DIR/"
done
cp "$ROOT_DIR/assets/physique-lines.svg" "$WEB_DIR/assets/"
cp "$ROOT_DIR/assets/boxing-bell.wav" "$WEB_DIR/assets/"
# The native rest-timer notification plays the same bell from the app bundle root.
cp "$ROOT_DIR/assets/boxing-bell.wav" "$ROOT_DIR/ios/PeakSet/boxing-bell.wav"
# Drop bundle files that are no longer part of the web app so stale modules
# never ship inside the folder reference.
find "$WEB_DIR" -type f | while read -r bundled; do
  relative="${bundled#"$WEB_DIR/"}"
  case "$relative" in
    index.html|styles.css|assets/physique-lines.svg|assets/boxing-bell.wav) ;;
    *.js) grep -q "src=\"\./$relative\"" "$ROOT_DIR/index.html" || rm "$bundled" ;;
    *) rm "$bundled" ;;
  esac
done
