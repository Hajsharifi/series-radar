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

if [[ "${INSTALL_UNIT:-0}" == "1" ]]; then
  install -m 0644 "$ROOT/server/series-radar-api.service" /etc/systemd/system/series-radar-api.service
  systemctl daemon-reload
fi

systemctl restart series-radar-api.service
sleep 2
curl -fsS "http://127.0.0.1:${PORT}/api/health"
echo
echo "✅ API deployed to $DEST"
