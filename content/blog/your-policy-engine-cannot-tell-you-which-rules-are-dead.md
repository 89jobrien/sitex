---
title: Your Policy Engine Cannot Tell You Which Rules Are Dead
date: 2026-09-28
description: >-
  Four independent ways a hook engine loses the ability to answer a basic
  question about itself, all of them the same shape — the thing that would
  tell you is not in the build graph.
taxonomies:
  tags: [agent-harness, software-architecture, observability]
extra:
  related: [post:provenance-is-the-point, post:truth-and-evidence-are-two-axes]
---

Anthropic's guidance for long-running harnesses is to re-simplify on model
upgrades, and the practice they name is:

> After each model release, comment out harness pieces one at a time and see
> what's still load-bearing

That appears in the pattern table of
[`anthropics/cwc-long-running-agents`](https://github.com/anthropics/cwc-long-running-agents),
credited to [_Harness Design for Long-Running Application
Development_](https://www.anthropic.com/engineering/harness-design-long-running-apps)
(March 2026).

It is the correct practice and it is the right instinct. Harnesses accumulate
scaffolding that a newer model makes redundant, and the only reliable way to find
out which parts are now dead is to disable them one at a time and observe.

It also requires something specific: a harness that can tell you whether a
component is doing anything. Comment out a rule and watch for a week. If nothing
changes, the rule was dead.

I have a hook engine with roughly eighty live policy rules, and I cannot run
that experiment. Not "it is awkward." I cannot ask the question. The reason is
not a missing feature or a missing query — it is that every piece of my
instrumentation sits outside the place where the question would be answered.

Four separate failures, one shape.

## It only writes down what fired

When a hook runs, the engine evaluates the command against every rule and writes
an execution record. Here is the condition. Source:
`crates/coursers/src/crs_commands.rs`.

```rust
// Log to redb only when a rule actually fired (skip silent passes).
if !result.matched_rules.is_empty()
```

Silent passes are dropped. The log is a fire report, not an evaluation log.

That is a perfectly reasonable optimization and I wrote it deliberately. It is
also why the question is unanswerable. A rule that fired ten thousand times and a
rule that never fired produce the same _shape_ of data: one has an entry, one has
no entry. Nothing records the evaluation, so I cannot distinguish "evaluated and
did not match" from "was never evaluated" — and I certainly cannot enumerate the
rules that fall in the second category, because they leave no trace at all.

The same condition appears in the OpenCode adapter at
`crates/coursers/src/opencode.rs:170`. This is a harness-wide policy, not a bug
in one adapter, which is why fixing it is not a one-line change.

## The statistics store cannot express the question

Even setting the fire log aside, the abstraction makes the query impossible. Here
is the entire interface. Source: `crates/core/src/analyze/stats.rs`.

```rust
pub trait StatsStore {
    fn load(&self) -> Result<Stats, CourserError>;
    fn save(&self, stats: &Stats) -> Result<(), CourserError>;

    /// Increment the block counter for `rule_id` and persist.
    fn record_block(&self, rule_id: &str) -> Result<(), CourserError> {
        let mut stats = self.load().unwrap_or_default();
        *stats.blocks.entry(rule_id.to_string()).or_insert(0) += 1;
```

Three methods. There is no configured-rule enumeration, no last-evaluated
timestamp, and no way to take a complement. The store is handed a rule ID that
already fired and is asked to increment it. It is structurally incapable of
answering "which configured rules have never fired," because it never sees the
ruleset.

So `crs stats` prints the rules that have fired, sorted. A rule that has never
fired is indistinguishable from a rule that does not exist.

## The rule engine's only fuzz target does not compile

This is the one that made me actually stop and pay attention, and I confirmed it
by running the compiler rather than by reading the code.

`fuzz/fuzz_targets/fuzz_rule_check.rs` is the only fuzz target that exercises
rule matching. It builds three `Rule` literals and asserts a real property — that
`check` and `matched_rule_id` agree on every input, which is exactly the kind of
invariant worth fuzzing:

```rust
// check, check_pipeline, and matched_rule_id must never panic.
let chk = check(s, &rules);
let _pip = check_pipeline(s, &rules);
let mid = matched_rule_id(s, &rules);

// check and matched_rule_id must agree.
assert_eq!(
    chk.is_some(),
    mid.is_some(),
    "check/matched_rule_id disagree on: {s:?}"
);
```

`Rule` has eight fields. The literals in that file set seven. There is no
`Default` impl to fall back on. Compiling it:

```
error[E0063]: missing field `task_override` in initializer of `Rule`
error: could not compile `coursers-core-fuzz` (bin "fuzz_rule_check") due to 3 previous errors
```

`task_override` was added later, to match patterns against godmode task titles. It
carries `#[serde(default)]`, so every JSON rule that predates it still
deserializes — there is a test at `crates/types/src/rules.rs:95` asserting exactly
that backward compatibility. But `#[serde(default)]` fixes deserialization and does
nothing for a struct literal.

Which is the whole point: the change was safe for every path the test suite
covers and broke the one path it does not.

And it stayed broken, because the fuzz crate is deliberately outside the build.
`fuzz/Cargo.toml:17-18`:

```toml
# Prevent this from being discovered as a workspace member
[workspace]
```

So `cargo check --workspace` does not build it, `cargo clippy --workspace` does not
lint it, and `libfuzzer-sys` needs a nightly toolchain that CI is not using for
this crate. One of six fuzz targets has been dead for as long as the field it
names has existed, and every other target in that directory compiles fine, so
there is no obvious signal.

The property that `check` and `matched_rule_id` agree has never been fuzzed.
Probably not a big deal. But "probably not a big deal" is my inference, and the
reason I _can_ make that inference at all is that I went and compiled the thing.

## Most of the recorded traffic is for a rule that no longer exists

While I was in there, I read the live statistics. The file records blocks per
rule. Three of the four rule IDs in it are live. The fourth is not in the
configuration at all.

| Rule                | Blocks | In live config |
| ------------------- | -----: | -------------- |
| `no-grep`           |     53 | **no**         |
| `no-grep-use-tool`  |     18 | yes            |
| `no-bash-use-nu`    |     17 | yes            |
| `no-sed-n-use-read` |      4 | yes            |

`no-grep` was replaced by `no-grep-use-tool`, which subsumes its pattern and also
matches `rg`. The old rule kept its counter, because `record_block` only ever
increments and nothing ever removes a key.

So **the majority of all recorded blocks in this harness are attributed to a rule
that was deleted**, and they are attributed to it permanently. If I were reading
`crs stats` to decide what matters, the loudest entry in the report would be a
rule that cannot fire. The file was last written today, so this is not a staleness
problem. It is structural: the map only grows.

The same shape appears in the failure-learning subsystem. Its state file contains
exactly one entry, and the three timestamps inside it are identical to the second.
Real occurrences of the same command would not land on the same instant. That is
the signature of a fixture, written by a test that ran against the production
config path. It is months old and has never been reaped, because
`cleanup_after_seconds` only runs on the write path and nothing has written since.

## Four failures, one shape

Here is what all four have in common:

- The evaluation log drops non-matches, so silence is unrepresentable.
- The statistics interface has no access to the ruleset, so the complement is
  uncomputable.
- The fuzz target that would answer "is the engine even correct" is outside the
  build graph, so correctness is unmeasured.
- The counter map only grows, so deletion is unrepresentable.

Every one of them is the same error: **the thing that would answer the question
is not in the graph where the question gets asked.** Not missing — present, and
in the wrong place, or present and unable to represent the answer. I did not
forget to build these. I built them in a shape that cannot carry the information,
and then discovered the shape by needing the information.

That is why a fire-only log is a trap rather than an optimization. Optimizations
trade space for time. This traded a category of answer for a small write cost, and
the category of answer was the one I would eventually need.

## What it would take

The state required is not large. For each rule: when it was last evaluated, and
how many times it matched. For the store: a join against the configured ruleset
so the complement exists. For the build: the fuzz crate as a workspace member with
a nightly lane, even a compile-only one, which would have caught the arity break
the moment it landed.

The reason none of it exists is that it is a **liveness** question and liveness
questions are structurally unfashionable. Every logging system I have worked on
optimizes for "how do I inspect what happened." Almost none of them are built to
answer "what did not happen, and was it supposed to."

A useful test: pick any subsystem you operate, and ask it to list the components
that have never contributed. If the answer requires a human remembering, that
subsystem has a retention policy, and the policy is you.

## The other outcome: enforced, declared, and declared-but-unused

It is worth being precise that the same vocabulary in a sibling project lands
three different ways.

`minibox` has a capability type with a private field, so only the policy authorizer
can construct one — the type is unforgeable and there is a test proving the
ungated path refuses a mutation. It then narrows what an agent can ask for _by
construction_ rather than by inspection, so the request has no representation.

`rulery` has a capability vocabulary and an authorizer with **zero production
callers**. Both callers are in its own `#[cfg(test)]` block. The vocabulary is
declared, the enforcement function is written, and nothing consults it at runtime.

`coursers` has the rules, the matching engine, and the log — and the log cannot
tell you which ones matter.

Same idea, three levels: enforced by the type system, implemented but unwired, and
wired but blind. Only the first survives a maintainer changing their mind, and
only the first lets you delete something with confidence. Which is the whole
point of the practice Anthropic wrote down.

---

_coursers_ is a hook and course-correction engine for agent harnesses — command
rewriting, output filtering, and failure learning, with two rule systems, fuzz
targets, and a live policy configuration. The four failures above are described
from a single working install rather than from a design review.
