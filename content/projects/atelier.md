---
title: "atelier"
date: 2026-08-18
description: "Personal Claude Code dev workflow plugin bundling handoff, herald, sentinel, and forge agents for Rust quality gates, code review, CI, git safety, and multi-repo status pulses. Distributed via the bazaar marketplace and depends on sanctum for session-start secret resolution."
taxonomies:
  tags: [agent-harness, automation, developer-experience, security]
extra:
  repo: "https://github.com/89jobrien/atelier"
  related: [project:bazaar, project:devkit, project:sanctum]
---

Personal dev workflow plugin — Rust gates, code review, CI, git safety,
multi-repo pulse.

## Installation

```bash
claude plugin add github:89jobrien/atelier
```

Requires `sanctum` for the session-start hook chain:

```bash
claude plugin add github:89jobrien/sanctum
```

For local repo development, use:

```bash
cd ~/dev/atelier
just init
```

That keeps the Claude plugin installed and also mirrors `skills/`, `bin/`, and the repo root
into Codex-visible locations on machines that have `~/.codex/`.

## Skills

| Skill              | Trigger Phrases                                                   |
| ------------------ | ----------------------------------------------------------------- |
| onboard            | "onboard me", "walk me through setup", `/atelier:onboard`         |
| cargo-gate         | "run gates", "validate rust", "pre-commit check"                  |
| sentinel-autofixer | "autofix", "apply review fixes", "fix sentinel suggestions"       |
| hook-diagnostics   | "failhook", "show hook status", "what hooks ran"                  |
| git-guard          | "safe to commit", "check merge strategy", "commit safely"         |
| ci-assist          | "edit workflow", "fix CI", "check cross-compile", "verify binary" |
| project-pulse      | "end session", "capture state", "session summary"                 |
| handoff            | "write handoff", "end of session", "capture handoff"              |
| handon             | "handon", "start session", "what's outstanding"                   |
| handover           | "visualize the handoff", "show handoff", "generate diagrams"      |

## Agents

> Currently delegates agent logic to devkit and likely always will

| Agent     | Purpose                                            |
| --------- | -------------------------------------------------- |
| sentinel  | Structured code review                             |
| forge     | Dev companion — design, debug, refactor            |
| herald    | Cross-repo synthesis → Obsidian                    |
| conductor | devloop → doob → devkit pipeline                   |
| oxidizer  | Rust-specific review: clippy, unsafe, edition 2024 |

## Notes

- `cargo-gate` runs `cargo xtask pre-commit` first — the xtask gate always takes priority.
- `sanctum` must also be installed for the session-start op-resolver + handon chain.
- All agents are thin wrappers; devkit must be installed and accessible.
- `just reinstall` also runs `bin/sync-codex`, which symlinks the repo into `~/.codex/plugins/atelier`,
  symlinks each skill into `~/.codex/skills/atelier-*`, and symlinks `bin/*` into `~/.local/bin`.
- Skills with scripts (`handoff`, `handover`) resolve them from the plugin cache at runtime via
  version-sorted glob — bumping `version` in `plugin.json` + `just reinstall` is sufficient to
  pick up new scripts.
