#!/bin/sh
set -eu

crux check Cruxfile scripts/*.crux

for target in format format-check lint check build serve ci; do
    crux run Cruxfile "$target" --dry-run >/dev/null
done

printf '%s\n' "workflow syntax and plans: ok"
