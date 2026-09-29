#!/bin/sh
set -eu

output_dir=${1:?usage: smoke-site.sh OUTPUT_DIR}
homepage="$output_dir/index.html"

test -f "$homepage"
test -f "$output_dir/projects/minibox/index.html"
test -f "$output_dir/sites/index.html"
test -f "$output_dir/blog/prompts-as-interfaces/index.html"
test -f "$output_dir/atom.xml"

grep -E 'href="[^"]*/sitex/projects/' "$homepage" >/dev/null
grep -E 'href="[^"]*/sitex/sites' "$homepage" >/dev/null
grep -E 'href="[^"]*/sitex/blog/' "$homepage" >/dev/null
grep -E 'data-graph-mode="preview"' "$homepage" >/dev/null
grep -E 'data-manifest-url="[^"]*/sitex/data/content-graph.json"' "$homepage" >/dev/null

# The reference-site directory is derived from project metadata, so it must keep
# rendering at least one externally published site.
grep -Eq 'href="https://89jobrien\.github\.io/[a-z0-9-]+/"' "$output_dir/sites/index.html"

if grep -E 'href="/(projects|blog|sites|tags|graph)/' "$homepage" >/dev/null; then
    printf '%s\n' "homepage contains a link that drops the /sitex prefix" >&2
    exit 1
fi

printf '%s\n' "site smoke check: ok"
