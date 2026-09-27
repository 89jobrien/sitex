---
title: "Coursers: a runtime control plane for coding agents"
date: 2026-08-23
description: "How Coursers turns agent hook events into deterministic policy, command rewrites, output filtering, failure learning, and replayable evidence."
---

A prompt can ask an agent not to run a dangerous command. Coursers can stop
the command before it executes.

That difference is the reason the project exists.

Coursers is a compiled hook pipeline for coding agents. It sits between an
agent's tool request and the machine, where it can deny a command, rewrite it,
observe the result, reduce noisy output, and learn from repeated failures.
The model proposes an action. Coursers applies deterministic policy around it.

```text
agent intent
    │
    ▼
pre-hook ──► deny | rewrite | allow
    │
    ▼
tool execution
    │
    ▼
post-hook ─► filter | learn | log
```

This is not another instruction layer in the prompt. It is a runtime control
plane for the side effects an agent can produce.

## Policy before execution

The pre-hook receives the real tool payload over stdin and extracts the Bash
command. Static rules can match it with regular expressions, exempt known-safe
forms, and return a protocol-native denial with a useful alternative.

A minimal rule looks like this:

```json
{
  "id": "no-grep-use-tool",
  "pattern": "\\bgrep\\b|\\brg\\b",
  "exceptions": ["\\| grep", "\\| rg"],
  "message": "Use the Grep tool instead of shell grep/rg."
}
```

The important part is not the specific command. The rule converts a local
engineering convention into an executable constraint. The agent does not need
to remember which tools are preferred, which operations are forbidden, or
which exceptions are legitimate on every turn.

Coursers also handles compound commands rather than treating a shell pipeline
as an opaque string. It can evaluate individual stages while retaining
whole-command matching for rules that care about shell structure.

Not every correction needs to be a denial. Rewrite rules can replace a valid
but inefficient command before execution. They are applied in file order, so
composition is explicit and testable rather than left to another model turn.

```toml
[[rewrites]]
pattern = "^cargo build$"
replace = "cargo build --message-format json"
```

The distinction matters:

- **Deny** when the action must not happen.
- **Rewrite** when the intent is valid but the command should change.
- **Allow** when policy has nothing to add.

That gives the hook a small decision surface with observable outcomes.

## Context control after execution

Agent reliability is also affected by what comes back from a tool. A successful
build can emit hundreds of lines that add little value to the next model turn.
A failed command can hide its useful diagnostic inside the same volume.

Coursers applies post-hook filters with five modes:

- pass output through unchanged;
- suppress successful output;
- retain only error lines;
- truncate to a configured limit;
- retain lines matching a regular expression when the command succeeds, while
  passing failures through intact.

This is context engineering at the process boundary. The command still runs
normally, but the agent receives the part of the result that can change its
next decision.

Post-hooks also feed failure learning. Coursers records genuine non-zero exits
in a rolling window, excluding signal exits and recognizable intentional
failures. When the same command crosses a configured threshold, the next
pre-hook blocks another identical attempt.

Static rules encode known policy. Failure learning catches local loops that no
one wrote a rule for.

```text
attempt 1 ─► fail ─► record
attempt 2 ─► fail ─► record
attempt 3 ─► fail ─► threshold reached
attempt 4 ─► blocked before execution
```

That state lives outside the model. A fresh context window does not erase the
fact that the command already failed three times.

## One pipeline, more than one agent

Coursers started around Claude Code's `PreToolUse` and `PostToolUse` events,
but the policy engine is not tied to one hook protocol.

The generic pipeline covers eleven lifecycle events and supports actions for
denial, rewriting, external side effects, notifications, and output redaction.
Configuration loads global rules first, followed by sorted plugin files and
project-local rules. The later files extend the pipeline; they do not override
an earlier matching denial.

The adapters handle the protocol edges:

- **Claude Code** sends native hook JSON to the default `crs hook` target.
- **OpenCode** uses a TypeScript plugin that normalizes its events into a
  harness-neutral JSON contract consumed by the Rust adapter.
- **Codex** uses target-specific dispatch and validation, then delegates to its
  configured Crux hook backends.

The policy does not need to be rewritten because an agent framework names an
event differently. Protocol translation belongs at the boundary; matching,
state transitions, filtering, and logging remain in the core.

## Two command names, one implementation

The project installs both `coursers` and `crs`, but there is no separate `crs`
crate. The `coursers` package owns both binaries. For normal subcommands, both
parse the same CLI model and dispatch through the same library runner;
`coursers` alone intercepts shell-completion generation at its entrypoint.

```rust
use clap::Parser;
use coursers::{Cli, run};

fn main() {
    let cli = Cli::parse();
    run(cli);
}
```

The two names make hook configuration readable without splitting behavior
across duplicate implementations. `coursers` describes the system. `crs` is
the short front-controller command used in hook wiring.

Underneath that CLI is a five-crate Rust workspace:

- `coursers-types` owns domain records and port contracts;
- `coursers-core` owns policy, state, filtering, rewriting, analysis, replay,
  and shared hook behavior;
- `coursers` owns CLI dispatch and protocol adapters;
- `coursers-e2e` verifies complete hook scenarios;
- `xtask` owns workspace quality gates.

The boundary is deliberate. Command-history sources, rule loading, and state
persistence have explicit port traits. Those dependencies can be tested with
injected adapters instead of pretending the filesystem is the domain.

That also keeps the public protocol thin. Hook stdout must remain valid for the
calling agent. Diagnostics that need to be surfaced belong on stderr rather
than corrupting the hook response.

## Guardrails need evidence

A hook that appears in a settings file is not automatically working. Coursers
ships tools for inspecting the actual path:

- `validate` checks rule patterns, triggers, exceptions, and required tools;
- `validate-hooks` checks installed wiring and target-specific requirements;
- `probe` explains which rule would decide a command;
- `log` queries recorded hook executions and outcomes;
- `replay` evaluates commands from a prior session against the current rules;
- `discover`, `history`, and `heat` expose missed commands and rule activity.

Replay is especially important. It extracts Bash commands from a prior session
and evaluates the current static block rules without mutating failure-learning
state. It does not replay rewrites, filters, learned failures, or generic
pipeline actions. Within that boundary, historical sessions become a useful
regression corpus.

The project treats installation as part of verification too. Building the
workspace does not replace the binary on `PATH`; live hook checks only mean
something after the intended binary has been installed and the configured
entrypoint has been exercised end to end.

## Hooks are infrastructure

The useful mental model for agent hooks is not "a few scripts around the
prompt." They are infrastructure between probabilistic intent and real side
effects.

That infrastructure needs the same properties as any other control plane:

- deterministic decisions;
- explicit ordering;
- protocol-safe interfaces;
- durable state;
- layered configuration;
- observable outcomes;
- replayable evidence;
- tests at the real process boundary.

Coursers puts those properties in one system. Prompts still guide the agent,
but guidance is not asked to carry the full burden of safety, efficiency, and
operational memory.

The model can forget. The control plane should not.

## Sources

- [Coursers repository](https://github.com/89jobrien/coursers)
- [Workspace architecture](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/Cargo.toml)
- [Shared CLI and dispatch](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/coursers/src/lib.rs)
- [`coursers` entrypoint](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/coursers/src/main.rs)
- [`crs` entrypoint](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/coursers/src/bin/crs.rs)
- [Rule-loading ports](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/loader.rs)
- [State-store ports](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/store.rs)
- [Command-history ports](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/analyze/history.rs)
- [Rule model and matching](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/rules.rs)
- [Rewrite engine](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/hook/rewrite.rs)
- [Output filtering](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/hook/filter_logic.rs)
- [Failure-learning state](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/state.rs)
- [Generic hook pipeline](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/hook/pipeline.rs)
- [Execution log](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/hook/log.rs)
- [Replay engine](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/replay.rs)
- [OpenCode adapter](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/docs/opencode.md)
- [Codex adapter](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/docs/codex-profile.md)
