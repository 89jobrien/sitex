---
title: Technical Depth Is Evidence, Not the Story
date: 2026-09-11
description: "How I explain systems work without making architecture detail do the job of a decision, constraint, and outcome."
taxonomies:
  tags: [observability, software-architecture, technical-writing]
extra:
  related: [project:minibox, project:coursers, project:taskit]
---

I can describe a system accurately and still fail to explain why the work
mattered.

Consider the phrase "Rust service with hexagonal architecture, Kubernetes
adapters, structured tracing, and typed errors." It contains useful
information. It also makes the reader assemble the point on their own. A
client wants to know what became
safer or easier. An engineer wants to know which constraint forced the design.
A hiring manager wants to know what judgment I contributed.

The architecture is evidence for those answers. It is not the answer by
itself.

## Start with the changed situation

Internal production tooling changes how I frame technical evidence. Systems
that support active work require operational care, so architecture decisions
must account for rollout safety and recoverability.

From there I can explain a concrete decision. Perhaps an external integration
needed a boundary so it could change without pulling production logic with it.
Perhaps an error path needed more context so an operator could act without
reconstructing the failure from several logs. The exact technical detail now
supports a consequence the reader already understands.

Compare that with leading with a list of crates, traits, and libraries. The
list may prove complexity, but complexity is not automatically value.

Here is the kind of hypothetical sentence I try not to stop at:

> I introduced a port-and-adapter boundary with typed errors and structured
> tracing around the Kubernetes integration.

It says what changed in the code. It does not say why anybody should care. A
stronger hypothetical account leads with the decision and consequence:

> Suppose operators receive failures without enough context to tell whether
> retrying is safe. A stronger account would explain how the Kubernetes
> boundary and tracing help them assess recovery options.

The second version still needs technical evidence. Which error type preserved
the context? Where did the boundary sit? What did the trace contain? But the
reader now knows what those details are meant to prove.

## Keep enough detail to be believed

Leading with the outcome does not mean replacing engineering with marketing.
"Improved reliability" is empty unless I can show the failure mode, the
constraint, and the mechanism that changed it.

This is where technical depth belongs. Name Minibox when the point depends on
its daemon boundary. Name `crs` when the point is that Coursers can stop a
command before execution. Name Taskit's protocol lock when explaining how a
quiet normalized-content change becomes a visible review point.

Specific tools and mechanisms make the argument verifiable. Generic phrases
such as "an internal platform" or "a robust pipeline" often remove the very
detail that makes the work credible.

Naming is particularly important when several tools solve adjacent problems.
"I added an agent workflow" hides whether I mean Godmode's persisted task
graph, Crux's replayable execution model, or Coursers intercepting a proposed
command. Those are different decisions with different outcomes. Using the name
lets me explain the actual boundary instead of compressing everything into AI
vocabulary.

The same rule applies to internal work, with the appropriate context.
Production use tells the reader why rollout safety, operator clarity, and
compatibility are part of the story without requiring confidential
implementation detail.

## Write around a decision

The structure I return to is simple: a situation created a constraint; the
constraint forced a decision; the implementation made that decision real; the
result changed what someone could do next.

Not every story has a dramatic metric, and forcing one in usually makes the
writing worse. A prevented class of mistake, a clearer failure, a migration
contained behind one port, or an operator no longer needing a manual recovery
step can be enough. The result should be concrete, not inflated.

## Diagrams should explain the decision

Architecture diagrams often become inventories: boxes for services, arrows
for calls, labels for databases. They prove that the system has parts. They do
not necessarily explain the choice being discussed.

For a migration story, I would rather draw the old dependency crossing several
modules and the new dependency stopping at one adapter. For a policy story, I
would show the proposed action crossing a gate before the side effect. For a
recovery story, I would show completed Crux steps remaining available after a
later step fails.

Each diagram should answer the same question as the prose. If removing it does
not make the decision harder to understand, it may be decoration.

## Different readers can share one spine

A mixed audience does not require separate stories. The situation,
constraint, decision, and outcome form one spine. A decision-maker can follow
that spine and understand the consequence. An engineer can continue into the
error model, trait boundary, command path, or test that makes the claim
credible.

That is the balance I want in these posts. Name the real tool. Explain the
human or operational problem first. Then include enough implementation detail
that another engineer can challenge the reasoning rather than taking the
outcome on trust.

Technical writing works when different readers can enter at different depths
without losing the same story. The outcome gives the work meaning. The
implementation proves it was not magic. The judgment connecting them is the
part worth writing about.

## Sources

- [Minibox daemon and adapter boundaries](https://github.com/89jobrien/minibox/blob/main/crates/minibox/src/daemon/handler/mod.rs)
- [Coursers pre-tool-use path](https://github.com/89jobrien/coursers/blob/main/crates/coursers/src/crs_commands.rs)
- [Taskit normalized contract hashing](https://github.com/89jobrien/taskit/blob/main/crates/taskit-engine/src/protocol/contract_hash.rs)
- [Taskit drift comparison and failure behavior](https://github.com/89jobrien/taskit/blob/main/crates/taskit-engine/src/protocol/drift.rs)
- [Crux replay-cache semantics](https://github.com/89jobrien/crux/blob/main/crates/crux-runtime/src/replay.rs)
- [Crux failed-run trace retention test](https://github.com/89jobrien/crux/blob/main/crates/crux/tests/agent_macro.rs)
