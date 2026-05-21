#!/bin/zsh
set -e

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"
npm run build
TARGETS=(
  "/Users/jd/Documents/obsidian-temp/obsidian vault (root)/.obsidian/plugins/streak-tracker"
  "/Users/jd/Library/Mobile Documents/iCloud~md~obsidian/Documents/obsidian vault (ios)/.obsidian/plugins/streak-tracker"
)

for target in "${TARGETS[@]}"; do
  echo "→ $target"
  mkdir -p "$target"
  cp "$SCRIPT_DIR/dist/main.js" "$target/main.js"
  cp "$SCRIPT_DIR/styles.css" "$target/styles.css"
  cp "$SCRIPT_DIR/manifest.json" "$target/manifest.json"
done

echo "Done."
