---
title: "rslm"
date: 2026-08-18
description: "Recursive Language Model inference engine in Rust: instead of sending context directly to an LLM, the model writes Rhai scripts that an in-process interpreter executes under a bounded operation count, with pluggable OpenAI/Anthropic providers across a multi-crate workspace (core, providers, cli, harness, store, bench)."
taxonomies:
  tags: [agent-runtime, llm, security]
extra:
  repo: "https://github.com/89jobrien/rslm"
  related: [project:sandbox]
---

Verified against `main` @ `bc4e7cb`.

The model is given a small set of functions over a context it never sees
directly -- `ctx_len`, `ctx_slice`, `ctx_grep`, `rlm_call`, `print_cell`,
`final_answer` -- and is instructed to emit a Rhai script rather than prose.
The raw context lives in the interpreter's state; only what the script
explicitly extracts ever enters a provider message.

## Isolation model

`rslm` sandboxes generated scripts with **[rhai](https://github.com/rhais/rhai)**,
not with the separate `sandbox` project on this site. Rhai runs in-process with
no subprocess and no OS-level isolation, bounded by
`engine.set_max_operations(1_000_000)` (`crates/rslm-core/src/env.rs:26`).

> rslm and `sandbox` share a design principle and have **zero code coupling**:
> separate lockfiles, no path dependency, and no cross-references in either
> direction.

## Bounds

| Bound               | Where                                | Default |
| ------------------- | ------------------------------------ | ------- |
| Recursion depth     | `rlm.rs:93` `MaxDepthExceeded`       | 5       |
| Loop iterations     | `rlm.rs:208` `MaxIterationsExceeded` | 20      |
| Rhai ops per script | `env.rs:26` `set_max_operations`     | 1M      |
| Consecutive errors  | `rlm.rs:205` `MAX_ERROR_STREAK`      | 3       |

An invalid script feeds its error back to the model for self-correction; after
three consecutive failures the loop stops with a typed `ScriptError`
(`rlm.rs:223-250`).

## Known limitations

- **The prompt's rules are not all enforced.** The system prompt lists six
  "strictly enforced" rules (`rlm.rs:14-38`); only `final_answer` and script
  parsing are backed by code. "You MUST call `ctx_grep` or `ctx_slice` first"
  is prompt text only -- a model calling `final_answer("42")` with no
  `ctx_grep` is accepted, and that is exactly what the tests do.
- **No wall-clock, token, or cost bound.** `max_operations` bounds steps, not
  time, and `provider.complete` is awaited without a timeout.
- **No real transcripts are committed.** Every case in
  `crates/rslm-bench/golden/queries.json` supplies scripted
  `harness_responses`, so the Criterion benchmarks measure the deterministic
  harness rather than model output. Live eval writes to `/tmp`, outside the repo.
- **`StepResult` is dead code**, declared and re-exported but never
  constructed or matched. **`Notebook` is write-only** -- accumulated across
  the loop but never returned, so the audit trail is not retrievable from the API.
- **Recursion is not covered end to end.** The multi-level test is
  `#[ignore]`d because `rlm_call` uses `block_on`, which cannot nest inside a
  Tokio test runtime; its replacement asserts on hand-constructed structs.
- **Child errors become strings.** A failed sub-reasoning is stringified into
  the parent's return value (`rlm.rs:161`), so it can be mistaken for data.
- **One model for the whole recursion tree.** Tiered root/child models are
  explicitly deferred.
- **Anthropic hardcodes `max_tokens: 4096`**; OpenAI sets none. A truncated
  script becomes an unparseable script.

## License

MIT OR Apache-2.0
