#!/usr/bin/env bash
# Build the optional Rust download parser and place it next to series_radar/.
#
#   ./server/build-native.sh
#
# The API runs without this package (series_radar.downloads falls back to the
# Python parser), but production and CI ship it for the ~2x faster page parse.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE="$ROOT/rust/downloads-parser-rs"
OUT="$ROOT/series_radar_downloads_rs"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo not found; cannot build the native download parser" >&2
  exit 1
fi

cargo build --release --manifest-path "$CRATE/Cargo.toml"

LIB="$CRATE/target/release/libseries_radar_downloads_rs.so"
if [[ ! -f "$LIB" ]]; then
  LIB="$CRATE/target/release/libseries_radar_downloads_rs.dylib"
fi
if [[ ! -f "$LIB" ]]; then
  echo "native library not found under $CRATE/target/release" >&2
  exit 1
fi

install -d -m 0755 "$OUT"
install -m 0644 "$CRATE/python/series_radar_downloads_rs/__init__.py" "$OUT/__init__.py"
# abi3-py39: the same file loads on every CPython >= 3.9.
install -m 0755 "$LIB" "$OUT/_native.abi3.so"
echo "native download parser -> $OUT"
