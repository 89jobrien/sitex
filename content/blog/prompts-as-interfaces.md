---
title: Treat Agent Prompts Like Interfaces
date: 2026-09-11
description: "Why operational prompts need stable intent, concrete examples, and tests even though their implementation is prose."
---

I keep agent instructions in Markdown, but I depend on them like code.

A small change to `CLAUDE.md` can change which tool an agent picks, whether it
asks before a risky action, or whether another program can use its output. The
file is prose. The effect is an interface change.

That means I review prompts for behavior, not wording.

## The words aren't the contract

An API can promise named inputs and predictable outputs. A prompt can't make
the same promise. A model interprets instructions instead of executing them,
and two good responses may use completely different words.

The useful contract sits above the phrasing. Given an unrelated edit in
`README.md`, an agent changing `config.toml` must leave the first file alone.
Checking whether the final response says "I preserved your changes" isn't
enough. The agent can say the right thing after doing the wrong thing.

The tests should target the decision. Coursers does that when two rules could
match the same command:

```rust
#[test]
fn pipeline_segment_match_takes_priority_over_fallback() {
    let rules = vec![
        make_rule("no-grep", r"\bgrep\b"),
        make_rule("no-bash-use-nu", r"(;|&&|\|\|)"),
    ];
    let (id, _) = check_pipeline("grep foo . && ls", &rules).unwrap();
    assert_eq!(id, "no-grep");
}
```

That test comes from Coursers' rule engine. It checks which policy owns the
command, not what an agent says about it afterward. The `unwrap()` is confined
to test code, which matches the Rust conventions I use across these projects.

The same rule applies to debugging. I don't need an agent to recite a method. I
need it to inspect the failure before changing implementation code. I don't
need it to announce that tests passed. I need a fresh test run that proves it.

Model changes don't change the contract. Different wording can still comply,
and reassuring wording can still hide a violation. I test the failures that
matter, not every sentence.

## Give recurring behavior a name

Skills let me name recurring behavior instead of growing one enormous
instruction file. `godmode:systematic-debugging` owns the process for failures.
`godmode:verification-before-completion` owns what must happen before an agent
says the work is done.

It is the prompt equivalent of extracting a function. The prose can change,
but callers still have one named capability to depend on and one place to
review its behavior.

## Put each rule at the narrowest useful scope

I split instructions by ownership. `$HOME/.claude/CLAUDE.md` holds rules that
follow me between projects. A repository `CLAUDE.md` holds its commands and
architecture. Skills own workflows triggered by a specific situation. Hooks
own consequences the model must not bypass.

Each layer solves a different problem. Project commands don't belong in the
global file. Global git rules shouldn't be copied into every repository.
Detailed debugging workflows shouldn't bury the few rules that always matter.

The narrowest stable owner defines the behavior. Broader layers point to it.

## Some rules shouldn't depend on the prompt

Prompts are good at intent and judgment. They are a bad place for a hard safety
guarantee.

Coursers handles that boundary for shell commands. Its `crs` `PreToolUse` hook
receives the command before the shell runs, then allows, rewrites, or denies
it. Godmode applies the same idea to commit readiness:

```rust
#[derive(Debug)]
pub enum PreCommitResult {
    Pass,
    Block(String),
}

pub fn run(root: &Path) -> PreCommitResult {
    if let Err(reason) = check_task_state(root) {
        return PreCommitResult::Block(reason);
    }

    if let Err(e) = quality_gate::run(root, None) {
        return PreCommitResult::Block(e.to_string());
    }

    PreCommitResult::Pass
}
```

This is the production path, shortened only by removing comments. It checks
task state first, then runs the Cargo quality gate. The result is an enum rather
than a boolean, so a blocked commit keeps its reason. The model doesn't get to
declare the commit ready and step around that decision.

That is where the interface comparison stops being enough. I keep intent and
judgment in prompts. I put consequences that matter on the live execution path.

I now ask three questions when I edit operational prompts:

1. What behavior is something else relying on?
2. Which example proves that behavior without depending on exact wording?
3. Which failure is important enough to prevent outside the model context?

Once those answers are clear, prompt editing stops feeling like spell tuning.
It becomes ordinary interface maintenance.

## Sources

- [Godmode systematic-debugging skill](https://github.com/89jobrien/godmode/blob/main/skills/systematic-debugging/SKILL.md)
- [Godmode verification skill](https://github.com/89jobrien/godmode/blob/main/skills/verification-before-completion/SKILL.md)
- [Coursers front-controller path](https://github.com/89jobrien/coursers/blob/main/crates/coursers/src/crs_commands.rs)
- [Coursers pipeline actions](https://github.com/89jobrien/coursers/blob/main/crates/core/src/hook/pipeline.rs)
- [Coursers rule-selection test](https://github.com/89jobrien/coursers/blob/main/crates/core/src/rules.rs)
- [Godmode pre-commit enforcement](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/hooks/pre_commit.rs)
- **This site's repository instructions:** `CLAUDE.md` in the local Sitex checkout; the repository is private.
- **Global instruction layer:** local `$HOME/.claude/CLAUDE.md`; it is intentionally not published with the site.
