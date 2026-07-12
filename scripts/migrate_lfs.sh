#!/usr/bin/env bash
# Move the large model / wasm binaries to Git LFS.
#
# This REWRITES git history for the current branch and must be followed by a
# force-push, so it is intentionally not run for you. Read docs/WEIGHTS.md first:
# LFS on this project needs Vercel LFS pull enabled and can hit the free LFS
# bandwidth quota. Keeping the weights self-hosted in the repo is also fine.
#
# Usage:
#   bash scripts/migrate_lfs.sh          # dry run: print the plan, change nothing
#   bash scripts/migrate_lfs.sh --yes    # perform the migration (history rewrite)
#
# After --yes:  git push --force-with-lease   (then enable LFS in Vercel)

set -euo pipefail

PATTERNS='*.onnx *.wasm'
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "Git LFS migration plan"
echo "  branch:   $BRANCH"
echo "  patterns: $PATTERNS"
echo "  binaries currently in the tree:"
find frontend/public -type f \( -name '*.onnx' -o -name '*.wasm' \) -exec du -h {} + 2>/dev/null | sort -rh | sed 's/^/    /'

if ! command -v git-lfs >/dev/null 2>&1; then
  echo
  echo "git-lfs is not installed. Install it first:"
  echo "  macOS:  brew install git-lfs"
  echo "  Debian: sudo apt-get install git-lfs"
  exit 1
fi

if [ "${1:-}" != "--yes" ]; then
  echo
  echo "Dry run only. Re-run with --yes to perform the migration."
  echo "That will: install the LFS hooks, write .gitattributes, and run"
  echo "'git lfs migrate import' (rewrites history). You then force-push."
  exit 0
fi

echo
echo "Migrating $BRANCH history to LFS. This rewrites commits on this branch."
git lfs install
# shellcheck disable=SC2086
git lfs migrate import --include="${PATTERNS// /,}" --include-ref="refs/heads/$BRANCH"

echo
echo "Done. Next steps (not automated):"
echo "  1. git push --force-with-lease origin $BRANCH"
echo "  2. In Vercel: Project Settings -> Git -> enable Git LFS, then redeploy."
echo "  3. Watch the GitHub LFS bandwidth quota (1 GB/month on the free tier)."
