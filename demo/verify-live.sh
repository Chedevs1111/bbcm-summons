#!/usr/bin/env bash
#
# Confirms what is live at bbcmsummons.co.za matches demo/site.
#
# Run it after uploading. Comparing checksums is the only way to be sure a browser is
# not simply showing you a cached copy of the old file.
#
#   demo/verify-live.sh

set -uo pipefail
cd "$(dirname "$0")"

SITE="${1:-https://bbcmsummons.co.za}"
stale=0

echo "Comparing $SITE against $(pwd)/site"
echo

for file in index.html documents.html preview.png 404.html robots.txt; do
  live=$(curl -s -H 'Cache-Control: no-cache' "$SITE/$file?cb=$RANDOM" --max-time 25 | shasum -a 256 | cut -d' ' -f1)
  local_sum=$(shasum -a 256 "site/$file" | cut -d' ' -f1)
  if [ "$live" = "$local_sum" ]; then
    printf '  %-16s up to date\n' "$file"
  else
    printf '  %-16s STALE — re-upload this one\n' "$file"
    stale=$((stale + 1))
  fi
done

echo
if [ "$stale" -gt 0 ]; then
  echo "$stale file(s) still stale."
  exit 1
fi

# The og:image has to be absolute, or some scrapers will not fetch the card at all.
card=$(curl -s "$SITE/" --max-time 25 | grep -oE '<meta property="og:image" content="[^"]+"' | head -1)
echo "Everything matches."
echo "  ${card:-no og:image found}"
