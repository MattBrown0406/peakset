#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/ios/PeakSet/Web"

mkdir -p "$WEB_DIR/assets"
cp "$ROOT_DIR/index.html" "$ROOT_DIR/app.js" "$ROOT_DIR/styles.css" "$WEB_DIR/"
cp "$ROOT_DIR/assets/physique-lines.svg" "$WEB_DIR/assets/"
