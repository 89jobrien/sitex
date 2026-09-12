---
title: What a Task Graph Can Enforce That a Prompt Cannot
date: 2026-09-11
description: "Why I moved the important parts of an agent workflow out of instructions and into godmode's locally persisted task state."
taxonomies:
  tags: [agent-harness, automation, testing, work-tracking]
extra:
  related: [project:godmode, post:prompts-as-interfaces]
---

I can put **run the tests before committing** in an agent prompt. I can put it
in `CLAUDE.md`, repeat it in a skill, and write it in capital letters. It is
still a request made to a model in a conversation. Once that conversation
ends, the request has no memory and no authority.

This is the gap that led me to build a task graph into `godmode`.

## A prompt describes the workflow

Prompts are good at intent. They can tell an agent what "done" means, explain
why tests matter, and ask it to work in small steps. Most of my agent tooling
starts there because prose is easy to change and models are good at following
it.

The trouble starts when the workflow crosses a session boundary. A new agent
does not know that the previous one wrote a failing test but never made it
pass. It may see a plausible diff, run a quick check, and commit the work. The
instruction survived in a file; the state of the work did not.

There is also no useful answer to "what is blocked?" in a prompt. The prompt
can define blocking, but it cannot say which task is blocked right now or what
must finish before it can resume.

## `godmode` records the workflow

`godmode` stores tasks in `.ctx/godmode/tasks.yaml`. Each task has a status and
can depend on another task. A test task can come before implementation, and
verification can depend on both. When a session stops halfway through, the
next session in the same checkout reads the same graph instead of
reconstructing progress from chat history and git changes.

That makes simple questions answerable:

- `godmode task next` shows pending tasks whose recorded dependencies are done.
- `godmode handon` shows running and blocked work at the start of a session.
- `godmode handoff` reports and records unfinished state when a session ends.

More importantly, the task state can reach outside the conversation.
Godmode's Rust pre-commit action and Claude command gate can block unresolved
tasks before a commit. The older installed Git-hook path currently relies on
`handoff` returning an error even though `handoff` only warns, so that path
does not enforce the same rule yet. The distinction is important: an
enforcement mechanism is only real on paths that actually invoke it.

The file behind that behavior is intentionally ordinary YAML:

```yaml
tasks:
  - id: regression-test
    title: Reproduce the session-resume bug
    status: done
    depends_on: []

  - id: implementation
    title: Preserve task state across restart
    status: running
    depends_on: [regression-test]

  - id: verification
    title: Run the full workspace checks
    status: pending
    depends_on: [implementation]
```

There is no model interpretation required to answer whether verification is
ready. It is not. The implementation task is still running, so the dependency
chain has a concrete state that a CLI, hook, or future session can read.

## The failure mode is usually mundane

The problems this prevents are rarely dramatic. An agent reaches the end of
its context window after fixing most of a bug. I open a new session later. The
working tree contains code and a test, but neither tells me whether the test
was deliberately left red, whether a platform-specific check remains, or
whether the previous agent simply stopped.

Without durable state, the new session has to infer intent from artifacts. It
may infer correctly. It may also decide the diff looks complete and move on.
The task graph replaces that guess with a small amount of explicit bookkeeping.

This is also useful when work branches. A documentation task and a test task
can proceed independently, while release verification waits for both. The
graph does not make the work parallel or prove semantic safety. It records
which work the declared dependencies permit to run independently.
Coordinating separate worktrees still needs an orchestration step because each
checkout keeps its own gitignored task file.

## The graph should stay small

Not every sentence in a prompt belongs in durable state. Tone, preferred code
style, and explanations of the repository are still better as prose. Turning
all of that into a state machine would make the workflow harder to use without
making it safer.

I use a simpler boundary: if losing a fact at the end of the session could
make the next action wrong, it probably belongs in state. "Prefer concise
output" can remain an instruction. "The regression test is still failing"
cannot.

Prompts remain the best place to explain how I want an agent to work.
`godmode` exists for the smaller set of rules where explanation is not enough.
The prompt asks for discipline; the task graph remembers whether the work
earned it.

There is a cost. Somebody has to keep the state honest. A gate that reads a
task left marked as running can block a legitimate commit, and a task marked
done too early can create false confidence. Godmode does not solve that by
inventing more states. It keeps the graph visible and makes transitions
explicit. A task can record a commit SHA, but completion does not validate or
prove that commit.

That trade is worth it for work that crosses sessions or agents. I do not need
the graph to understand every thought. I need it to preserve the few facts
that must still be true when the conversation that produced them is gone.

## Sources

- [Godmode task model](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/model.rs)
- [Dependency readiness and graph persistence](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/graph.rs)
- [Session handon and handoff behavior](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/session.rs)
- [HANDOFF state recording](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/integrations/handoff_yaml.rs)
- [Rust pre-commit state checks](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/hooks/pre_commit.rs)
- [Installed Git-hook path](https://github.com/89jobrien/godmode/blob/main/hooks/pre-commit.nu)
- [Gitignored local task state](https://github.com/89jobrien/godmode/blob/main/.gitignore)
