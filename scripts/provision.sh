#!/usr/bin/env bash
#
# Creates the Cloudflare stores this app needs and writes their ids into
# apps/api/wrangler.toml.
#
# Safe to run more than once: it skips anything that already exists, and refuses to
# overwrite an id that is not still the local-dev placeholder. It does not deploy —
# read the output, check wrangler.toml, then run scripts/deploy.sh.
#
# Requires `wrangler login` first.

set -euo pipefail

cd "$(dirname "$0")/.."
CONFIG="apps/api/wrangler.toml"
PLACEHOLDER="local-dev-placeholder"

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

echo "Signed in as:"
npx wrangler whoami 2>/dev/null | grep -iE "account|email" | head -3 || true
echo

# --- helper: replace a key's value only while it is still the placeholder ----------
patch_id() {
  local key="$1" value="$2" label="$3"
  if ! grep -qE "^${key} = \"${PLACEHOLDER}\"" "$CONFIG"; then
    echo "  ${label}: ${key} in ${CONFIG} is already set — leaving it alone."
    echo "           If you meant to replace it, edit the file by hand."
    return
  fi
  python3 - "$CONFIG" "$key" "$value" <<'PY'
import pathlib, sys
path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
p = pathlib.Path(path)
p.write_text(p.read_text().replace(f'{key} = "local-dev-placeholder"', f'{key} = "{value}"', 1))
PY
  echo "  ${label}: wrote ${key} = ${value}"
}

# --- D1 ---------------------------------------------------------------------------
echo "D1 database 'bbcm-summons'"
if npx wrangler d1 info bbcm-summons >/dev/null 2>&1; then
  echo "  already exists"
else
  npx wrangler d1 create bbcm-summons >/dev/null
  echo "  created"
fi
DB_ID=$(npx wrangler d1 info bbcm-summons --json 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('uuid',''))")
[ -n "$DB_ID" ] && patch_id "database_id" "$DB_ID" "D1" || echo "  could not read the database id — set database_id by hand"

# --- KV ---------------------------------------------------------------------------
echo "KV namespace 'SESSIONS'"
KV_ID=$(npx wrangler kv namespace list 2>/dev/null \
  | python3 -c "
import sys, json
try:
    for ns in json.load(sys.stdin):
        if ns.get('title','').endswith('SESSIONS'):
            print(ns['id']); break
except Exception:
    pass")
if [ -z "$KV_ID" ]; then
  npx wrangler kv namespace create SESSIONS >/dev/null
  KV_ID=$(npx wrangler kv namespace list 2>/dev/null \
    | python3 -c "
import sys, json
for ns in json.load(sys.stdin):
    if ns.get('title','').endswith('SESSIONS'):
        print(ns['id']); break")
  echo "  created"
else
  echo "  already exists"
fi
[ -n "$KV_ID" ] && patch_id "id" "$KV_ID" "KV" || echo "  could not read the namespace id — set id by hand"

# --- R2 ---------------------------------------------------------------------------
echo "R2 bucket 'matter-documents'"
if npx wrangler r2 bucket info matter-documents >/dev/null 2>&1; then
  echo "  already exists"
else
  npx wrangler r2 bucket create matter-documents >/dev/null
  echo "  created"
fi

echo
echo "Stores ready. Still to do by hand, because each needs a decision:"
echo "  1. Set ENVIRONMENT = \"production\" in ${CONFIG} so the session cookie is Secure."
echo "  2. npm run db:migrate:remote"
echo "  3. npx wrangler secret put ANTHROPIC_API_KEY --config ${CONFIG}"
echo "  4. scripts/deploy.sh"
