---
title: "neusym"
date: 2026-08-18
description: "An MCP server and CLI bridging Jira and Linear for bidirectional issue sync, built on rmcp/stdio and the crux runtime-trace model — every sync returns an auditable Crux<T> envelope with a step-by-step execution trace. Hexagonal five-crate layout, gated by cargo xtask pre-commit."
extra:
  repo: "https://github.com/89jobrien/neusym"
---

# neusym

An MCP server and CLI that bridges **Jira** and **Linear** for bidirectional issue sync.
Built in Rust with [`rmcp`](https://crates.io/crates/rmcp) over stdio transport and the
[crux](https://github.com/89jobrien/crux) runtime-trace model.

Every sync operation returns a `Crux<T>` envelope: the result value plus a step-by-step
execution trace, so previews, pushes, and health checks are inspectable and auditable.

## Status

Pre-1.0 (`0.0.1`), edition 2024. Mid-migration to a "crux-first" core — see
[docs/HANDOFF.md](docs/HANDOFF.md) for what is in flight and
[docs/TODO.md](docs/TODO.md) for the backlog.

## Layout

Five crates in a hexagonal arrangement (domain core, adapters, application, interface):

| Crate           | Role                                                          |
| --------------- | ------------------------------------------------------------- |
| `neusym-core`   | Domain types, port traits, error model — depends on nothing   |
| `neusym-linear` | Linear GraphQL adapter (implements `IssueProvider`)           |
| `neusym-jira`   | Jira REST adapter (implements `IssueProvider`)                |
| `neusym-sync`   | `NeusymService` orchestration, planner, stores, legacy engine |
| `neusym-mcp`    | Binary `neusym`: CLI + MCP server (rmcp/stdio)                |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full map.

## Prerequisites

`crux-types` is a path dependency at `../crux/crates/crux-types`. Clone
[crux](https://github.com/89jobrien/crux) alongside this repo:

```
~/dev/crux      # https://github.com/89jobrien/crux
~/dev/neusym    # this repo
```

## Build

```bash
cargo build --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings
cargo fmt --all -- --check
```

The full local gate mirrors CI: `cargo xtask pre-commit` (delegates to `taskit`).
See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Configuration

Credentials are read from the environment (see `EnvCredentialResolver`):

| Provider | Variables                                       |
| -------- | ----------------------------------------------- |
| Linear   | `LINEAR_API_KEY`                                |
| Jira     | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |

MCP tool calls may also pass credentials per-call, which override the environment.

State lives under `~/.ctx/neusym/`:

| File            | Contents                                              |
| --------------- | ----------------------------------------------------- |
| `mappings.json` | Linked issue pairs, direction, last-synced timestamp  |
| `sync.log`      | JSONL audit trail of search/link/preview/push actions |
| `health.json`   | Last health-check `Crux` report                       |

## Quickstart (CLI)

```bash
# Try the flow with no network, no credentials:
neusym sync preview JOB-1:PROJ-1 --demo
neusym sync push    JOB-1:PROJ-1 --demo

# Live usage (requires credentials):
neusym search --provider linear "auth bug"
neusym get    --provider jira PROJ-42
neusym sync link --source-provider linear --source ENG-1 \
                 --target-provider jira   --target PROJ-1 \
                 --direction bidirectional
neusym sync preview ENG-1:PROJ-1 --strategy source-wins
neusym sync push    ENG-1:PROJ-1 --strategy source-wins
neusym sync status
neusym health

# Any command accepts --json for machine-readable Crux output.
```

## Quickstart (MCP)

```bash
neusym serve   # speaks MCP over stdio
```

Exposed tools: `search`, `get`, `sync_link`, `sync_preview`, `sync_push`, `sync_status`,
`sync_health`. All text results are scrubbed through `obfsck` before leaving the process.

## Documentation

| Doc                                  | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Crate graph, ports, sync flow, crux model |
| [CONFORMANCE](docs/CONFORMANCE.md)   | The `IssueProvider` contract suite        |
| [CONTRIBUTING](docs/CONTRIBUTING.md) | Dev setup, gates, adding a provider       |
| [TESTING](docs/TESTING.md)           | Test taxonomy, inventory, gaps            |
| [CODE_STYLE](docs/CODE_STYLE.md)     | Conventions, error model, secret handling |
| [TODO](docs/TODO.md)                 | Prioritized backlog                       |
| [HANDOFF](docs/HANDOFF.md)           | Current in-flight state                   |
| [MEMORY](docs/MEMORY.md)             | Durable project facts                     |

## License

Dual licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE) at your option.

Copyright (c) Joseph O'Brien.
