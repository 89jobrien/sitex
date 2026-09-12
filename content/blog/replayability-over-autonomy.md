---
title: Replayability Matters More Than Agent Autonomy
date: 2026-09-11
description: "Why Crux is designed around inspectable traces and recovery instead of treating uninterrupted autonomy as the main goal."
taxonomies:
  tags: [agent-runtime, observability, testing, work-tracking]
extra:
  related: [project:crux, post:task-graph-vs-prompt]
---

Agent systems are often presented as a contest in how long they can run
without a person. That is impressive right up until a run fails halfway
through and nobody can tell which steps finished, which output fed the next
step, or whether retrying will repeat a side effect.

I would rather have a system I can recover than one that can wander for
longer.

## The result should include the journey

Crux is an agentic Rust DSL and runtime. A `.crux` YAML pipeline returns a
`Crux<Value>`, while a Rust agent built with `#[crux::agent]` returns a typed
`Crux<T>`. Both use the same outer trace representation.

The value retains the result, recorded step outcomes and outputs, and child
traces. A step stores an input identity hash rather than the raw input. A
failure does not have to collapse into "the agent stopped." It can point to
the step that failed and retain the successful recorded work before it.

That changes debugging. Instead of asking the model to explain what it thinks
it did, I can inspect what the runtime recorded. Crux can load a saved trace,
serve matched completed steps from its replay cache, and execute later or
unmatched steps again. It does not restore an arbitrary program counter or all
external state.

Imagine a release workflow that prepares notes, builds artifacts, uploads
them, and announces the release. If the announcement step fails, rerunning the
whole agent is the wrong recovery strategy. The artifacts may already exist.
The upload may have succeeded even if its response was lost. A fresh model run
may choose different wording or a different sequence entirely.

A Crux trace gives each completed step a place in the causal chain. If upload
success was recorded, replay can reuse that completed output and rerun the
failed announcement. If the response was lost, the upload handler must
reconcile external state or use idempotency before retrying.

The same pipeline can start as readable YAML. Here the `app::*` handlers are
application-defined pseudocode rather than built-in Crux handlers:

```yaml
pipeline: release
steps:
  - step: prepare_notes
    handler: app::prepare_notes
  - step: build_artifacts
    handler: app::build_artifacts
  - step: publish
    handler: app::publish
```

When the workflow needs custom decisions, `#[crux::agent]` moves that logic
into Rust without abandoning the outer trace model. Some YAML constructs,
particularly delegation, currently preserve less structure than equivalent
Rust agents.

## Replay is not blind retry

There is an important limit here. Reconstructing an execution trace is safer
than repeating an external effect.

Reading a file twice is usually harmless. Creating an issue, charging a card,
or deleting a resource is not. A replayable runtime still needs idempotency
keys, effect records, or a deliberate human decision at the point where a
step cannot be repeated safely.

I find it useful to separate three cases. Pure computation can simply run
again. Read operations can usually run again but may observe newer state.
Writes need an identity that lets the handler ask whether the intended effect
already happened. That identity may be an API idempotency key, a persisted
receipt, or a domain-specific lookup before retry.

The handler has to record enough information to support that decision and
still owns the semantics. A generic runtime cannot know whether two issue
titles represent the same issue or whether publishing the same artifact twice
is acceptable.

This is why I use "replayability" carefully. Crux preserves trace steps and
cached outputs; handlers must separately expose and reconcile external
effects. It cannot make every API on the other side of a tool call reversible.

## Autonomy is an outcome, not the foundation

Once a workflow is inspectable and recoverable, it can safely run further on
its own. Without those properties, more autonomy mainly creates a larger
unknown state when something goes wrong.

The questions I care about are therefore ordinary operational questions. Can
I see recorded steps and outputs? Can I replay matched completed work? Have
handlers made non-repeatable effects explicit?

Crux is built around explicit steps, inspectable traces, snapshots, and
output-cache replay. An agent that needs occasional help but leaves a useful
trace is better engineering infrastructure than one that runs unattended and
leaves only a story about what happened.

This shifts where I spend design effort. I care less about squeezing one more
uninterrupted step out of the model and more about naming steps, recording
outputs and errors, and giving handlers explicit effect-reconciliation
policies. Those choices can feel like overhead while a workflow succeeds.
They become the product when it does not.

## Sources

- [Crux value representation](https://github.com/89jobrien/crux/blob/main/crates/crux-types/src/crux_value.rs)
- [Recorded step fields](https://github.com/89jobrien/crux/blob/main/crates/crux-types/src/step.rs)
- [Runtime snapshots and replay setup](https://github.com/89jobrien/crux/blob/main/crates/crux-runtime/src/ctx.rs)
- [Replay-cache semantics](https://github.com/89jobrien/crux/blob/main/crates/crux-runtime/src/replay.rs)
- [Rust agent macro output](https://github.com/89jobrien/crux/blob/main/crates/crux-macros/src/agent.rs)
- [Rust delegation trace behavior](https://github.com/89jobrien/crux/blob/main/crates/crux-runtime/src/delegation.rs)
- [YAML pipeline runner](https://github.com/89jobrien/crux/blob/main/crates/crux-script/src/runner.rs)
