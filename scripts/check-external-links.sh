#!/bin/sh
set -eu

lychee \
    --no-progress \
    --accept-timeouts \
    --accept '100..=103,200..=299,403,429' \
    --max-retries 1 \
    --timeout 10 \
    --scheme https \
    --scheme http \
    README.md CLAUDE.md 'content/**/*.md' 'docs/**/*.md'
