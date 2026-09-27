---
title: Explain the Decision, Then Show the System
date: 2026-09-11
description: "A reader-first framework for explaining systems work through situation, constraint, decision, outcome, and technical evidence."
---

Systems work is easiest to understand in four parts:

1. **Situation:** What was happening, and who was affected?
2. **Constraint:** What made the obvious solution unsafe, incomplete, or impossible?
3. **Decision:** What trade-off did the design choose?
4. **Outcome:** What became possible, safer, or easier to inspect?

Implementation details come next. They are evidence that the decision is real.

This order matters. “A Rust service with hexagonal architecture, typed errors,
and structured tracing” may be accurate, but it asks the reader to infer the
problem and the judgment. A module name cannot explain why a boundary mattered.
A code sample cannot establish which failure was worth preventing.

The framework gives every detail a job. The situation creates relevance. The
constraint creates tension. The decision reveals judgment. The outcome explains
value. Code, tests, and architecture then let a technical reader challenge the
account instead of merely trusting it.

## A primary example: put policy before effects

[Minibox](https://github.com/89jobrien/minibox) is an agent-controllable container
runtime written in Rust. A client can ask its daemon to pull images and create,
inspect, or stop containers. That definition has to come before names such as
`handle_run`, `ContainerPolicy`, or `DaemonResponse`; without it, those names are
just repository vocabulary.

### Situation

An automated client can request a container with bind mounts, elevated
privileges, and a chosen execution priority. Those options are useful, but they
also cross a security boundary. By the time the runtime creates the container,
the request has already caused filesystem and process side effects.

### Constraint

Validation cannot be an advisory message after creation. It must happen before
the side effect, and rejection must travel back through the same protocol as a
successful response. Otherwise a caller could receive an error while the system
had already changed underneath it.

That constraint rules out designs that validate only in the command-line client.
Other clients use the daemon too, so the enforcement point must sit on the shared
request path.

### Decision

Minibox performs admission checks in the daemon handler before it calls the
container-creation path. A rejected request returns immediately. Only an
accepted request reaches `run_inner`, where creation begins.

Now the implementation detail has a purpose. This shortened excerpt from the
[public request handler](https://github.com/89jobrien/minibox/blob/main/crates/minibox/src/daemon/handler/run.rs)
shows the order:

```rust
if let Err(msg) = super::validate_policy(
    &params.mounts,
    params.privileged,
    params.priority,
    &effective_policy,
) {
    let _ = tx.send(DaemonResponse::Error { message: msg }).await;
    return;
}

let response = match run_inner(params, state, deps).await {
    Ok(id) => DaemonResponse::ContainerCreated { id },
    Err(error) => DaemonResponse::Error {
        message: format!("{error:#}"),
    },
};
```

The `return` is more important to the explanation than the type names. It is the
point at which the decision becomes enforceable: policy failure stops control
flow before container creation.

The dependency structure supports the same decision. Image retrieval,
lifecycle operations, command execution, builds, and events are supplied as
separate capabilities alongside policy. The
[shortened handler boundary](https://github.com/89jobrien/minibox/blob/main/crates/minibox/src/daemon/handler/mod.rs)
makes those responsibilities explicit:

```rust
pub struct HandlerDependencies {
    pub image: ImageDeps,
    pub lifecycle: LifecycleDeps,
    pub exec: ExecDeps,
    pub build: BuildDeps,
    pub events: EventDeps,
    pub policy: ContainerPolicy,
    // Execution-policy and checkpoint dependencies omitted.
}
```

On its own, this struct would only prove that several fields exist. After the
situation and constraint, it becomes useful evidence: policy belongs at the
shared daemon boundary rather than in one client or one platform adapter.

### Outcome

A disallowed request can be rejected before the creation function runs, while
an allowed request continues through the normal response path. Every client that
uses the daemon receives the same enforcement behavior.

That is a precise outcome, but not an inflated one. The source proves control-flow
ordering and a common enforcement point. It does not prove how many incidents
were prevented, how often callers request privileged containers, or that every
possible container escape is blocked. Those claims would require operational or
security evidence beyond this code.

## Two brief supporting examples

The same structure works outside a container runtime. The examples can stay
short when they support the framework rather than competing with the primary
story.

### Stop a bad command at the proposal boundary

[Coursers](https://github.com/89jobrien/coursers) is a hook pipeline that examines
commands proposed by coding agents before and after tool execution.

- **Situation:** An agent can repeatedly propose a shell command that violates a
  known repository rule.
- **Constraint:** A warning after execution is too late for commands with side
  effects.
- **Decision:** Extract the proposed Bash command in a pre-tool hook and run it
  through deny and rewrite rules before the shell receives it.
- **Outcome:** A matching command can be rejected with a readable reason before
  execution.

The [pre-tool hook](https://github.com/89jobrien/coursers/blob/main/crates/coursers/src/hook/pre.rs)
is evidence for the interception point. Regexes, payload types, and hook names
matter only after the reader knows why “before execution” is the decision.

### Turn contract changes into review events

[Taskit](https://github.com/89jobrien/taskit) is a CI pipeline runner for Rust
workspaces. One of its checks tracks selected contract surfaces in a lockfile.

- **Situation:** A shared protocol type can change inside an otherwise routine
  code review.
- **Constraint:** Compilation in one repository may not reveal that downstream
  consumers depend on the previous shape.
- **Decision:** Normalize and hash declared contract files, then fail the default
  drift check when the current hash differs from the reviewed lock.
- **Outcome:** An unacknowledged structural change to a tracked surface becomes
  a visible CI failure instead of passing as an ordinary source edit.

The [contract hashing code](https://github.com/89jobrien/taskit/blob/main/crates/taskit-engine/src/protocol/contract_hash.rs)
and [drift gate](https://github.com/89jobrien/taskit/blob/main/crates/taskit-engine/src/protocol/drift.rs)
make that mechanism inspectable. Normalization intentionally ignores comments,
blank lines, and test modules. The gate catches tracked structural changes; it
does not prove that every downstream migration will be correct.

## A practical writing sequence

When explaining a system, I now draft in this order:

1. Name the user, operator, or other system facing the situation.
2. State the failure mode or trade-off in ordinary language.
3. Identify the constraint that eliminates simpler alternatives.
4. Describe the decision without repository-specific nouns.
5. State the narrowest outcome the available evidence supports.
6. Introduce the project and define its role.
7. Add code, tests, or diagrams that prove the mechanism.
8. Say what the evidence does not prove.

This sequence is not a demand to remove technical detail. It is a way to delay
detail until the reader has a question for it to answer.

A useful test is to hide every code block. The remaining prose should still
explain the situation, constraint, decision, and outcome. Then hide the prose.
The implementation should still support the claimed mechanism. If either half
collapses, the account is incomplete.

Diagrams should follow the same rule. Show the proposed action crossing the
policy gate before the side effect, not merely boxes labeled “client,” “daemon,”
and “runtime.” Show the contract edit diverging from its reviewed hash, not just
a generic arrow labeled “CI.” A diagram should reveal the decision's order or
boundary, not inventory the repository.

Different readers can stop at different depths while sharing one story. A
non-specialist can understand why enforcement must precede container creation.
An engineer can continue into handler control flow and dependency boundaries.
Neither reader has to reverse-engineer the point from architecture vocabulary.

The story is the judgment: given this situation and this constraint, choose this
boundary and accept this trade-off. The outcome explains why the judgment
matters. Implementation details are the evidence that it was carried through.
