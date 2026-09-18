#!/bin/sh
# managed by wikipoke: `wikipoke hooks add` rewrites this file, `wikipoke hooks remove` deletes it.
#
# The wiki's notifier, run by whichever hooks the project chose (after a commit, at the start of an
# agent session). It prints what the code moved past (commits not indexed, pages whose sources
# changed, the citations that moved with them) and nothing when the wiki is current. Coverage is
# left to `wikipoke check`: that backlog is meant to outlive every pass, and a notifier that
# repeats it is never silent. It never calls a model, never edits anything and never fails:
# writing the wiki stays a person's call, through wikipoke-ingest.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$root/wiki/.wikipoke-state.json" ] || exit 0   # not seeded yet: nothing to report
cd "$root" || exit 0

if [ -x node_modules/.bin/wikipoke ]; then
  node_modules/.bin/wikipoke check drift 2>/dev/null
elif command -v wikipoke >/dev/null 2>&1; then
  wikipoke check drift 2>/dev/null
fi
exit 0
