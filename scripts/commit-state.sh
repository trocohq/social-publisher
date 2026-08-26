#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 1 ]] || [[ -z "$1" ]]; then
  echo "usage: scripts/commit-state.sh <message>" >&2
  exit 2
fi

if [[ -z "${GITHUB_REF_NAME:-}" ]]; then
  echo "GITHUB_REF_NAME is required" >&2
  exit 2
fi

git add -- state/index.json 'state/campaigns/*.json'

unexpected="$(git diff --cached --name-only | awk '!/^state\/index\.json$/ && !/^state\/campaigns\/[^/]+\.json$/ { print }')"
if [[ -n "$unexpected" ]]; then
  echo "refusing to commit non-state paths" >&2
  exit 1
fi

if git diff --cached --quiet; then
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -m "$1"

if git push origin "HEAD:${GITHUB_REF_NAME}"; then
  exit 0
fi

git fetch origin "$GITHUB_REF_NAME"
git rebase "origin/$GITHUB_REF_NAME"
npm run validate
git push origin "HEAD:${GITHUB_REF_NAME}"
