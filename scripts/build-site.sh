#!/bin/sh
set -eu

output_dir=$(mktemp -d "${TMPDIR:-/tmp}/sitex-build.XXXXXX")
trap 'rm -rf "$output_dir"' EXIT HUP INT TERM

zola build --force --output-dir "$output_dir"
sh scripts/smoke-site.sh "$output_dir"
