#!/usr/bin/env bash
# Push every KEY=VALUE in an env file to a linked Vercel project as Production.
# Usage: ./push-vercel-env.sh <env-file> <vercel-cwd> [allowlist-regex]
#
# allowlist-regex (optional) — only push keys matching this regex.
set -euo pipefail

env_file="${1:?env file path required}"
vercel_cwd="${2:?vercel cwd (project dir) required}"
allow="${3:-.*}"

if [[ ! -f "$env_file" ]]; then
  echo "missing env file: $env_file" >&2
  exit 1
fi

count=0
skipped=0

while IFS= read -r line || [[ -n "$line" ]]; do
  # strip leading whitespace
  line="${line#"${line%%[![:space:]]*}"}"
  # ignore empty + comments
  [[ -z "$line" ]] && continue
  [[ "$line" =~ ^# ]] && continue

  # split on first =
  key="${line%%=*}"
  val="${line#*=}"

  # strip wrapping quotes if present
  if [[ "$val" =~ ^\".*\"$ ]]; then val="${val:1:-1}"; fi
  if [[ "$val" =~ ^\'.*\'$ ]]; then val="${val:1:-1}"; fi

  # strip trailing inline comment ` # ...`  (we use a literal " #")
  val="${val%% #*}"

  if [[ ! "$key" =~ $allow ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  echo "→ $key"
  vercel env add "$key" production \
    --cwd "$vercel_cwd" \
    --value "$val" \
    --force \
    --yes \
    </dev/null >/dev/null
  count=$((count + 1))
done < "$env_file"

echo
echo "pushed $count vars (skipped $skipped) → $vercel_cwd"
