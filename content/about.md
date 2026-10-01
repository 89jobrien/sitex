---
title: About
date: 2026-09-16
description: "Joseph O'Brien is an Agentic Systems Architect building reliable AI systems, Rust platforms, and developer tools."
template: page.html
---

I am a Rust systems architect building self-governing developer environments and
evidence-driven agent platforms. I work on the software around AI systems: the
runtimes, workflows, integrations, infrastructure, and safety controls that turn
model capability into something people can operate and trust.

My operating principle is simple: **repeated manual intervention is a signal of
an architectural gap.** If a failure, handoff, cleanup, validation step, or
recovery procedure happens twice, it should become a first-class system concern
with an owner, an observable trigger, a bounded lifecycle, and evidence. Not an
easier script — a redesigned topology, where the process is constrained, derived
from authoritative state, or simply unnecessary.

## What I build

My open source work is not a set of unrelated tools. It converges on four
layers, connected by narrow contracts rather than shared internals.

- **Policy and governance.** [crux](@/projects/crux.md) is the decision
  kernel: it validates intent, issues bounded capability grants, and owns the
  promotion decision. [coursers](@/projects/coursers.md) is the enforcement
  point at the command boundary, where observed failure becomes scoped and
  reviewable policy. [cargo-promote](@/projects/cargo-promote.md) owns release
  transitions.
- **Capability and execution.** [minibox](@/projects/minibox.md) is the
  execution chassis. It materialises constrained work in isolated environments
  — namespaces, cgroups, overlay filesystems, network attachment — and returns
  factual reports about what happened. It does not decide whether the work was
  allowed.
- **Evidence and feedback.** [taskit](@/projects/taskit.md) compiles a
  repository change into the validation it actually requires, so "what should I
  run now?" stops being a memory test. [tracers](@/projects/tracers.md)
  preserves provenance. [updog](@/projects/updog.md) analyses repeat failures
  and proposes scoped rules. [godmode](@/projects/godmode.md) and
  [devkit](@/projects/devkit.md) drive the agent workflow those decisions run
  inside.
- **Knowledge and context.** [episteme](@/projects/episteme.md),
  [kgx](@/projects/kgx.md), [hj](@/projects/hj.md), and
  [doob](@/projects/doob.md) make previously validated context retrievable
  without letting untrusted input quietly become policy.

The rule that holds the layering together: **authority flows downward as
constrained grants; facts flow upward as evidence.** An execution system may
report what happened, but it never gets to decide whether that outcome is
sufficient for a merge, a release, a rule activation, or a durable state change.

## How I work

I work through a short set of questions rather than accumulating process:

| Question                    | Default answer                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| What owns this state?       | Name a lifecycle owner: task, campaign, runtime session, machine profile, telemetry window, build, promotion decision. |
| Can this action happen?     | Only after intent is validated, capability is granted, and constraints are known.                                      |
| What does success mean?     | A typed, evidenced outcome — not a zero exit code, and not an agent claiming completion.                               |
| What survives the run?      | Only deliberately promoted artifacts, immutable evidence, or explicit configuration state.                             |
| What happens after failure? | Capture evidence, classify the failure, and create a governed prevention path.                                         |

A few habits behind those answers. I prefer deliberate architecture before
implementation, treating a change as a campaign with a defined authority
boundary and acceptance conditions rather than a sequence of local improvements.
I use multiple AI agents as a review council — they widen coverage and surface
risks, but I keep architectural authority and make the final call. And I treat
observability, traces, and evidence as products rather than debugging
leftovers.

Outside of that: ports and adapters to keep external services replaceable,
Rust for systems work with Python, Go, and Nushell where they fit better,
strong tests including property tests and fuzzing, and explicit errors. I value
disagreement that arrives with a mechanism, a tradeoff, or a testable
alternative, and I keep communication direct and uncertainty visible.

## Current focus

Closing the loop where it is still open: when something fails repeatedly, the
system should get harder to fail that way again. A failure becomes evidence,
evidence becomes a scoped and expiring rule, and the rule is enforced at the
next relevant boundary — with a rollback path and a test corpus, so it is policy
rather than folklore.

The standard I hold it to is whether the system stays understandable, governable
and recoverable after I am no longer the one running it.
