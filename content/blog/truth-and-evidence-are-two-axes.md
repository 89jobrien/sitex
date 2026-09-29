---
title: Truth Value and Evidence Provenance Are Two Different Questions
date: 2026-09-28
description: >-
  Why a four-valued truth type is not enough for a rules engine, and how
  keeping provenance on a second axis turns a dangerous default into a
  well-defined one.
taxonomies:
  tags: [software-architecture, agent-runtime]
extra:
  related: [post:provenance-is-the-point, post:grounding-survives-summarization]
---

Every policy engine has the same default. When a fact is missing, assume the
predicate is false. Access control does it. Authorization frameworks do it. The
rule "if `user.mfa_enabled` is absent, treat it as not enabled" is a closed-world
assumption, and almost every system makes it somewhere.

I built a rules engine last year where that default is configurable, and I only
understood why configuring it was hard when I tried to change it. The problem is
not that the default is risky. The problem is that a four-valued truth type —
`True`, `False`, `Unknown`, `Invalid` — still does not contain enough
information to apply it correctly.

The engine is `rulery`: YAML rule packages compiled to a deterministic
intermediate representation, evaluated with four-valued truth, emitting
reproducible traces and refusing to export to targets that cannot represent what
it knows. This is about one function in it.

## `Unknown` does not mean what you think

The first thing to clear up, because I got it wrong before I read the code, is
what `Unknown` means here. It is not "not yet determinable." It is not
"timed out." It has exactly one meaning, and the codebase is consistent about
it.

Source: `crates/engine/src/truth.rs`.

```rust
/// Truth state preserving absent and malformed evidence distinctions.
pub enum Truth {
    /// Predicate is satisfied.
    True,
    /// Predicate is not satisfied.
    False,
    /// Required evidence is absent or indeterminate.
    Unknown,
    /// Evidence exists but violates its contract.
    Invalid,
}
```

Every place the engine produces `Unknown` produces it from one condition: the
referenced fact was `OperandState::Absent`. Source:
`crates/engine/src/predicate.rs`.

```rust
PresencePredicate::IsValid => match state {
    OperandState::Absent => Truth::Unknown,
    OperandState::Null | OperandState::Malformed(_) => Truth::False,
    OperandState::Valid(_) => Truth::True,
},
```

and for binary predicates, absence is checked first, before malformation:

```rust
if matches!(left, OperandState::Absent) || matches!(right, OperandState::Absent) {
    return Truth::Unknown;
}
if matches!(left, OperandState::Malformed(_)) || matches!(right, OperandState::Malformed(_)) {
    return Truth::Invalid;
}
```

So `Unknown` means _a fact this predicate needed was not supplied_. That is a
statement about evidence, not about the world and not about time. An
`unreachable_state()` helper returns `Invalid`, not `Unknown` — an internal
inconsistency is a different failure from a missing input, and the engine knows
it.

## The enum that is not the point

If `Unknown` means "absent" and `Invalid` means "violated its contract," then
the four values are already carrying provenance. So why does the engine also
have this?

Source: `crates/engine/src/evaluator.rs`.

```rust
/// Evidence class attached to a decision-relevant predicate result.
pub enum EvidenceClass {
    /// Valid or explicit-null evidence.
    Supplied,
    /// Absent evidence.
    Absent,
    /// Malformed evidence.
    Malformed,
}
```

And every predicate observation carries both, separately:

```rust
pub struct PredicateObservation {
    /// Referated fact path.
    pub path: FactPath,
    /// Predicate truth before strategy application.
    pub truth: Truth,
    /// Evidence class.
    pub evidence: EvidenceClass,
```

Two enums, overlapping in content, and neither derived from the other. This is
redundant — `truth: Unknown` almost always implies `evidence: Absent`. Redundant
state in an evaluator is a smell, and for most systems I would delete it.

Then I read the function that applies the closed-world default.

## The proof

Here is the whole argument, in the strategy application. Source:
`crates/engine/src/evaluator.rs`.

```rust
let adjusted_truths = observations
    .iter()
    .map(|observation| {
        if *missing == MissingFactStrategy::ClosedWorldFalse
            && observation.evidence == EvidenceClass::Absent
        {
            Truth::False
        } else {
            observation.truth
        }
    })
    .collect();
```

The collapse is keyed on `observation.evidence == EvidenceClass::Absent`. It is
not keyed on the truth value. That is not a style choice, and it is the entire
reason the second enum exists.

Consider what a truth-keyed collapse would do. `Truth::False` is reachable from
two completely different situations:

- a fact was supplied, and the predicate genuinely did not hold — the user's
  training expired on 2024-01-01 and today is later than that
- a fact was absent, and some earlier stage already assumed it away

A collapse written as "if truth is `Unknown`, make it `False`" is safe. A
collapse written as "if truth is `False`, record that it was assumed" is
catastrophic, because it relabels real denials as defaults and the trace
outlives the bug. A collapse keyed on the evidence axis cannot relabel anything,
because evidence is recorded at the leaf and never overwritten.

**You cannot write this function correctly with only a four-valued truth
type.** That is a demonstrable claim, not a stylistic preference. The
information needed to apply the default safely is not in the truth value, and
if you do not carry it separately you have to choose between two wrong
behaviors.

This is the same argument as
[Provenance Is the Point](@/blog/provenance-is-the-point.md), applied to
evaluation rather than storage. There, the finding was that a `Vec<Chunk>` with
no back-pointer cannot answer what a node rests on. Here it is that a `Truth`
with no evidence class cannot answer which records a default touched.

## Two failure modes, two strategies, compiled in

If absence and malformation are different problems, they should not share a
knob. Source: `crates/engine/src/evaluator.rs`.

```rust
/// Compiled missing-fact behavior.
pub enum MissingFactStrategy {
    /// Retain unknown truth.
    PreserveUnknown,
    /// Convert absent predicate results to false before composition.
    ClosedWorldFalse,
    /// Produce an information-request candidate.
    RequestInformation,
    /// Produce an escalation candidate.
    Escalate { destination: EscalationId },
}

/// Compiled malformed-fact behavior.
pub enum InvalidFactStrategy {
    /// Stop evaluation when malformed relevant evidence exists.
    RejectEvaluation,
    /// Retain invalid truth.
    PreserveInvalid,
    /// Produce an escalation candidate.
    Escalate { destination: EscalationId },
}
```

Different arities, different variants, no overlap. And one asymmetry that
matters: a malformed fact can make evaluation _fail outright_, while an absent
one never can.

```rust
if !invalid_paths.is_empty() && *invalid == InvalidFactStrategy::RejectEvaluation {
    return Err(EvaluationError::InvalidFact { paths: invalid_paths });
}
```

Absent data is normal; it might arrive later. Malformed data is a bug in
whoever produced it, and `RejectEvaluation` says so by refusing to produce an
answer at all. A single boolean could not express that, because it would be the
same knob for both.

## Refusing to lose information on the way out

The engine will not quietly degrade. Emitting a rulebook to a target that cannot
represent the extra values produces an error, not a truncation. Source:
`crates/emit/src/decision_table.rs`.

```rust
if !capabilities.uncertainty && rule.truth_states.contains(&Truth::Unknown) {
    losses.push(loss(rule, "RUL400", ProjectionFeature::Unknown));
}
if !capabilities.uncertainty && rule.truth_states.contains(&Truth::Invalid) {
    losses.push(loss(rule, "RUL400", ProjectionFeature::Invalid));
}
```

SARIF is one such target, and its capability set is declared at
`crates/emit/src/sarif.rs`:

```rust
ProjectionCapabilities {
    escalation: false,
    information_request: false,
    uncertainty: false,
    actions: false,
    reasons: false,
},
```

So SARIF output of a four-valued rulebook is lossy by construction, and there is
a test asserting exactly which features are lost. This is a real standard with
nowhere to put "I do not know," and the engine says so rather than inventing a
place for it.

## What mature engines actually do

Here is where I have to argue against myself, because the best prior art
disagrees with the framing so far.

Cedar is a production authorization language with a published design rationale,
and it evaluates to three values — `true`, `false`, `error` — then collapses
them to two with a three-step rule. The third step is the one that matters, and
it is the only part of the guidance most people read:

> Otherwise (i.e., no policy is satisfied), the final result is `Deny`.

And from the Cedarland blog, written by Cedar's own designers:

> The answer is indeterminate and therefore Cedar errors. Only the policy author
> can resolve the ambiguity.

That is my exact argument, in Cedar's words. They identify indeterminacy, they
represent it distinctly, and then they deliberately **discard** it, for a good
reason:

> Imagine a system with 100 policies that are running successfully, and then
> someone adds policy number 101 which contains an error. If Cedar halted on
> error and emitted a default-deny decision for the entire batch of policies,
> then 100% of all authorization decisions in the system could begin failing,
> simply because someone introduced an error in one new policy.

OPA goes the other way. Undefined is a first-class value and the docs are
insistent that it is not false:

> if the `input` provided to OPA does not include a public network then
> `exists_public_network` will be undefined (which is not the same as false.)

and the collapse is an explicit, author-controlled keyword rather than an
implicit behavior.

So the honest position is much narrower than "you need four values." It is:
**the fourth value should exist, and the live question is whether it reaches the
decision.** Cedar's answer is no — it lives in diagnostics, a side-channel that
operators can opt into failing closed on. OPA's answer is that it reaches the
policy author but not the caller by default. Both are defensible. Both are
explicit. Neither collapses it silently.

A design that keeps the fourth value in the decision type, like `rulery` does,
is the stricter option and it is not obviously the right one. I keep it because
the engine's output is a _decision record_ that humans read, not a boolean an
application branches on — a different contract than Cedar's, which makes the
different choice reasonable.

## It is not Kleene, and it is not Belnap

Worth stating because the shape invites the assumption. `rulery`'s four values
are not a lattice. Check the conjunction table:

```rust
(Self::False, _) | (_, Self::False) => Self::False,
(Self::Invalid, _) | (_, Self::Invalid) => Self::Invalid,
(Self::Unknown, _) | (_, Self::Unknown) => Self::Unknown,
```

`Invalid` dominates `Unknown` in both `and` and `or`. So `and` is not the meet
and `or` is not the join on this pair, which means no lattice. Compare Belnap's
A4, where the four values are the power set of `{T, F}` and his approximation
order is a lattice.

The resemblance is real but partial. Belnap's `n` — neither true nor false, no
information — maps cleanly onto `Unknown`. Belnap's `b` — _both_ true and false,
contradictory information — does not map onto `Invalid` at all, because
`Invalid` means the evidence broke its contract, not that two sources disagreed.
One slot is used faithfully and one is repurposed for a different axis.

And the logicians have already hit this wall from the other direction. Work on
six-valued logics of evidence and truth observes that Belnap-Dunn "establishes a
distinction that cannot be established within FDE, for when the values T0 or F0
are assigned to A in FDE this does not specify whether such information is or is
not reliable." The thing four values cannot express is _reliability_ — which is
a provenance question, not a truth question. `rulery` arrives at a two-axis
design for a domestic reason, and the literature arrives at a six-value design
for the same underlying complaint.

## Why the fourth value is the expensive one

The third value is cheap. The fourth is where complexity jumps, and there is a
precise threshold rather than a vibe. Borgwardt, Cerami and Peñaloza, _Many-valued
Horn Logic is Hard_ (PRUV 2014):

> the complexity of deciding satisfiability increases from linear time—for the
> classical two-valued case—to NP-complete for the four valued (or higher) case

and, helpfully, they are explicit about the gap:

> Unfortunately, the case of three-valued semantics is not covered by our
> result.

So: linear at two values, unknown at three, NP-complete at four, for Horn
clauses under Łukasiewicz chains. That is the real cost, and it is the reason
"just add another truth value" is not free. The engineering version of the same
fact is duller: a truth table for a k-ary connective over four values has 4^k
rows.

`rulery` stays tractable by keeping the value set small, the operators binary,
and the strategy choices compile-time rather than part of the algebra.

## What this does not establish

- **There is no citation anywhere in the codebase.** No `Kleene`, no `Belnap`,
  no `Dunn`, no `Łukasiewicz`. I built a four-valued evaluator and connected it
  to this literature afterwards, in this post. The engine does not know it is
  doing anything interesting.
- **The type collapses on request.** `impl From<bool> for Truth` exists, so
  "the type refuses to become a boolean" would be false. It offers the
  conversion; the discipline is in not taking it where provenance matters.
- **The abstention path is untested against reality.** The one golden file in
  the repository is a decisive result — every condition true, no required facts
  missing, nothing malformed. `Unknown` and `Invalid` only ever appear in Rust
  unit tests. Nobody has run a real rulebook through this and looked at what the
  extra values bought.
- **The static analysis is inconclusive on real packages.** Records, lists, and
  text partition to an empty representative set, so no rule over those types can
  be certified unreachable, and the conformance suite never invokes the
  analyzer at all. A check that cannot certify anything on the shipped example
  is not much of a check.
- **One external consumer.** Across the whole workspace the only reference
  outside `rulery`'s own crates and tests is a shell-completion file. No
  plugin, no dependent crate, no pipeline.

## The general form

If you take one thing: **when a system applies a defaulted assumption, it must be
able to identify which inputs the assumption touched.** That requires recording
the reason the value was what it was, at the point the value was produced, and
keeping it separate from the value itself.

A four-valued truth type helps. It is not sufficient. The sufficiency condition
is structural rather than arithmetical — you need the axis, and you need it to be
populated at the leaf, before composition and before any default runs.

And keep the export check. The day a rulebook renders to a two-value target, the
whole argument silently evaporates, and nothing in the output will tell you.
That is the failure this design is actually built to prevent, and it is the one
that a boolean gives you no way to notice.

---

_rulery_ is a local-first compiler and evaluator for structured operational
rules — YAML rule packages compiled to a deterministic IR, four-valued
evaluation with a separate evidence-provenance axis, reproducible traces,
scenario runs, and lossy-export detection.
