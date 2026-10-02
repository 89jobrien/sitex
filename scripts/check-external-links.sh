#!/bin/sh
set -eu

# Link policy: fail on statuses that mean a link is gone (404, 410) and pass on
# statuses that mean the check could not tell (5xx, timeout, 403, 429). An upstream
# outage is not an editorial defect, so it must not redden this gate.
#
# Concurrency and retry pacing are tuned for this corpus: 449 of its 612 links are
# github.com, and the lychee defaults -- ten in flight per host, one retry after 1s --
# drove GitHub into answering 503 for 219 links on 2026-10-01. Three in flight with
# 200ms spacing, three retries, and a 3s wait keeps the signal clean instead.
#
# Verified against controlled statuses: 503 now exits 0, while 404 and 410 still
# exit non-zero, so real dead links are still caught.
lychee \
    --no-progress \
    --accept-timeouts \
    --accept '100..=103,200..=299,403,429,500..=599' \
    --host-concurrency 3 \
    --host-request-interval 200ms \
    --max-retries 3 \
    --retry-wait-time 3 \
    --timeout 10 \
    --scheme https \
    --scheme http \
    README.md CLAUDE.md 'content/**/*.md' 'docs/**/*.md'
