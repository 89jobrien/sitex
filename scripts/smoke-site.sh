#!/bin/sh
set -eu

output_dir=${1:?usage: smoke-site.sh OUTPUT_DIR}
homepage="$output_dir/index.html"

test -f "$homepage"
test -f "$output_dir/projects/minibox/index.html"
test -f "$output_dir/blog/prompts-as-interfaces/index.html"
test -f "$output_dir/atom.xml"

grep -E 'href="[^"]*/sitex/projects/' "$homepage" >/dev/null
grep -E 'href="[^"]*/sitex/blog/' "$homepage" >/dev/null

if grep -E 'href="/(projects|blog)/' "$homepage" >/dev/null; then
    printf '%s\n' "homepage contains a link that drops the /sitex prefix" >&2
    exit 1
fi

printf '%s\n' "site smoke check: ok"
