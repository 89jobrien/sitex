---
title: godmode, atelier, and braid are not competing tools
date: 2026-08-23
---

I have three things in my workspace that all get called an agent platform.
`godmode`, `atelier`, and `braid`. Read the descriptions back to back and
they sound like three answers to the same question. They are not. They sit
at different layers, and once you see the layers the naming collision stops
mattering.

## What each one actually is

`godmode` is a Claude Code plugin built around a Rust CLI and a task graph.
The binary owns every stateful operation. Skills are thin wrappers that
call `godmode` and act on the output. Tasks persist in
`.ctx/godmode/tasks.yaml` across sessions through causal `depends_on`
chains, and a pre-commit hook can block a commit outright if a task is
still marked running. It ships its own large skill and agent library,
covering everything from brainstorming to CI fixes to session tracing.

`atelier` is also a Claude Code plugin, and also bundles skills and agents,
but it is deliberately narrow. Its own docs say the agent logic "currently
delegates to devkit and likely always will." `devkit` is a separate Go
tool that runs the actual multi-role review council, using Anthropic and
OpenAI models for different roles. `atelier` wraps that, plus git safety
checks, plus a session-start dependency on `sanctum` for 1Password and
direnv secret resolution. Where `godmode` owns its state and logic,
`atelier` composes other tools and adds a thin layer of Claude Code
skills on top.

`braid` is not a Claude Code plugin at all. It is a personal agent
runtime, built as a hexagonal multi-crate Rust workspace with its own
provider ports, tool execution, redaction pipeline, an MCP server, and a
Ratatui inspector for watching a session live. It is the kind of thing
`godmode` and `atelier` help me build, not a competitor to either of them.

## Why the split holds together

<svg viewBox="0 0 640 200" role="img" aria-label="Two layers. Top layer, how I work with Claude Code, contains godmode and atelier. Bottom layer, what I am building, contains braid." style="width:100%;height:auto;font-family:inherit;">
  <rect x="20" y="20" width="600" height="70" rx="8" fill="none" stroke="#7dd3fc" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="40" y="42" fill="#9aa0a6" font-size="12">how I work with Claude Code</text>
  <g fill="none" stroke="#e6e6e6" stroke-width="1.2">
    <rect x="120" y="50" width="160" height="30" rx="5"/>
    <rect x="360" y="50" width="160" height="30" rx="5"/>
  </g>
  <text x="200" y="70" text-anchor="middle" fill="#e6e6e6" font-size="12">godmode</text>
  <text x="440" y="70" text-anchor="middle" fill="#e6e6e6" font-size="12">atelier</text>
  <rect x="20" y="120" width="600" height="60" rx="8" fill="none" stroke="#7dd3fc" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="40" y="142" fill="#9aa0a6" font-size="12">what I am building</text>
  <g fill="none" stroke="#e6e6e6" stroke-width="1.2">
    <rect x="240" y="150" width="160" height="24" rx="5"/>
  </g>
  <text x="320" y="167" text-anchor="middle" fill="#e6e6e6" font-size="12">braid</text>
</svg>

`godmode` and `atelier` both sit in the top layer. They are both about how
I work inside Claude Code sessions, and neither one produces a thing I ship
to anyone else. `braid` sits in the bottom layer, the actual product, a
runtime with its own crates and its own users eventually. Comparing
`braid` against `godmode` or `atelier` is comparing the workshop to the
thing built in it.

That distinction is not incidental. It shows up in how each one is put
together. `braid` is a hexagonal workspace with ports for `Provider`,
`ToolExecutor`, `EventSink`, and more, because a runtime has to stay
generic over whichever model or tool backend a caller wants. `godmode` and
`atelier` have no such requirement. Neither one is a library other code
depends on. They exist to be invoked by me, inside a Claude Code session,
so their architecture optimizes for something else entirely. `godmode`
owns persistent state across sessions in a single Rust binary, while
`atelier` stays thin and composes tools that already exist.

## Why two plugins at the same layer are not redundant

The harder question is why `godmode` and `atelier` both exist, since they
sit in the same layer and both bundle Claude Code skills. The answer is in
what each one refuses to do.

`godmode` replaced an earlier skill set built on `superpowers`, the
original agentic skills framework for Claude Code, because the methodology
was worth keeping but the runtime was not. Rewriting it as a Rust-backed
CLI with a real task graph meant task state could survive a session
restart, a pre-commit hook could check it, and dispatch to parallel agents
could read structured JSON instead of parsing prose. `godmode` is
self-contained on purpose. It does not delegate its core logic anywhere,
because the whole point was to stop depending on a runtime that could not
persist state the way I wanted.

`atelier` made the opposite bet. Rather than reimplement a review council
or a diagnostic loop, it wraps `devkit`, a tool that already runs
parallel-role AI review and already knows how to call multiple model
providers for different roles. `atelier` adds Claude Code skill triggers,
git safety, and session-start secret handling through `sanctum`, then gets
out of the way. It is thin because thin was the design goal. Adding a
task graph or a bespoke agent runtime to `atelier` would just be rebuilding
`godmode` badly.

So the two plugins are not redundant. They encode two different answers to
the same design question, own your logic or compose someone else's, and I
reach for whichever answer fits the moment. `godmode` when I want state
that survives across sessions and a task graph that can gate a commit.
`atelier` when the job is already solved by another tool and I just need
a Claude Code trigger wired to it.

## The only thing they share

The name. "Agent platform" describes all three because it is a description
loose enough to describe almost any tool with more than one moving LLM
call in it. Once you ask what layer a tool operates at, and whether it
owns its logic or composes someone else's, the three stop looking like
competitors and start looking like exactly what they are. A runtime I am
building, and two different answers to how I want to work while building it.
