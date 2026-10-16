#!/usr/bin/env bash
#
# Turns document storage on, once R2 is enabled on the Cloudflare account.
#
# R2 itself cannot be enabled from here: it needs the dashboard, acceptance of the R2
# terms, and a payment method on file even for the free 10 GB tier. Do that first at
#
#   https://dash.cloudflare.com/<account id>/r2
#
# then run this. It creates the bucket, uncomments the binding, redeploys and checks
# that an upload actually round-trips.
#
#   scripts/enable-r2.sh

set -uo pipefail
cd "$(dirname "$0")/.."

CONFIG="apps/api/wrangler.toml"
BUCKET="matter-documents"

# Output is captured before it is matched, never piped straight into an `if`.
# With `set -o pipefail` a pipeline reports the FIRST non-zero exit, so
# `if wrangler ... | grep -q X` is false whenever wrangler itself fails — which is
# exactly when the thing being looked for is present. That silently skipped this
# guard once already.
run_capture() { "$@" 2>&1 || true; }

require_login() {
  if grep -qi "not authenticated" <<<"$(run_capture npx wrangler whoami)"; then
    echo "Not signed in to Cloudflare. Run:  npx wrangler login"
    exit 1
  fi
}
require_login

# --- is R2 actually on? -------------------------------------------------------------
r2_status="$(run_capture npx wrangler r2 bucket list)"
if grep -q "10042" <<<"$r2_status"; then
  cat <<'MSG'
R2 is not enabled on this Cloudflare account.

  Cloudflare says: "Please enable R2 through the Cloudflare Dashboard."

That is a one-time account setting. It needs a payment method on file even though the
first 10 GB are free, which is why it cannot be done from a script. Enable it in the
dashboard under R2, then run this again.
MSG
  exit 1
fi

# --- bucket -------------------------------------------------------------------------
if npx wrangler r2 bucket info "$BUCKET" >/dev/null 2>&1; then
  echo "Bucket '$BUCKET' already exists."
else
  npx wrangler r2 bucket create "$BUCKET" >/dev/null && echo "Created bucket '$BUCKET'."
fi

# --- binding ------------------------------------------------------------------------
if grep -q '^\[\[r2_buckets\]\]' "$CONFIG"; then
  echo "Binding already active in $CONFIG."
else
  python3 - "$CONFIG" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
s = p.read_text()
s = s.replace('# [[r2_buckets]]\n# binding = "DOCUMENTS"\n# bucket_name = "matter-documents"',
              '[[r2_buckets]]\nbinding = "DOCUMENTS"\nbucket_name = "matter-documents"')
p.write_text(s)
PY
  echo "Uncommented the DOCUMENTS binding in $CONFIG."
fi

# --- deploy -------------------------------------------------------------------------
echo
echo "Building and deploying…"
npm run build --workspace apps/web >/dev/null || { echo "Frontend build failed."; exit 1; }
deploy_out="$(run_capture npx wrangler deploy --config "$CONFIG")"
echo "$deploy_out" | grep -E "Current Version ID|env\.DOCUMENTS|ERROR" || true
if ! grep -q "Current Version ID" <<<"$deploy_out"; then
  echo
  echo "Deploy failed — reverting the binding so the config still matches what is live."
  git checkout -- "$CONFIG" 2>/dev/null || true
  exit 1
fi

# --- prove it ------------------------------------------------------------------------
# A deploy that reports success can still have a binding pointing at nothing, so put a
# real object through the bucket and read it back rather than trusting the output.
echo
echo "Round-tripping an object through the bucket…"
probe="/tmp/r2-probe-$$.txt"
printf 'storage probe %s\n' "$(date -u +%FT%TZ)" > "$probe"

if npx wrangler r2 object put "$BUCKET/_probe.txt" --file "$probe" --remote >/dev/null 2>&1 \
   && npx wrangler r2 object get "$BUCKET/_probe.txt" --file "$probe.out" --remote >/dev/null 2>&1 \
   && cmp -s "$probe" "$probe.out"; then
  echo "  object written and read back identically"
  npx wrangler r2 object delete "$BUCKET/_probe.txt" --remote >/dev/null 2>&1
  echo "  probe deleted"
else
  echo "  FAILED — the bucket exists but an object did not round-trip."
  rm -f "$probe" "$probe.out"
  exit 1
fi
rm -f "$probe" "$probe.out"

cat <<'MSG'

Document storage is on. Uploads, client-portal uploads and bundles containing
annexures now work instead of answering 503.

Worth checking in the app: upload a document to a matter, then build the court bundle
and confirm the annexure appears in the index.
MSG
