---
title: Hexagonal Architecture Is a Change-Budget Tool
date: 2026-09-11
description: "Why I judge ports and adapters by the amount of future change they contain, not by how clean the diagram looks."
---

I did not start caring about hexagonal architecture because I wanted better
diagrams. I cared when a runtime, storage engine, provider, or platform had to
change and the replacement touched code that should never have known the old
choice existed.

Ports and adapters are useful when they put a budget around that change.

## Draw the boundary around a reason to change

Minibox runs containers through different platform adapters. Native Linux and
a VM-backed macOS path do not share an implementation, but callers should not
need to understand both. The canonical domain traits in `minibox-domain`
describe the capabilities the daemon needs; `minibox-core` re-exports them
through a compatibility facade, while adapters own platform-specific work.

Doob's generic sync subsystem uses capability traits such as `Provider`,
`HealthCheck`, and `IssueCreator`. The Beads adapter implements those traits,
while the current GitHub sync path remains separately wired. That split is a
useful reminder that adopting ports is a migration, not a label that makes all
existing integrations generic.

The port earns its keep when one of those external choices changes. If the
replacement stays mostly inside the adapter and its conformance tests, the
boundary contained the migration. If business logic, CLI code, and storage
code all change too, the abstraction probably leaked.

## Production makes the budget visible

Production tooling makes architectural boundaries concrete. A migration is
not an exercise performed on an empty diagram; it affects operators and live
workflows. The value of a stable port is the work that does not have to move
while an external integration changes.

This is also why I avoid inventing ports for every function. Each abstraction
adds vocabulary, indirection, and tests. A boundary without a plausible
replacement or a clear isolation need spends complexity now without creating
useful options later.

The question is not "could this have an interface?" Almost anything could.
The question is "what change are we buying room for?"

That question usually produces a smaller port. A container runtime does not
need to expose every operating-system detail to the domain. An issue tracker
does not need to leak the full GitHub response into todo logic. The port should
describe what the application needs, in the application's language.

A simplified provider port, illustrative rather than Doob's current API, might
look like this:

```rust
trait IssueTracker {
    fn create(&self, title: &str, body: &str) -> Result<IssueRef>;
    fn close(&self, issue: &IssueRef) -> Result<()>;
}
```

The point is not the trait syntax. It is that the caller receives an
`IssueRef`, not a GitHub-specific JSON object. If provider fields flow through
the port and into every caller, changing providers will still consume the
whole codebase even though an interface sits in the middle.

## Test the boundary from the outside

An adapter is only swappable if another implementation can satisfy the same
behavior. Minibox has an adapter-contract conformance harness and
adapter-specific suites, although much of its generic runtime contract suite
currently exercises mocks. A provider port needs tests around the behavior the
application depends on, not tests that merely mirror one provider's API.

Those tests are part of the change budget. They let a new adapter prove itself
without forcing the rest of the application to become the test harness.

## A leaky port can cost more than no port

The failure mode I watch for is an abstraction that hides construction but not
behavior. The application depends on a generic `Storage` trait, yet branches on
which database implements it. Or it accepts a generic runtime, then passes
platform flags through every method. The adapter exists, but the choice it was
meant to isolate is still public knowledge.

That design pays both costs. It has the indirection of ports and adapters and
the migration surface of direct integration.

When I see repeated downcasts, provider-name checks, or "optional" fields used
by only one adapter, I treat them as evidence that the port is drawn around the
wrong capability. Sometimes the honest fix is to expand the domain concept.
Sometimes two unlike providers should not share an interface. The goal is not
to preserve the hexagon; it is to contain the expected change.

This is especially important in production work, where migration guidance
must emphasize staged, rollback-safe validation and preserve monitoring across
transitional paths. The architectural value appears when that temporary
complexity has a clear place to live and a clear way to leave.

Hexagonal architecture is sometimes described as keeping the domain pure.
That is true, but purity is not the outcome I optimize for. I want a future
change to have an obvious home, a limited blast radius, and a testable
contract. The diagram is just a map of where I expect the bill to land.

I can evaluate that map with a practical exercise: choose the external thing
most likely to change and sketch the replacement. Which modules move? Which
tests prove the new adapter? Which domain types remain untouched? If the answer
is "most of the application," the boundary has not bought much.

If the answer is one adapter, its wiring, and a focused conformance suite, the
architecture has done useful financial work. It spent complexity early to
keep a later change within budget.

## Sources

- [Minibox domain traits](https://github.com/89jobrien/minibox/blob/main/crates/minibox-domain/src/lib.rs)
- [Minibox compatibility re-export](https://github.com/89jobrien/minibox/blob/main/crates/minibox-core/src/domain/mod.rs)
- [Minibox adapter registry](https://github.com/89jobrien/minibox/blob/main/crates/miniboxd/src/adapter_registry.rs)
- [Minibox conformance harness](https://github.com/89jobrien/minibox/blob/main/crates/minibox-testsuite/src/lib.rs)
- [Minibox mock runtime conformance scope](https://github.com/89jobrien/minibox/blob/main/crates/minibox-testsuite/src/adapters/runtime.rs)
- [Doob provider capability traits](https://github.com/89jobrien/doob/blob/main/crates/doob-sync/src/traits.rs)
- [Doob Beads adapter](https://github.com/89jobrien/doob/blob/main/crates/doob-beads/src/lib.rs)
- [Doob GitHub sync path](https://github.com/89jobrien/doob/blob/main/crates/doob-gh/src/lib.rs)
