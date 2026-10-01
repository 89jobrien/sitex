---
title: Authority Flows Down, Evidence Flows Up
date: 2026-09-30
description: >-
  The rule that makes automation governable: an execution system may report what
  happened, but it never decides whether the outcome was good enough to promote.
  Where manual work recurs, that is an architecture gap rather than a process to
  streamline.
taxonomies:
  tags:
    [agent-harness, software-architecture, developer-experience, observability]
extra:
  related:
    [
      post:policy-between-intent-and-effects,
      post:replayability-over-autonomy,
      project:taskit,
      project:cargo-promote,
    ]
---

# Authority Flows Down, Evidence Flows Up

Most writing about agent automation argues about how much to automate. I think the
more useful question is directional: when a system acts, who granted it the
authority to act, and who decided whether the outcome was acceptable?

```text
intent   ──►  validation · plan · capability grant · policy
capability ──►  bounded, expiring, never self-escalating
evidence ──►  traces · artifacts · hashes · evaluations
promotion ◄──  decides — and is not the thing that executed
```

That gives a single rule:

> **Authority flows downward as constrained grants. Facts flow upward as evidence.
> No component does both.**

An execution system may report what happened. It does not get to decide whether
that was sufficient for a merge, a release, a rule activation, or a durable state
change. Everything below is an attempt to make that one sentence true inside a
codebase, and to be honest about where it stops being true.

## The premise: repeated manual work is a design signal

The premise I work from is narrow: **any operation that repeatedly requires human
memory, manual repair, or procedural supervision is a design signal, not an
inevitable cost of doing business.**

A developer remembering which checks to run. An agent making the same unsafe tool
call. CI discovering the same integration breakage late. A team reconstructing
handoff state from scattered logs. These look like four problems. They are one
problem: essential operational knowledge has escaped the system and now lives in
somewhere it cannot be inspected.

It escapes into individual memory, chat history, unenforced READMEs, shell
aliases, copy-pasted commands, half-completed issue trackers, and tribal
convention. What it produces is this:

```text
change code
  → remember the affected components
  → remember the required checks
  → remember the environment assumptions
  → remember the release procedure
  → notice failures
  → remember how to diagnose them
  → remember how to avoid repeating them
```

That is not a control plane. It is a dependency graph operated by memory, and
memory is the least reliable component in the system.

## What bookkeeping actually looks like

The practical version of the premise is a distinction I keep coming back to:
**human judgment versus human bookkeeping.**

| Human work that should remain            | Human work that should be engineered away                       |
| ---------------------------------------- | --------------------------------------------------------------- |
| Choosing strategic direction             | Remembering which test command applies to a changed crate       |
| Accepting an unusual risk                | Reconstructing an agent session from scattered logs             |
| Deciding whether to ship something novel | Repeating the same preflight warning on every unsafe command    |
| Resolving a real product tradeoff        | Cleaning stale artifacts from every completed run               |
| Confirming a safety-critical action      | Manually correlating obvious CI failures with known root causes |
| Reviewing ambiguous evidence             | Copying project state between sessions or tools                 |

The right-hand column is not "easy to automate." It is _derivable_. Somebody
already knows the answer; the problem is that the knowledge has no authoritative
home, so it gets reconstructed by hand every time.

Taskit is the small case. "Which crates do I need to test?" is bookkeeping, and it
is answered by deriving from state rather than recalling. Source:
`crates/taskit-engine/src/affected.rs` in taskit.

```rust
let output = cmd!(sh, "git diff --name-only origin/main...HEAD")
    .read()
    .map_err(|e| {
        TaskitError::other(format!(
            "failed to detect affected crates — ensure 'origin/main' is fetchable: {e}"
        ))
    })?;

let changed_files: Vec<&str> = output.lines().collect();

let mut affected = BTreeSet::new();
for file in &changed_files {
    for entry in &ws.crates {
        if file.starts_with(&format!("{}/", entry.dir)) {
            affected.insert(entry.dir.clone());
        }
    }
}

apply_propagation(&mut affected, ws);
Ok(affected)
```

Changed files become crates by prefix match, then a declared propagation table
expands the set to dependents. The types are deliberately boring. Source:
`crates/taskit-types/src/config.rs` in taskit.

```rust
pub struct CrateEntry {
    /// Relative directory path for the crate.
    pub dir: String,
    /// Cargo package name override when it differs from `dir`.
    pub pkg: Option<String>,
    // … one further field, elided here
}

pub struct PropagationEntry {
    /// Crate whose changes trigger propagation.
    pub source: String,
    /// Crates marked affected when `source` changes.
    pub dependents: Vec<String>,
}
```

The value is not the diff. It is that the propagation table is _data in a
reviewed file_ rather than a heuristic in someone's head. A wrong table entry is
a one-line PR diff. A wrong recollection is invisible.

The same file also contains the honesty. `apply_propagation` does a single pass
and says so: it is correct only while no source also appears as a dependent, and
it should become a fixpoint loop if transitive relationships are ever added. A
governance system that cannot describe its own limits is worse than no governance
system, so that comment matters more than the algorithm.

## The lifecycle makes promotion a separate question

If a single component both acts and judges, you have a control system with no
separation of duties. Making the operational lifecycle explicit is the cheapest
way out:

| Stage            | Question                                         | What belongs there                                                    |
| ---------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| Intent           | What is being requested?                         | Goal, scope, source, requester, constraints                           |
| Validation       | Is the request well-formed and allowed?          | Schema checks, policy checks, repository state, safety constraints    |
| Plan             | What work is actually required?                  | Affected components, ordered tasks, prerequisites, expected evidence  |
| Capability grant | What may perform the work?                       | Least-privilege tool access, execution limits, expiry, quotas         |
| Execution        | What happened?                                   | Commands, runtimes, tools, agents, build systems, plugins             |
| Evidence         | What proves the outcome?                         | Test reports, traces, artifacts, hashes, logs, attestations           |
| Evaluation       | Does the result satisfy the intended conditions? | Regression checks, quality policy, compatibility rules, risk analysis |
| Promotion        | What may become durable?                         | Merge, release, rule activation, memory retention, publication        |
| Learning         | How does future behavior improve?                | New tests, rules, guardrails, task templates, agent corrections       |

The stage that does the most work is Evaluation, because it exists to break the
conflation between "the command succeeded" and "the intended outcome is safe to
promote." That conflation is the one I see most often in postmortems, and it is
the reason a fast system ships something wrong.

## N+1: name the unit that owns the artifact

The next move is about ownership, and it is the one I did not expect to matter
this much.

An N-level system treats every command, log, temporary directory, retry script,
and cleanup instruction as an independent object. Each is fine. Together they
require somebody to know how all the pieces relate, which is the original problem
one level up.

N+1 introduces a meaningful unit: the campaign, task, build, agent run, machine
profile, or release. That unit becomes a lifecycle aggregate, and artifacts hang
off it. The question changes:

> Not "who owns this artifact?" but "what unit of work created it, who owns that
> unit, and what happens to the artifact when the unit reaches a terminal state?"

`hj` is the direct implementation. Source: `crates/hjlib/src/lib.rs` in hj.

```rust
pub struct Handoff {
    pub project: Option<String>,
    pub id: Option<String>,
    pub updated: Option<String>,
    pub items: Vec<HandoffItem>,
    pub log: Vec<LogEntry>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_yaml::Value>,
}
```

One file per repo, written to `.ctx/HANDOFF.<project>.<repo>.yaml`, carrying open
items, priorities, and a session log. The CLI reads it for triage at session
start, appends a log entry at session end, and syncs to SQLite. That is a
terminal state with a name, which is what makes "what should be cleaned up"
answerable instead of a judgement call.

## N+2: the system learns, and it does not authorize

N+1 gives the system structure. N+2 gives it feedback:

```text
execution
  → observed failure or drift
  → normalized evidence
  → classification
  → candidate intervention
  → simulation or regression validation
  → scoped activation
  → future prevention or correction
```

This is where a self-improving system gets dangerous, because the tempting move is
to let stage five write to stage seven. A single failed command might be local
repository state, an unavailable service, a corrupted cache, or a bad assumption —
not a universal rule violation. Treating it as one produces global policy from
noise.

Coursers draws the line explicitly, and it draws it in a doc comment rather than
in code, which tells you how deliberate it is. Source:
`crates/core/src/analyze/suggest.rs` in coursers.

```rust
//! Rule suggestion from unhandled command history.
//!
//! Given a list of unhandled command stems (from `history::discover`),
//! generates candidate rule JSON that can be pasted into the rules config.
```

_That can be pasted into the rules config._ The system detects recurrence,
scores it by frequency and token estimate, and drafts a candidate rule — and then
stops. The paste is a human action. `SuggestedRule` carries `count` and
`example` so the reviewer can judge whether the recurrence was real or a bad
afternoon, but nothing in the type can install itself.

The four-stage pipeline around that draft is the governance:

1. `crs discover` — find unhandled commands, write a report.
2. `crs propose-rules` — draft candidate rules from the report.
3. `crs validate` — gate. Fails loudly, stops the pipeline.
4. `crs install` — back up, merge atomically, re-validate the live config.

No stage reaches stage four without passing stage three. That is the whole
governance mechanism — and note which stage it puts in code. Drafting and
installing are both things an agent will happily do on request, so the one step
that is not negotiable is the one that is automated. **Learning systems propose;
governed systems authorize.**

A proposal is worth nothing without its scope and its exit. Every legitimate
intervention can answer: what happened, where the evidence is, which failure
class this is, what scope the rule covers, what behavior it changes, how it was
tested, how it rolls back, when it expires, and how you would know whether it
worked. A rule that cannot answer those is not automation — it is a trapdoor with
a default value.

## Evidence before promotion

Execution facts and governance conclusions are different objects, and conflating
them is the most common way a fast system ships something wrong:

| Observation                    | It does **not** prove                         |
| ------------------------------ | --------------------------------------------- |
| A command exited with code `0` | The feature is correct                        |
| A test suite passed            | The release is safe                           |
| An agent produced a patch      | The patch should merge                        |
| A container started            | The environment met policy                    |
| A rule matched an event        | The rule should be globally activated         |
| A workflow completed           | Its artifacts should be retained indefinitely |

So the system has to assemble an evidence bundle before anything is promotable:
source revision and configuration identity, plan and policy versions, execution
trace, test results, generated artifacts, hashes, environment identity, known
limitations, and the evaluation result. Promotion then becomes a _separate
authority_ that reads that bundle and decides.

`cargo-promote` makes "make authority narrower than capability" look like six
lines of TOML. Source: `promote.toml` in cargo-promote.

```toml
[registries.cratebox]
confirm = false

[registries.crates-io]
confirm = true

[pipelines.default]
stages = ["cratebox", "crates-io"]
```

Same binary, same pipeline, same code path. The private registry advances without
a prompt and crates.io does not, because the human-in-the-loop requirement is
_policy configuration_ rather than a branch in the source. That is the direction
rule expressed as data.

When a promotion needs human judgment, the system records the judgment instead of
skipping the gate. Source: `src/domain/deferral.rs` in cargo-promote.

```rust
pub struct Deferral {
    pub ticket: String,
    pub crate_name: String,
    pub version: String,
    pub from_stage: String,
    pub to_stage: String,
    pub status: DeferralStatus,
    // … plus kind, deferred_at, command, reason, and pr_number
}
```

`DeferralStatus` is `Pending`, `Confirmed`, `Rejected`. The ticket carries a
`source_hash`, so "confirm this" refers to a specific revision rather than to
whatever the working tree looks like when someone gets around to it. Deferral is
not a hole in the pipeline; it is a first-class state with an owner.

## Where I think this is wrong, or at least expensive

The rule is worth stating precisely because it is falsifiable, so let me state
where it fails.

**Not every repeated manual step deserves a corrective path.** Some repetition is
the work. Reviewing a novel cryptographic change is repetitive in the sense that
it happens every week, and automating it would be a downgrade. The honest version
of the premise has a clause the slogan usually drops: _and where an automated
corrective path is safe_. That clause is doing most of the work, and a system
that cannot tell safe from unsafe should not be automating anything.

**Evidence bundles are expensive.** You pay for tracing, hashing, retention, and
evaluation on every run, and the overwhelming majority of runs will never be
inspected. The provenance literature measures real overhead for exactly this
reason, and granularity versus cost is a genuine tradeoff rather than something
you get for free by having good architecture. The cheap version is to make
_producing_ the evidence automatic and _reading_ it lazy.

**Governed systems erode faster than unguarded ones.** A rule with no expiry is
worse than no rule once it is wrong, because the guardrail now silently protects
the wrong behavior. Every stage-four install needs a review date, and a codebase
where nobody has revisited a rule in a year is not more governed — it is more
frozen.

**Single-pass propagation is the shape of the next bug.** Taskit documents its
own limit in a comment, which is the correct response. The general failure mode is
a governance layer whose inputs nobody re-derives, at which point it is
decoration, and a decorated control system is more dangerous than an absent one
because people stop looking.

## The shape I want at the end

An environment where routine correctness does not depend on exceptional memory,
and where the answer to "can this be promoted?" comes from an evidence bundle
rather than from whoever is paying attention.

The principles that get me there, in the order I would apply them:

1. Make ownership explicit — name the lifecycle unit before naming the artifact.
2. Make authority narrower than capability.
3. Treat traces and evidence as products, not debugging leftovers.
4. Let agents propose; let policies authorize.
5. Make ephemeral state expire by default and durable state earn promotion.
6. Convert recurring recovery into tests, gates, rules, or safe automation.
7. Preserve uncertainty — a degraded state must never masquerade as success.
8. Optimize for a system that is still understandable after its author is gone.

The last one is the one I check myself against most often. Every design decision
above makes the system more governable by a person who is not me, which is the
only version of "self-governing" I actually believe in.

## Sources

- [Coursers rule suggestion and the propose-don't-install boundary](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/analyze/suggest.rs)
- [Coursers discovery report source](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/analyze/history.rs)
- [Coursers command surface, including `discover`, `validate`, and `validate-hooks`](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/coursers/src/lib.rs)
- [Affected-crate detection from Git history](https://github.com/89jobrien/taskit/blob/bf32c07859f01fd5673171b06db444d06a01e971/crates/taskit-engine/src/affected.rs)
- [Crate and propagation table types](https://github.com/89jobrien/taskit/blob/bf32c07859f01fd5673171b06db444d06a01e971/crates/taskit-types/src/config.rs)
- [`Handoff` lifecycle aggregate](https://github.com/89jobrien/hj/blob/1c641b4ff60b6bdab963d41f46a15694ca2f736d/crates/hjlib/src/lib.rs)
- [Per-registry confirmation policy and pipeline stages](https://github.com/89jobrien/cargo-promote/blob/c9238d1c5b498ac340d03d3b82dedb0736593524/promote.toml)
- [`Deferral` tickets carrying `source_hash`](https://github.com/89jobrien/cargo-promote/blob/c9238d1c5b498ac340d03d3b82dedb0736593524/src/domain/deferral.rs)
