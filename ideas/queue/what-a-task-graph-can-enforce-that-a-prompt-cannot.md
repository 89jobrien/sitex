---
title: "What a Task Graph Can Enforce That a Prompt Cannot"
date: 2026-09-09
status: seed
priority: P1
theme: agent-workflows
effort: medium
---

## Hook

A prompt can tell an agent to finish its tests before committing, but the instruction disappears with the conversation. A persisted task graph can make unfinished work visible to the next session and can block the commit that would otherwise hide it.

## Thesis

Reliable agent workflows move critical process rules out of prose and into durable state with enforceable transitions.

## Reader Value

### Engineers

A concrete model for deciding which agent instructions belong in prompts and which need persisted state, dependencies, and gates.

### Decision-makers

A way to evaluate agent tooling by the controls it can prove rather than the behavior it merely requests.

## Evidence

- godmode's `.ctx/godmode/tasks.yaml` causal `depends_on` chains.
- The pre-commit hook that refuses commits while a task remains running.
- A session restart showing that task state survives while conversation context does not.
- A trace or commit example where the gate changes the outcome.

## Mini Outline

1. Open with an instruction that sounds strict but has no durable enforcement.
2. Show how a causal task graph represents the same rule as state.
3. Follow the state through a session restart and a blocked commit.
4. Define a practical boundary between prompt guidance and workflow infrastructure.

## Readiness

**Known gaps:** A compact real trace is needed to show the same task before and after a session boundary.

**Next action:** Capture one blocked commit and the matching task-state transition from godmode.
