#!/bin/sh
# take.sh <video folder> [flags]: checks this Mac, then records and renders.
# caffeinate keeps the display awake through long waits.
set -u
LIB="$(cd "$(dirname "$0")/lib" && pwd)"
[ $# -ge 1 ] || { node "$LIB/make.js"; exit 2; }
node "$LIB/preflight.js" "$@" || exit 1
exec caffeinate -dims node "$LIB/make.js" "$@"
