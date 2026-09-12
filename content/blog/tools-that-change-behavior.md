---
title: A Tool Starts Paying Rent When It Changes Your Behavior
date: 2026-09-11
description: "How I decide whether a developer tool is worth maintaining by looking for changed habits instead of more features."
taxonomies:
  tags: [automation, developer-experience, work-tracking]
extra:
  related: [project:godmode, project:coursers, project:obfsck]
---

I have built plenty of tools that worked and still did not matter.

They compiled. They had documentation. Some even solved the problem in their
README. Then I went back to the old workflow because using the tool required
more attention than the problem it was meant to remove.

The tools I keep are the ones that change what I do without requiring me to
remember that they exist.

## Look for a changed habit

Godmode pays rent when I start a new agent session and read the task graph
instead of reconstructing unfinished work from memory. Coursers pays rent when
`crs` catches a bad command before I have to review it. Doob pays rent when a
todo created in one session appears in the next `godmode handon` triage without
a second tracking ritual, provided Doob integration is enabled and Godmode's
detected project matches the todo.

Obfsck changes a different behavior. I can put log data on an outbound path
through `redact` rather than manually hunting for credentials and personal
information before sharing it. The valuable part is not that Obfsck has
several redaction modes. It is that "sanitize this first" becomes part of the
path instead of a thing I hope to remember.

Those are stronger signals than feature count. Each tool replaced a recurring
decision or prevented a familiar failure.

The change can be small and still matter. `mcpipe` lets me inspect a supplied
MCP server or OpenAPI specification through the same list, search, and invoke
workflow. Taskit makes a configured protocol surface's normalized-content
change require a lockfile update when the default drift gate runs. Neither tool
needs to transform the whole day to justify its place; it needs to improve a
moment that actually recurs.

This is why I pay attention to what invokes a tool. A command I run only while
developing the command may not have found a real workflow. A command called by
hooks, handoff scripts, or another maintained tool has evidence of demand
beyond its own README.

## Usage can reveal the wrong product

Sometimes the code I thought was central is not the part that changes my
work. A dashboard may be polished while the plain JSON command becomes the
thing other tools depend on. A broad automation layer may sit unused while one
small pre-commit check quietly prevents mistakes every day.

That is useful feedback, even when it is uncomfortable. It tells me where to
simplify and what not to build next. The unused feature is not waiting for
better marketing when I am its intended user. It may simply be outside the
real workflow.

I now ask a tool a few plain questions. What do I do differently because it
exists? What mistake no longer reaches me? What manual step disappeared? If I
removed the tool, which old habit would return?

If the answers are vague, adding another feature rarely helps.

There is a harsher version of the test: stop using it for a while. If nothing
gets slower, less safe, or more annoying, the tool may not be carrying its
maintenance cost. I do not need to delete the repository immediately, but I
should stop treating activity on it as automatic progress.

Some prototypes are still worth keeping as experiments. Crux explores a typed
way to retain agent execution history. RSLM explores having a model write Rhai
scripts that query supplied context through registered functions rather than
placing the raw context directly in model messages. An experiment can answer a
design question before it changes a daily habit. The mistake is judging that
experiment by production-tool standards or pretending it has graduated
because the code is polished.

## Maintenance is part of the rent

A tool can change behavior and still cost too much to keep. It may depend on a
fragile service, need constant configuration repair, or create a new workflow
that only I understand. The benefit has to exceed that maintenance tax.

This is why rough, narrow tools often survive in my workspace while more
ambitious prototypes do not. The narrow tool owns one repeated moment and
makes it better. The prototype owns an idea.

Working software is the start of the evaluation, not the end. A tool becomes
part of the system only when behavior bends around it and stays better after
the novelty wears off.

## Build around the retained behavior

Once I know why a tool survives, roadmap decisions get easier. Doob's value is
not every possible todo feature; it is durable, context-aware work that both
people and agents can query. Coursers earns its place on the live command path,
so rule correctness, configuration validation, and end-to-end testing of the
installed hook command matter more than another reporting screen. Obfsck
belongs at outbound boundaries, so integrations that put it in those paths
matter more than an isolated demo of another pattern.

The retained behavior becomes a constraint. A redesign that makes the code
cleaner but removes the quick path people actually use is not an improvement.
A new feature that weakens the reliable core may cost more than it adds.

This is the closest thing I have to a product strategy for personal developer
tools: identify the behavior that changed, protect the path that caused it,
and be willing to let the rest stay small.

## Sources

- [Godmode session triage and Doob integration](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/integrations/mod.rs)
- [Coursers live front-controller path](https://github.com/89jobrien/coursers/blob/main/crates/coursers/src/crs_commands.rs)
- [Obfsck redaction pipeline](https://github.com/89jobrien/obfsck/blob/main/src/lib.rs)
- [`mcpipe` source selection and command flow](https://github.com/89jobrien/mcpipe/blob/main/src/main.rs)
- [RSLM context-query execution](https://github.com/89jobrien/rslm/blob/main/crates/rslm-core/src/rlm.rs)
- [Crux typed execution trace](https://github.com/89jobrien/crux/blob/main/crates/crux-types/src/crux_value.rs)
- [Taskit drift comparison and lock updates](https://github.com/89jobrien/taskit/blob/main/crates/taskit-engine/src/protocol/drift.rs)
- [Doob Git context](https://github.com/89jobrien/doob/blob/main/crates/doob-core/src/context/git.rs)
- [Doob JSON output](https://github.com/89jobrien/doob/blob/main/crates/doob/src/output/json.rs)
- [Doob query path](https://github.com/89jobrien/doob/blob/main/crates/doob/src/commands/list.rs)
