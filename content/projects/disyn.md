---
title: "disyn"
date: 2026-08-18
description: "Hybrid symbolic+neural agent pipeline in Rust: raw observations pass through a typed 7-stage flow (FactExtractor, ProposalEngine, Verifier, a bounded RepairEngine loop, ActionExecutor) so neural proposals are checked before anything executes; build orchestration delegates via xtask to taskit."
taxonomies:
  tags: [agent-runtime, llm, security]
extra:
  repo: "https://github.com/89jobrien/disyn"
  related: [project:taskit]
---

[![crates.io](https://img.shields.io/crates/v/disyn-core.svg)](https://crates.io/crates/disyn-core)
[![license](https://img.shields.io/crates/l/disyn-core.svg)](LICENSE-MIT)

Hybrid symbolic+neural agent pipeline in Rust. Transforms raw
observations into checked, executed actions through a typed 7-stage
pipeline where a symbolic rule set gates neural proposals before execution.

Read [Known limitations](#known-limitations) before relying on the
verification claims -- the enforcement story is thinner than the architecture
diagram suggests.

## Pipeline

```text
Observation -> FactExtractor -> MemoryStore::retrieve -> ProposalEngine
  -> Verifier -> [RepairEngine loop, max 3] -> ApprovedPlan
  -> ActionExecutor -> ExecutionReport -> MemoryStore::persist
```

If verification fails after 3 repair attempts and budget allows, the
orchestrator replans (re-proposes from scratch) once before erroring.

## Crates

| Crate                                                                                  | Description                                                                              |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`disyn-core`](https://github.com/89jobrien/disyn/tree/main/crates/disyn-core)         | Domain types, port traits, error types                                                   |
| [`disyn-symbolic`](https://github.com/89jobrien/disyn/tree/main/crates/disyn-symbolic) | Rule engine, verifier, repair engine, 10-layer verification taxonomy (1 layer populated) |
| [`disyn-neural`](https://github.com/89jobrien/disyn/tree/main/crates/disyn-neural)     | LLM adapters (OpenAI, Ollama)                                                            |
| [`disyn-memory`](https://github.com/89jobrien/disyn/tree/main/crates/disyn-memory)     | State persistence, in-memory store, CatRAG graph types                                   |
| [`disyn-runtime`](https://github.com/89jobrien/disyn/tree/main/crates/disyn-runtime)   | Budget manager (per-class tracking), telemetry, shell executor                           |
| [`disyn-app`](https://github.com/89jobrien/disyn/tree/main/crates/disyn-app)           | Composition root, orchestrator, CLI                                                      |
| `disyn-xtask`                                                                          | CI automation (`cargo xtask ci`)                                                         |

### Dependency graph

```text
disyn-core
  disyn-symbolic
  disyn-neural
  disyn-memory
  disyn-runtime
    disyn-app (depends on all above)
```

## Architecture

Hexagonal design — all cross-crate boundaries use trait ports defined
in `disyn-core::ports`: `FactExtractor`, `ProposalEngine`, `Verifier`,
`RepairEngine`, `MemoryStore`, `ActionExecutor`, `TelemetrySink`. The
`Orchestrator` in `disyn-app` holds `Box<dyn Port>` for each.

## Build

```sh
cargo xtask ci          # fmt + clippy + test + build
cargo build --workspace
cargo test --workspace
```

## Configuration

| Env var            | Default  | Description                         |
| ------------------ | -------- | ----------------------------------- |
| `DISYN_PROVIDER`   | `openai` | LLM provider (`openai` or `ollama`) |
| `OPENAI_API_KEY`   | (empty)  | OpenAI API key                      |
| `DISYN_MODEL`      | `gpt-4o` | Model name                          |
| `DISYN_MAX_TOKENS` | `10000`  | Token budget                        |

## Known limitations

Verified against `main` @ `18ad502`. These are behavioral facts, not plans.

- **`ApprovedPlan` is not a boundary.** Both fields are `pub`, there is no private
  constructor, and no `From`/`TryFrom` impl exists. `rg 'ApprovedPlan \{'` finds
  exactly two sites: the type definition and `orchestrator.rs:108`. Any dependent
  crate can construct one; only `orchestrator.rs` chooses not to.
- **One layer of ten is populated.** `VerificationLayer` defines `L0Format`
  through `L9Location`, and `RuleSetVerifier` maps layers to rules -- but the only
  registered rule is `NonEmptyActionRule` on `L0Format`
  (`disyn-symbolic/src/verifier.rs:10-35`). The entire rule surface is
  `step.action.is_empty()`.
- **The one rule cannot fire.** `disyn-neural/src/shared.rs:29` parses steps as
  `action: s["action"].as_str().unwrap_or("unknown").to_string()`, so a step with a
  missing `action` field becomes the non-empty string `"unknown"`.
- **Repair deletes rather than repairs.** `PatternRepairEngine` removes steps with
  blocking violations (`disyn-symbolic/src/repair.rs:20-26`; its module doc comment
  says so). Since the only rule fires on _empty_ actions, deletion guarantees
  convergence, so a fully malformed model response becomes a successful
  zero-step plan. `empty_plan_passes` (`verifier.rs:97-106`) demonstrates this.
- **`verify_loop` has no tests.** `disyn-app` contains zero test modules; the
  pipeline's gate is uncovered.
- **Execution is a raw shell string.** `disyn-runtime/src/executor.rs:38-44` passes
  the action to `sh -c` with no typed action type in between.
- **`GraphStore` and `FormalVerifier` have zero implementations**, and
  `scan_deception` is a default trait method returning "not detected".
- **`Budget::can_afford` is never called** by the orchestrator; the cost-control
  hook is unwired. `can_replan` and `can_repair` are used.

## License

MIT OR Apache-2.0
