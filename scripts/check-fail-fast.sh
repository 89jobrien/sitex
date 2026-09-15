#!/bin/sh
set -eu

fixture_dir=$(mktemp -d "${TMPDIR:-/tmp}/sitex-fail-fast.XXXXXX")
fixture="$fixture_dir/fail-fast.crux"
marker="$fixture_dir/continued"
trap 'rm -rf "$fixture_dir"' EXIT HUP INT TERM

cat >"$fixture" <<EOF
pipeline: fail-fast-fixture
steps:
  - step: expected_failure
    handler: shell::capture
    args: { cmd: "exit 23" }
  - step: must_not_run
    handler: shell::capture
    args: { cmd: "touch '$marker'" }
EOF

if crux run "$fixture" >/dev/null 2>&1; then
    printf '%s\n' "failure fixture unexpectedly succeeded" >&2
    exit 1
fi

if test -e "$marker"; then
    printf '%s\n' "failure fixture continued after an error" >&2
    exit 1
fi

printf '%s\n' "fail-fast propagation: ok"
