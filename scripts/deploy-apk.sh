#!/bin/bash
# Deploy APK to HTTP server
# Usage: ./scripts/deploy-apk.sh [apk_path] [server_user] [server_host] [remote_path]

set -e

APK_PATH="${1:-android-native/app/build/outputs/apk/release/app-release.apk}"
SERVER_USER="${2:-root}"
SERVER_HOST="${3:-31.56.229.237}"
REMOTE_PATH="${4:-/var/www/apk/series-radar.apk}"

if [ ! -f "$APK_PATH" ]; then
    echo "❌ APK not found: $APK_PATH"
    echo "Build release first: cd android-native && ./gradlew assembleRelease"
    exit 1
fi

echo "📦 Deploying $APK_PATH to $SERVER_USER@$SERVER_HOST:$REMOTE_PATH"

# Copy APK
scp "$APK_PATH" "$SERVER_USER@$SERVER_HOST:$REMOTE_PATH"

# Restart sharing service
ssh "$SERVER_USER@$SERVER_HOST" "systemctl restart series-radar-share.service"

# Verify
HTTP_URL="http://$SERVER_HOST:8080/series-radar.apk"
echo "✅ Deployed! Verifying..."
curl -sI "$HTTP_URL" | head -5

echo ""
echo "🌐 APK available at: $HTTP_URL"