#!/usr/bin/env bash
# Deploy the Series Radar API to the server directory used by systemd.
#
#   ./server/deploy.sh                 # sync server.py and restart
#   INSTALL_UNIT=1 ./server/deploy.sh  # also refresh the systemd unit
#
# Secrets live outside git: /opt/series-radar-api/token and env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${SERIES_RADAR_DEPLOY_DIR:-/opt/series-radar-api}"
PORT="${SERIES_RADAR_PORT:-8090}"

install -d -m 0755 "$DEST"
install -m 0644 "$ROOT/server/server.py" "$DEST/server.py"
rm -rf "$DEST/series_radar"
cp -a "$ROOT/server/series_radar" "$DEST/series_radar"
find "$DEST/series_radar" -name '__pycache__' -type d -prune -exec rm -rf {} +

# Optional compiled parser; the API falls back to Python when it is absent.
if [[ "${SERIES_RADAR_BUILD_NATIVE:-1}" == "1" ]] && command -v cargo >/dev/null 2>&1; then
  "$ROOT/server/build-native.sh"
fi
if [[ -d "$ROOT/server/series_radar_downloads_rs" ]]; then
  rm -rf "$DEST/series_radar_downloads_rs"
  cp -a "$ROOT/server/series_radar_downloads_rs" "$DEST/series_radar_downloads_rs"
fi

if [[ "${INSTALL_UNIT:-0}" == "1" ]]; then
  install -m 0644 "$ROOT/server/series-radar-api.service" /etc/systemd/system/series-radar-api.service
  systemctl daemon-reload
fi

systemctl restart series-radar-api.service
sleep 2
curl -fsS "http://127.0.0.1:${PORT}/api/health"
echo
echo "✅ API deployed to $DEST"
