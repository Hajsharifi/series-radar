#!/bin/bash
# Complete local release script: version bump -> web build -> APK build (auto-syncs web assets) -> deploy -> push
# NOTE: GitHub Actions (.github/workflows/release.yml) is the canonical release path.
#       This script is for local emergency releases only.
set -e

BUMP_TYPE="${1:-patch}"
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "Usage: $0 [patch|minor|major]"
    exit 1
fi

echo "🚀 Starting local release (bump: $BUMP_TYPE)"

python3 scripts/version-bump.py "$BUMP_TYPE"
NEW_VERSION=$(grep '"version"' web/package.json | sed 's/.*"version": "\(.*\)".*/\1/')
echo "🏷️  New version: $NEW_VERSION"

echo "🔨 Building web..."
(cd web && npm run build)

# Web assets are synced automatically by the syncWebAssets Gradle task (preBuild dependency).
echo "📱 Building signed release APK (web assets auto-synced)..."
(cd android-native && ./gradlew assembleRelease)

echo "🌐 Deploying to HTTP server..."
./scripts/deploy-apk.sh

echo "📤 Pushing to GitHub (triggers Actions release)..."
git push origin master --tags

echo "✅ Local release $NEW_VERSION complete!"
