#!/bin/sh
set -eu

fail() {
    printf '%s\n' "zk template contract: $*" >&2
    exit 1
}

for template in default project post idea; do
    file=".zk/templates/$template.md"
    test -f "$file" || fail "missing $file"
    test "$(grep -c '^---$' "$file")" -eq 2 || fail "$file must have YAML frontmatter"
    grep -F '{{title}}' "$file" >/dev/null || fail "$file must render a title"
    grep -F 'format-date now' "$file" >/dev/null || fail "$file must render a date"
    grep -F "template = \"$template.md\"" .zk/config.toml >/dev/null || fail "$file is not configured"
done

grep -F 'extra:' .zk/templates/project.md >/dev/null || fail "project template needs extra metadata"
grep -F 'repo:' .zk/templates/project.md >/dev/null || fail "project template needs extra.repo"

for heading in '## Hook' '## Thesis' '## Reader Value' '## Evidence' '## Mini Outline' '## Readiness'; do
    grep -F "$heading" .zk/templates/idea.md >/dev/null || fail "idea template missing $heading"
done

for checker in scripts/check-editorial-content.py scripts/check-editorial.py scripts/editorial-check.py scripts/check-editorial.sh; do
    test -f "$checker" || continue
    case "$checker" in
    *.py) python3 "$checker" ;;
    *) sh "$checker" ;;
    esac
    break
done

printf '%s\n' "zk template contracts: ok"
