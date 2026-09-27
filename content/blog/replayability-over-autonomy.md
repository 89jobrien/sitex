---
title: Build Agent Workflows for Recovery Before Autonomy
date: 2026-09-11
description: "Trustworthy agent workflows preserve inspectable progress, safely reuse completed work, and treat unattended execution as a later benefit."
---

The most important question about an automated workflow is not, “How long can
it run without me?” It is, “What happens when it stops halfway through?”

A trustworthy workflow should leave behind enough evidence to answer three
questions:

1. What finished?
2. What failed?
3. Which completed work is safe to reuse?

If those answers are unclear, a longer unattended run only creates a larger
recovery problem. Autonomy is useful, but it should be earned by making
progress inspectable and reusable first.

## Five terms that are easy to blur together

Recovery discussions often use several words as if they meant the same thing.
They do not.

**Retry** means attempting a failed operation again. If an HTTP request times
out, the workflow may send it a second time. A retry says nothing about the
steps that succeeded before the failure.

**Resume** means continuing an interrupted workflow from preserved progress.
The implementation might literally continue at the next instruction, or it
might start the workflow again and substitute saved results for completed
steps. Either approach can look like “continue from where you stopped” to the
user.

**Replay** means running the workflow against a record of an earlier execution.
When a current step matches a recorded step, the runtime may return the saved
output instead of performing the work again. Replay is one way to implement
resume, but it is also useful for debugging and comparing executions.

**Idempotency** means repeating an operation has the same intended effect as
performing it once. Setting a record’s status to `closed` can be idempotent.
Creating a new record is usually not unless the caller supplies a stable key
that lets the service recognize duplicates.

**External-state reconciliation** means checking the real system before
deciding what to do next. The workflow asks whether the issue was created, the
payment was submitted, or the file already contains the expected data. It then
aligns its own record with that reality.

These ideas solve different problems:

| Mechanism      | Question it answers                          |
| -------------- | -------------------------------------------- |
| Retry          | Should this failed operation run again?      |
| Resume         | How do we continue after interruption?       |
| Replay         | Can a recorded result replace repeated work? |
| Idempotency    | Is repeating this operation safe?            |
| Reconciliation | What actually happened outside the workflow? |

A system can support replay without making external writes idempotent. It can
retry reliably while having no way to resume. It can also resume its internal
steps while remaining uncertain about a request that reached a remote service
just before the connection failed.

That last case is the dangerous one. A local trace can say, “No response was
recorded,” while the remote service says, “The action succeeded.” Idempotency
keys, durable deduplication, transactional protocols, or reconciliation checks
can close that gap.

## The unit of trust is recorded progress

Imagine a workflow that gathers release notes, asks a model for a summary,
creates a draft, and publishes it. The publishing request times out.

Starting from scratch wastes the gathering and summarization work. Blindly
retrying the final request may publish twice. Declaring the whole run failed
hides useful progress.

A better record identifies each step, stores its outcome, and preserves useful
outputs. Recovery can then make a separate decision for every step:

- reuse a completed, matching result;
- rerun work that has no usable result;
- stop when the new workflow no longer matches the old one;
- reconcile an uncertain external effect before proceeding.

This record should be runtime data, not a model-generated explanation after the
fact. A narrative can help a person read the run, but it should not be the only
evidence of what executed.

## Crux as a case study

[Crux](https://github.com/89jobrien/crux) is an open-source Rust toolkit for
defining agent workflows as YAML pipelines or typed Rust agents while recording
each execution as an inspectable, serializable trace.

Its central type, `Crux<T>`, combines the workflow result with the record that
produced it. The public source defines fields for the run identity, agent name,
result, recorded steps, child runs, and start and finish times:

```rust
pub struct Crux<T> {
    pub id: CruxId,
    pub agent: String,
    pub value: Result<T, CruxErr>,
    pub steps: Vec<Step>,
    pub children: Vec<Crux<serde_json::Value>>,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
}
```

That shape matters because success and history travel together. A caller does
not receive only a value or only an error; it can also inspect the causal chain
of recorded steps. The same type derives serialization support, and its tests
exercise a JSON round trip.

Each `Step` records details such as its name, kind, status, timing, identity
hashes, optional output, optional error, and attempt number. Those fields turn
“the agent got stuck” into a more useful statement: a named step failed after a
known duration, while earlier steps produced recorded outputs.

Crux also records non-linear work: delegation to another agent, conditional
branches, and speculative attempts where more than one candidate may run. It
distinguishes successful, failed, rejected, and skipped outcomes. That
vocabulary gives inspection tools more structure than a stream of log messages.

## How Crux reuses completed work

Crux’s replay cache is seeded from the steps in a previous trace. For each
recorded step, it retains the name, identity hash, optional content hash, and
optional output.

When the workflow reaches a step again, replay has three possible answers:

- **hit:** a saved output matches and can be returned;
- **miss:** no reusable output is available, so normal execution can proceed;
- **mismatch:** strict replay detected that the new execution diverged.

A recorded failure has no output to reuse, so even a matching entry becomes a
miss rather than a hit. This is the practical bridge between replay and resume:
the workflow can start again, reuse matched successes, and execute work that
was not completed.

Crux provides strict and lenient replay modes. Strict mode uses a step’s
position and identity hash. The recorder builds that identity by hashing the
step name together with its ordinal position. A changed name or shifted step
can therefore be treated as divergence instead of silently accepting an old
result.

Lenient mode makes a different trade. It can scan forward for a step with the
same name. When both the old and new step provide content hashes, a differing
content hash prevents that candidate from being reused. A mismatch becomes a
miss, allowing the current step to execute normally.

Lenient replay is convenient, not proof that two workflow versions are
equivalent. Matching by name is weaker than matching a stable, versioned step
contract. A workflow author still needs to decide when old output remains valid
after code, prompts, dependencies, or data sources change.

## Replay is not transaction safety

Crux makes side effects visible in handler metadata. A handler can declare its
risk level, required capabilities, whether it is deterministic, and categories
such as filesystem writes, network access, Git, databases, or processes.

That information is valuable for review and policy. It does not make the side
effect safe to repeat.

The public `fs::write` handler illustrates the boundary. It is marked as a
medium-risk, nondeterministic filesystem write. It writes the supplied content
and returns a receipt-like JSON object containing `written: true` and the path.
The handler itself does not compare the existing file with the requested
content or use an idempotency key.

For many file writes, overwriting the same path may be acceptable. Other
effects need stronger protection:

- creating an issue should use a stable request key or search for an existing
  issue before creating another;
- publishing an artifact should check whether that version already exists;
- submitting a payment should use the provider’s idempotency mechanism;
- pushing a commit should compare local and remote state before trying again.

The trace tells recovery code what the runtime knows. Reconciliation tells it
what the outside world knows. The right protection depends on the effect:
intrinsically idempotent work may need little more than a retry, while an
uncertain non-idempotent write usually needs deduplication or reconciliation.

## A practical order of operations

Teams often begin with “make the agent run for an hour.” A safer sequence is:

1. Record every meaningful step and its outcome.
2. Persist enough output to inspect interrupted work.
3. Give steps identities strong enough to reject unsafe reuse.
4. Replay matched, completed work instead of repeating it.
5. Choose idempotency, deduplication, or reconciliation for each external effect.
6. Test recovery from failures between steps and during side effects.
7. Only then increase unattended runtime.

This order changes the goal from avoiding failure to containing it. Failures
will still happen: processes crash, network connections fail, credentials expire, models
return unusable output, and workflows evolve. The system earns trust by making
those failures bounded and recoverable.

Longer autonomy is then a consequence of good recovery design. It is no longer
a wager that nothing will go wrong.

## Sources

- [Crux overview and CLI replay commands](https://github.com/89jobrien/crux/blob/a0847735f351162f24f1136b68d75c2ee8581ffb/README.md)
- [`Crux<T>` value and serialization tests](https://github.com/89jobrien/crux/blob/a0847735f351162f24f1136b68d75c2ee8581ffb/crates/crux-types/src/crux_value.rs)
- [Recorded step fields and status types](https://github.com/89jobrien/crux/blob/a0847735f351162f24f1136b68d75c2ee8581ffb/crates/crux-types/src/step.rs)
- [Replay modes, matching behavior, and tests](https://github.com/89jobrien/crux/blob/a0847735f351162f24f1136b68d75c2ee8581ffb/crates/crux-runtime/src/replay.rs)
- [Step identity and content hashing](https://github.com/89jobrien/crux/blob/a0847735f351162f24f1136b68d75c2ee8581ffb/crates/crux-runtime/src/recorder.rs)
- [Handler risk, capability, and side-effect metadata](https://github.com/89jobrien/crux/blob/a0847735f351162f24f1136b68d75c2ee8581ffb/crates/crux-script/src/metadata.rs)
- [Filesystem handler behavior](https://github.com/89jobrien/crux/blob/a0847735f351162f24f1136b68d75c2ee8581ffb/crates/crux-stdlib/src/fs.rs)
