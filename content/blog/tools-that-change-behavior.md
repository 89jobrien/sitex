---
title: The Developer Tools Worth Maintaining Remove Decisions
date: 2026-09-11
description: "A practical test for whether a developer tool earns its upkeep: it should reliably remove a recurring decision, mistake, or manual step."
taxonomies:
  tags: [automation, developer-experience, work-tracking]
extra:
  related: [project:godmode, project:coursers, project:obfsck]
---

Developers are good at building tools and bad at deciding when those tools have
earned a permanent place in the workshop.

A repository can compile, have polished documentation, and solve the problem in
its README without changing anyone's work. The tool may still require its user
to notice the problem, remember the command, choose the right options, and check
the result. It has automated some mechanics while preserving most of the
attention cost.

That is a poor trade if the tool also brings dependencies, releases, bug fixes,
and compatibility work.

My test is simpler than a feature checklist: **a developer tool earns its
maintenance cost when it reliably removes a recurring decision, mistake, or
manual step.** The important evidence is not that the code works. It is that an
old habit becomes unnecessary.

## Start with the behavior, not the feature

Ask what happens at the repeated moment before the tool exists.

Perhaps a developer starts each session by reconstructing unfinished work.
Perhaps they review every generated shell command for a familiar dangerous
pattern. Perhaps they search logs for credentials and personal information
before sharing them. These are small tasks, but they recur often enough to
consume attention and fail often enough to matter.

A useful tool changes one of those moments. It puts the next action in front of
the user, blocks the known mistake before execution, or routes outbound text
through a sanitizer. The feature matters because of the behavior it replaces.

This leads to four useful questions:

1. What do I do differently because the tool exists?
2. What mistake no longer reaches me?
3. What manual step disappeared?
4. Which old habit returns if I remove the tool?

Vague answers are a warning. Adding features rarely turns an optional ritual
into infrastructure.

## Example 1: remove the recurring decision

[Godmode](https://github.com/89jobrien/godmode) is a session workflow tool that
loads a task graph and presents the next runnable work when an agent session
starts. [Doob](https://github.com/89jobrien/doob) is a todo tracker that can
supply the next pending item for the current project.

Together, they remove a recurring decision: "What should I resume?" Instead of
reconstructing state from memory, I can begin with the task graph and the next
project-specific todo already in view.

The integration is deliberately conditional. Godmode loads its graph, checks
whether Doob support is enabled, and asks for a todo associated with the
detected project:

```rust
let g = graph::load(root)?;
let summary = g.summary();

let next_todo = if cfg.integrations.doob {
    doob::todo_next_for_root(root).ok().flatten()
} else {
    None
};
```

The interesting product decision is not the terminal presentation. It is the
stable machine-readable boundary between the tools. Doob returns a JSON object
with a `todos` array; Godmode selects the first pending item. Changing that
envelope would break the behavior even if Doob's human-facing table still
looked perfect.

Usage can reveal that a modest interface is more valuable than a polished
surface. When another maintained tool depends on a command, the command has
evidence of demand beyond its own README.

## Example 2: prevent the familiar mistake

[Coursers](https://github.com/89jobrien/coursers) is a command-policy tool that
checks proposed shell commands against rules before an agent executes them.

That placement matters. A linter I must remember to run adds a task. A hook on
the execution path removes the review decision for known patterns. When a rule
matches, the command is denied before it can produce the failure the rule was
written to prevent:

```text
proposed command
  -> evaluate static rules and task-scoped exceptions
  -> enrich and record the matched violation
  -> render a protocol-native denial
  -> exit before shell execution
```

This is stronger than recording advice in a contributor guide. Documentation
can explain why a command is risky, but an execution-path check can make the
safe behavior the default. The tool pays rent each time the mistake stops at
the boundary instead of becoming a failure to diagnose.

The lesson generalizes: if prevention depends on memory, it is still a manual
process. Put the check where the effect occurs.

## Example 3: absorb the manual step

[Obfsck](https://github.com/89jobrien/obfsck) is a text-redaction library and CLI
for sanitizing secrets and, when requested, personally identifiable information
before text leaves a trusted context.

Its value is not the number of patterns it recognizes. The changed behavior is
that outbound logs can travel through a redaction path instead of relying on a
last-minute visual search.

The implementation also preserves an important distinction: disabling broader
PII handling does not disable secret redaction. Secrets are processed first;
minimal mode can return before IP address and email handling:

```rust
s = Cow::Owned(self.obfuscate_secrets(s.as_ref()));
if self.level == ObfuscationLevel::Minimal || !self.pii {
    return s.into_owned();
}

s = Cow::Owned(self.obfuscate_ips(s.as_ref()));
s = Cow::Owned(self.obfuscate_emails(s.as_ref()));
```

That ordering supports the behavioral promise. The baseline safety step stays
on even when the caller chooses a less aggressive mode. A useful default does
not merely offer protection; it makes accidentally skipping protection harder.

## Adoption and experimentation are different outcomes

Not every worthwhile repository needs to pass the behavior-change test yet.
Experiments have a different job: they answer a design question cheaply enough
to inform later work.

[Crux](https://github.com/89jobrien/crux) explores carrying a typed result and
its causal execution history as one value. [RSLM](https://github.com/89jobrien/rslm)
explores model-written Rhai scripts that query supplied context with a fresh
scope for each execution. Those are useful technical questions, but polished
implementations would not by themselves prove adoption.

I therefore use different labels:

- **Adopted tools** own a recurring path. Removing one makes work slower, less
  safe, or more annoying.
- **Experiments** reduce uncertainty. They may produce a reusable design, a
  negative result, or evidence that the idea should stop.

Confusing the two creates bad roadmaps. An experiment gets burdened with
production expectations, while an adopted tool accumulates speculative
features instead of protecting the narrow behavior that made it useful.

## Maintenance is part of the calculation

Behavior change is necessary, not sufficient. A tool that saves two minutes a
week but breaks every month has not removed work; it has moved work into a less
predictable form.

The maintenance calculation should include more than bug count:

- How often does the protected moment occur?
- How costly is the old decision, mistake, or manual step?
- How reliably does the tool stay on that path?
- How much compatibility and operational work does it create?

This is why narrow tools often survive. They own one repeated moment, expose a
small contract, and avoid becoming platforms. Their value can be observed in a
missing action: no reconstruction ritual, no repeated command review, no manual
redaction pass.

Invocation is useful evidence. A command run only while developing itself may
still be a prototype. A command called by hooks or another maintained tool is
closer to infrastructure. Neither signal is absolute, but both are more honest
than counting features or commits.

There is also a direct test: stop using the tool for a while. If nothing gets
slower, less safe, or more frustrating, the repository may be working software
without being useful infrastructure. That does not require deleting it. It does
require being honest about what kind of project it is.

Working code starts the evaluation; changed behavior finishes it. Find the
recurring decision, mistake, or manual step. Put the tool directly on that path.
Protect the small interface that makes the change reliable, and let everything
else justify its own maintenance cost.

## Public sources

- [Godmode session triage and Doob integration](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/integrations/mod.rs)
- [Godmode's Doob JSON adapter](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/integrations/doob.rs)
- [Doob's JSON output](https://github.com/89jobrien/doob/blob/main/crates/doob/src/output/json.rs)
- [Coursers pre-tool command handling](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/coursers/src/hook/pre.rs)
- [Obfsck's redaction pipeline](https://github.com/89jobrien/obfsck/blob/main/src/lib.rs)
- [Crux's typed execution trace](https://github.com/89jobrien/crux/blob/main/crates/crux-types/src/crux_value.rs)
- [RSLM's context-query execution](https://github.com/89jobrien/rslm/blob/main/crates/rslm-core/src/rlm.rs)
