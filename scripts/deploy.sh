#!/usr/bin/env bash
#
# Builds the frontend and deploys the Worker that serves it alongside the API.
#
# The build comes first and is not optional: [assets] in wrangler.toml points at
# apps/web/dist, so deploying without building ships whatever was there last time.
#
# Requires `wrangler login` and scripts/provision.sh to have run.

set -euo pipefail

cd "$(dirname "$0")/.."
CONFIG="apps/api/wrangler.toml"

# `wrangler whoami` exits 0 even when signed out, so the exit code proves nothing —
# the answer is in its output. Capture it rather than piping into `if`: under
# `set -o pipefail` a pipeline reports the first non-zero exit, so a failing command
# makes the test false even when grep matched.
require_login() {
  if grep -qi "not authenticated" <<<"$(npx wrangler whoami 2>&1 || true)"; then
    echo "Not signed in to Cloudflare. Run:  npx wrangler login"
    exit 1
  fi
}
require_login

if grep -q 'local-dev-placeholder' "$CONFIG"; then
  echo "${CONFIG} still contains local-dev-placeholder."
  echo "Run scripts/provision.sh first, or the deploy will point at nothing."
  exit 1
fi

if grep -q 'ENVIRONMENT = "development"' "$CONFIG"; then
  echo "WARNING: ENVIRONMENT is still \"development\"."
  echo "The session cookie will not be marked Secure. Set it to \"production\" first."
  printf 'Deploy anyway? [y/N] '
  read -r reply
  [ "$reply" = "y" ] || exit 1
fi

echo "Checking before deploy…"
npm run typecheck
npm test

echo "Building the frontend…"
npm run build

echo "Deploying…"
npx wrangler deploy --config "$CONFIG"

echo
echo "Deployed. Two things to check on the dashboard:"
echo "  - The workers.dev URL is public. For something holding client records, put it"
echo "    behind your own domain and disable the workers.dev route."
echo "  - Do NOT run apps/api/scripts/seed.mjs against this. It writes a demo firm and"
echo "    a known password. Create the real firm through the app."
