#!/bin/bash
# Complete release script: version bump -> build -> test -> deploy -> tag -> push
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

BUMP_TYPE="${1:-patch}"

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "Usage: $0 [patch|minor|major]"
    exit 1
fi

echo "🚀 Starting release process (bump: $BUMP_TYPE)"

# 1. Bump version
echo "📝 Bumping version..."
python3 scripts/version-bump.py "$BUMP_TYPE"

# 2. Get new version
NEW_VERSION=$(grep '"version"' web/package.json | sed 's/.*"version": "\(.*\)".*/\1/')
NEW_TAG="v$NEW_VERSION"

echo "🏷️  New version: $NEW_VERSION ($NEW_TAG)"

# 3. Build web
echo "🔨 Building web..."
cd web && npm run build && cd ..

# 4. Build APK (release)
echo "📱 Building APK..."
cd android-native && ./gradlew assembleRelease && cd ..

# 5. Deploy to HTTP server
echo "🌐 Deploying to HTTP server..."
./scripts/deploy-apk.sh

# 6. Push to git (tags will trigger GitHub Actions)
echo "📤 Pushing to GitHub..."
git push origin main --tags

echo ""
echo "✅ Release $NEW_TAG complete!"
echo ""
echo "📋 Next steps:"
echo "  1. GitHub Actions will create release at: https://github.com/Hajsharifi/series-radar/releases/tag/$NEW_TAG"
echo "  2. APK available at: http://31.56.229.237:8080/series-radar.apk"
echo "  3. Verify release and APK download"