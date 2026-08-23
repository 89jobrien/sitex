---
title: "sanctum"
date: 2026-08-18
description: "Claude Code plugin that validates 1Password auth and traces direnv/op:// secret chains on session start, with an on-demand op-resolver skill."
extra:
  repo: ""
---

# sanctum

1Password and direnv session management — secrets validation and env chain tracing.

## Installation

```bash
claude plugin add github:89jobrien/sanctum
```

## Skills

| Skill       | Trigger                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| op-resolver | "resolve secrets", "check 1password", "debug env", `/sanctum:op-resolver` |

## Hooks

`SessionStart` — runs automatically on every new Claude session:

1. Validates `op account list`
2. Traces `.envrc` `source_up` chain from CWD
3. Counts `op://` refs and detects literal URIs in environment
4. Returns system message to Claude with readiness summary

## Slash Command

`/sanctum:op-resolver` — invoke op-resolver on demand mid-session.

## Prerequisites

- 1Password CLI (`op`) installed and on PATH
- `direnv` installed (optional — chain tracing degrades gracefully without it)
- Install `atelier` for `handon` skill that session-start chains into
