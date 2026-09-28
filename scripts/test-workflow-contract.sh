#!/bin/sh
set -eu

fail() {
    printf '%s\n' "workflow contract: $*" >&2
    exit 1
}

require_file() {
    test -f "$1" || fail "missing $1"
}

require_text() {
    file=$1
    text=$2
    grep -F "$text" "$file" >/dev/null || fail "$file must contain: $text"
}

reject_text() {
    file=$1
    text=$2
    if grep -F "$text" "$file" >/dev/null; then
        fail "$file must not contain: $text"
    fi
}

for pipeline in format format-check lint check build serve ci; do
    require_file "scripts/$pipeline.crux"
done

require_file scripts/check-zk-templates.sh
require_file scripts/check-workflows.sh
require_file scripts/check-fail-fast.sh
require_file scripts/check-external-links.sh
require_file scripts/smoke-site.sh
require_file .github/workflows/validate.yml
require_file package.json

require_text scripts/format.crux "README.md"
require_text scripts/format.crux "CLAUDE.md"
require_text scripts/format.crux "docs/**/*.md"
require_text scripts/format.crux "ideas/**/*.md"
require_text .prettierignore ".zk/templates/*.md"

require_text scripts/format-check.crux "prettier --no-error-on-unmatched-pattern --check"
require_text scripts/lint.crux "README.md"
require_text scripts/lint.crux "docs/**/*.md"
require_text scripts/lint.crux "ideas/**/*.md"
reject_text scripts/ci.crux "scripts/format.crux"
require_text scripts/ci.crux "scripts/format-check.crux"

require_text .github/workflows/validate.yml "pull_request:"
require_text .github/workflows/validate.yml "zola@0.23.3"
require_text .github/workflows/validate.yml "8d54a65df7696ec01b1ef27a5c0972422020efc1"
require_text .github/workflows/deploy.yml "vars.PAGES_ENABLED == 'true'"

require_text scripts/check-zk-templates.sh "for template in default project post idea"

printf '%s\n' "workflow contract: ok"
