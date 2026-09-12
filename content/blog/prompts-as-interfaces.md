---
title: Treat Agent Prompts Like Interfaces
date: 2026-09-11
description: "Why operational prompts need stable intent, concrete examples, and tests even though their implementation is prose."
taxonomies:
  tags: [agent-harness, automation, integration, security]
extra:
  related: [project:godmode, project:coursers, post:task-graph-vs-prompt]
---

I edit agent instructions in Markdown, but I depend on them like code.

A small wording change in `CLAUDE.md` can change which tool an agent chooses,
whether it asks before a risky action, what it puts in a final response, or
whether a downstream script can use the result. The file looks like prose.
The effect looks like an interface change.

## The exact words are not the contract

Traditional APIs expose named inputs and predictable outputs. A prompt cannot
promise exact behavior in the same way because a model interprets it rather
than executing it. Testing whether the response contains a particular phrase
usually measures wording, not behavior.

The useful contract sits one level higher. Given a dirty worktree, the agent
must not erase unrelated changes. Given a request to inspect a file, it should
use the read tool rather than printing it through a shell. Given a failed test,
it should diagnose the cause before claiming the work is done.

Those outcomes can survive a rewrite of the prompt. They can also become
examples in a small conformance set: representative inputs, expected tool
choices, and forbidden side effects.

For example, I do not need a test that expects an agent to say "I preserved
your changes." I need a scenario with an unrelated dirty file and an assertion
that the file is still present after the requested edit. I do not need the
agent to recite the debugging method. I need it to inspect evidence before it
changes implementation code.

That difference keeps the test attached to intent instead of model style. A
new model may explain itself differently and still honor the interface. A
familiar model may produce reassuring prose while violating it.

Conformance remains imperfect because agent behavior is probabilistic and tool
environments change. I want representative cases to catch broad regressions:
unsafe mutation, wrong tool selection, malformed structured output, or a
completion claim without fresh verification. I do not want them to freeze
every sentence the agent produces.

## Skills give the interface a name

I use skills to pull recurring behavior out of one enormous instruction file.
`godmode:systematic-debugging` names the workflow for failures.
`godmode:verification-before-completion` names the evidence required before a
completion claim. A skill gives the trigger and goal a named place that can
remain stable while the detailed guidance improves.

That is similar to extracting a function from repeated inline code. The prose
still matters, but callers can depend on a named capability instead of copying
the entire implementation into every prompt.

Version control then becomes useful in the ordinary way. A review can ask
whether a skill changed its public behavior, whether examples still cover the
important cases, and whether another instruction contradicts it.

## Layer instructions by scope

My global `CLAUDE.md` contains rules that should follow me between projects:
git safety, verification discipline, and environment assumptions. A
repository `CLAUDE.md` describes local commands and architecture. Skills name
workflows that should trigger only in a particular situation.

Those layers solve different problems. Putting a Minibox build command in the
global file would leak project detail into every session. Repeating the same
git-safety rule in every repository would create copies that drift. Expanding
the global file with every debugging technique would make the important rules
harder to find.

I treat the layers like interface ownership. The narrowest stable owner should
define the behavior, and broader layers should point to it rather than restate
it. This does not eliminate contradictions, but it makes them easier to locate
when an agent receives two plausible instructions.

## Some rules do not belong in the prompt

Coursers is the other half of this design. Its configured `crs` `PreToolUse`
hook sees a proposed Bash command before execution. It can pass an unmatched
command through, rewrite it, or deny it. If an agent tries to use a disallowed
command, the hook does not need the model to remember the instruction.

That is the limit of treating prompts like interfaces: interfaces still need
callers and enforcement. Prose is good for intent, judgment, and adaptation.
It is a poor place for a hard safety guarantee.

I now review operational prompts by asking three questions. What behavior are
callers relying on? Which examples prove that behavior without depending on
exact phrasing? Which consequences are important enough to enforce somewhere
other than the model context?

Once those questions are explicit, prompt editing feels less like tuning a
spell and more like maintaining a real interface.

## Sources

- [Godmode systematic-debugging skill](https://github.com/89jobrien/godmode/blob/main/skills/systematic-debugging/SKILL.md)
- [Godmode verification skill](https://github.com/89jobrien/godmode/blob/main/skills/verification-before-completion/SKILL.md)
- [Coursers front-controller path](https://github.com/89jobrien/coursers/blob/main/crates/coursers/src/crs_commands.rs)
- [Coursers pipeline actions](https://github.com/89jobrien/coursers/blob/main/crates/core/src/hook/pipeline.rs)
- [This site's repository instructions](https://github.com/89jobrien/sitex/blob/main/CLAUDE.md)
- **Global instruction layer:** local `$HOME/.claude/CLAUDE.md`; it is intentionally not published with the site.
