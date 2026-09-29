---
title: Make the Compiler Refuse the Pipeline It Cannot Replay
date: 2026-09-28
description: >-
  A value that steers control flow has three obligations — be present, be
  attributable, and be restorable from the trace — and when the trace format
  cannot meet the third, the fix is a compile error, not a wider schema.
taxonomies:
  tags: [software-architecture, agent-runtime, testing]
extra:
  related:
    [
      post:provenance-is-the-point,
      post:your-policy-engine-cannot-tell-you-which-rules-are-dead,
    ]
---

The bug was one line. In a pipeline runtime, a handler may return a value plus
an optional confidence score, and a routing combinator branches on that score to
decide what happens next. Somewhere in the middle sat a `unwrap_or`, and the
default it chose was maximum confidence.

For months, every handler that had no opinion looked certain.

I found it the way you find most of these: reading a comment someone — me — had
written when fixing it. The comment is better than the bug, so here it is in
full. Source: `crates/crux-script/src/handler_output.rs`.

```rust
/// Carries the handler's output value and an optional confidence score.
///
/// Handlers that do not have a meaningful confidence score return `None`. Previously
/// [`HandlerOutput::confidence_or_default`] silently treated that as `1.0`, which made
/// unscored handlers look maximally confident to any consumer relying on the default
/// (e.g. `route_on_confidence`). To avoid that false signal, `None` now defaults to
/// `0.5` (a neutral midpoint) instead of `1.0`. This is a behavior change but is less
/// invasive than making every `None`-confidence caller handle a hard error, since the
/// only in-crate callers of this method were tests (see #75, #76).
```

Three sentences of that are the whole post. The first sentence is the bug. The
last one is the part that should worry you: the blast radius was small **only
because nothing was calling it**, and the thing that finally surfaced it was a
caller appearing later.

## The type system approved it

It is worth being precise about why this compiled cleanly, reviewed cleanly, and
passed tests. Nothing was broken.

`Default` in Rust is contractually an arbitrary _valid_ value, not a _correct_
one. In the API guidelines, `Default` is listed among the traits a new type
should eagerly implement, with a note that implementing both `Default` and an
empty `new` is common and expected. There is no rule anywhere in the official
guidance about whether the default value is semantically honest, and the
guidelines' own tracker has an open issue from 2022 asking what to do when there
is no variant that could reasonably be called "the" default.

Clippy is no help either. `or_fun_call` exists, and it fires on
`unwrap_or(expensive())` — but as a **performance** lint, about allocation, not
about semantics. `unnecessary_lazy_evaluations` is its dual. `derivable_impls`
is purely syntactic. There is no lint that catches a semantically wrong default
and I do not think one can exist, because it would need to know what you meant.

So: a type-correct value that means the wrong thing, in the one position where
meaning matters, and no tool in the ecosystem can tell you. That is the shape of
the problem. The rest of this post is the three layers we added on top, and why
the first one is not enough.

## Layer one: a neutral default

Change `1.0` to `0.5`. That is the obvious move, and the comment above already
concedes it is insufficient — it does not remove the guess, it relocates it.

It is also worth naming precisely what it _is_, because it is a familiar shape
from a different context. This is a backward-compatibility default. Confluent's
schema evolution documentation states the rule: a new field is backward
compatible only because it has a default, and the default has to be the value
the old data _would have had_. Their words:

> Had the default value been omitted in the new field, the new schema would not
> be backward compatible with the old one since it's not clear what value should
> be assigned to the new field, which is missing in the old data.

Our old data had no confidence value at all. Any default we invent is a value
the old runs did not have. `0.5` is a better guess than `1.0`, and it is still a
guess standing in for information that was never recorded.

## Layer two: a capability, declared by the producer

The next move is to stop letting the value be optional in the first place — not
at the consumer, but where it is produced. Source:
`crates/crux-script/src/metadata.rs`.

```rust
/// Whether a handler reports a confidence score with its output.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfidenceCapability {
    /// The handler never reports confidence.
    Never,
    /// The handler may report confidence depending on the result.
    Optional,
    /// Every successful result reports confidence.
    Always,
}
```

`Optional` is still a guess, but it is now a _declared_ guess. A consumer can
ask what a handler will do, and a strict-mode compile can insist it be `Always`
before a routing step is allowed to depend on it. That moves the decision from
the moment of use, where there is no information, to the moment of declaration,
where there is.

This is the classic typestate shape — the capability lives in the type, and a
combination that should not exist does not typecheck. It is not novel, and I
would not claim it is: Mudduluru and colleagues built a Java type system for
determinism with a `NonDet :> OrderNonDet :> Det` qualifier lattice that is
structurally the same idea, and whose paper is worth reading for a reason I will
come back to.

## The actual root cause is one field

Here is where I stopped and paid attention, because the two layers above are
both mitigations and neither is the bug.

The live handler result carries `Option<f32>`. The _recorded step_ does not.
Source: `crates/crux-types/src/step.rs:69-85`.

```rust
pub struct Step<T = serde_json::Value> {
    pub stable_id: Option<String>,
    pub name: String,
    pub kind: StepKind,
    pub status: StepStatus,
    /// Whether this result was produced by live execution or restored from replay.
    #[serde(default)]
    pub origin: StepOrigin,
    pub confidence: f32,
```

`confidence: f32`. Not `Option<f32>`. The trace format has no way to represent
absence, so absence is laundered into a number **at write time**.

This is the whole problem in one declaration. A trace written by a handler that
reported `0.42` and a trace written by a handler that reported nothing both
record a float, and there is nothing downstream that can tell them apart. The
distinction did not fail to survive the round trip — it was destroyed before
there was a round trip to survive.

Which means the replay guarantee was not "we might restore a slightly wrong
value." It was: **a replayed run could take a different branch than the original
run, with nothing recording that this happened.** The `origin` field beside it
tells you a step came from a cache. It does not tell you the cache entry was
built from a different input than the one you think.

## Layer three: refuse the combination

Given the root cause, the honest options are two. Widen the trace format to
carry `Option<f32>`, or refuse to run pipelines that would need it. We did the
second, and the refusal is static.

Every pipeline carries a flag computed at construction, by asking the typed
intermediate representation whether any variable or step reads
handler-reported confidence. Source: `crates/crux-script/src/ir.rs:526-529`.

```rust
let confidence_dependent = variables
    .values()
    .any(|binding| binding.value.reads_handler_confidence())
    || steps.iter().any(TypedStep::reads_handler_confidence);
```

That is a whole-program analysis over the compiled IR, not a runtime heuristic.
And it gates replay. Source: `crates/crux-script/src/runner.rs:158-163`.

```rust
if previous.is_some() && pipeline.prefix_is_confidence_dependent(steps.len()) {
    return ctx.finalize(Err(CruxErr::step_failed(
        &pipeline.name,
        "confidence-dependent typed pipelines cannot be replayed",
    )));
}
```

The method's own doc comment states the reasoning:

> Typed pipelines that read handler-reported confidence cannot be replayed
> because replay traces currently retain handler values but not confidence.

Two things are worth noticing. It fires only when `previous.is_some()` — replay
was actually requested. And it checks the _executed prefix_, so a pipeline whose
confidence branch was never reached replays fine. The constraint is scoped to
where the hazard is real, which is the only way a constraint like this survives
contact with users.

## The counter-evidence, which is good

This design is stricter than it needs to be, and the strongest arguments against
it are real.

**Just widen the format.** This is what production tracing systems do. Perfetto's
design document is emphatic that there is no version number in the trace file or
the protocol and never will be; fields are added, older readers ignore them, and
capability is negotiated at runtime. Add `confidence: Option<f32>`, and old
traces simply have `None` where the new ones have a value.

That is a good argument and it is what I would do with a format I controlled. It
does not address the traces already written. A widening fixes every trace minted
_after_ the change and silently mis-replays every trace minted before it, because
those records contain a number that was a default rather than a measurement, and
nothing marks them. The refusal prevents new ones from being minted at all.

**Rejecting at compile time does not scale.** TensorFlow's determinism RFC
considered a whole-API determinism switch and dropped it: "determining every
TensorFlow component which is current nondeterministic is infeasible. There is no
effective way to find every nondeterministic part of TensorFlow." They still
reject — every built-in op either becomes deterministic or raises — but only per
op, at runtime, because they cannot enumerate the surface.

**Permissive with diagnostics is a legitimate default.** Meta's Hermit passes
unimplemented syscalls through to the host by default and makes strictness a
diagnostic flag, with a published catalog of exactly which calls break replay.
That is a defensible engineering call and it is the opposite of mine.

**And over-constraining a language is a real cost.** Typestate advocates say so
themselves: you want to spend the ceremony only where misuse is both likely and
costly. There is a standing critique of make-illegal-states-unrepresentable as
"premature crystallization of domain understanding into rigid technical models."

My answer to all four is scoping, not stubbornness. The constraint here is at
the _replay-contract_ layer, not the business-logic layer: it does not constrain
what a pipeline can express, only whether you may ask to replay one whose
recorded inputs cannot determine its control flow. Widening the format is on the
roadmap and will make this refusal obsolete, which is the right outcome.

## The bug shipped somewhere else, too

The most useful thing I found while writing this was not in my own codebase. It
is the same shape, in a shipped authorization language, and the mitigation is
the opposite of mine.

A practitioner write-up of Cedar policy evaluation takes a policy whose intent is
"allow everything except the admin endpoint, unless this call came from the
admin network," where the `viaAdminNetwork` key is _omitted_ rather than `false`
for ordinary calls. The forbid statement errors on the missing key and is
skipped; the permit statement has already evaluated; so:

> the forbid statement is not processed as there is an evaluation error due to
> the missing key. However, as the permit statement has been evaluated, and there
> are no other valid forbid statements, the result is an allow of the call.

A missing value becomes a permissive decision, and the suggested remedy is that
callers "might also consider overriding an allow result if any evaluation errors
are present." That is a fail-open with a diagnostic, where mine is a fail-stop.
Same hazard, different choice — and the reason I feel better about the choice is
purely that a fail-stop is compatible with a future diagnostic, and a fail-open
is not.

## The general form

If you take one thing: **a value that steers control flow has three obligations,
and they fail independently.**

1. It must be _present_, not defaulted into existence.
2. It must be _attributable_ — the producer declared whether it emits one.
3. It must be _restorable_ from whatever the system uses to reproduce the run.

A `Default` satisfies none of the three and is invisible to every tool in the
ecosystem. A capability enum satisfies the second and makes the first
negotiable. Neither helps the third, because the third is a property of the
_serialization format_, not of the handler API — and if you do not fix it there,
no amount of type-level care upstream will save you.

So check the field, not the function. Find the struct that your trace is made
of and ask whether it can represent "this did not happen." If it cannot, then
any value of that field is a guess, no matter how carefully it was defaulted, and
the honest move is to refuse the run rather than reproduce a branch selection
from a number you made up.

---

_crux_ is an agentic Rust DSL and runtime trace model — pipelines compile to a
typed, scope-checked intermediate representation, execute with a full trace, and
support replay. The type described here is `Step`, and the analysis is in
`crates/crux-script/src/ir.rs`.
