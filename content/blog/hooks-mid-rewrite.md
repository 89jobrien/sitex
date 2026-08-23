---
title: The guardrails watching this session are not the newest code
date: 2026-08-23
---

Every Bash command I run through Claude Code passes through a single
compiled binary first. It decides whether the command runs as written,
gets rewritten, or gets blocked outright. Right now, while I am writing
this sentence, that binary is running code from months ago. A newer,
architecturally cleaner replacement for the exact same logic finished
landing three days before this post, and it is sitting there, fully built
and fully tested, doing nothing.

## What is actually live

`~/.claude/settings.json` wires four hook events to one command each.

```
PreToolUse:  crs hook pre-tool-use
PostToolUse: crs hook post-tool-use
Stop:        crs hook stop
SessionEnd:  crs hook session-end
```

`crs` and `coursers` come from the same crate but are two separate thin
binaries that both call one shared library function.

```rust
// crates/coursers/src/bin/crs.rs
fn main() {
    let cli = Cli::parse();
    coursers::run(cli);
}
```

For a Bash `PreToolUse` event, that shared path calls
`crate::hook::pre::run_with`, described in its own comment as "the same
logic as the standalone `crs pre`." That function reads a rules file and
checks the command against each rule in order, letting it through,
rewriting it, or denying it with a message.

```
~/.config/coursers/course-correct-rules.json
  tool-avoidance nudges: grep -> Grep, cat -> Read, cd -> forbidden

~/.config/crs/plugins.d/godmode.toml
  destructive-action hard stops: force-push, DROP TABLE, op item edit
```

Different file, different stakes, same dispatch path.

This is what governs every command in this session. It has governed every
command in every session since before this rewrite existed.

## The live path was itself silently broken, until three days before the rewrite

Before trusting any of that, I wanted proof it actually runs. Piping a
disallowed command straight into the installed binary confirms it.

```
$ echo '{"tool_name":"Bash","tool_input":{"command":"grep foo bar.txt"}}' \
    | crs hook pre-tool-use

exit 2
{"hookSpecificOutput":{"permissionDecision":"deny",
  "permissionDecisionReason":"Use the Grep tool instead. ...
  Blocked command: `grep foo bar.txt`"}}
```

It denies. Good. But that same rule was not always reachable through this
exact path, and the commit that fixed it says so plainly.

> settings.json wires PreToolUse to the consolidated entry point, but it
> only ran the TOML pipeline. Every course-correct rule (no-grep,
> no-bash-use-nu, ...) was dead through the real hook path.

That is the commit message for `f3c380b`, landed August 17, the same day
`hc-a` starts the port-trait rewrite. The rules file was correct, the
config pointed at it, and none of it fired, because an earlier
consolidation had routed Claude's hooks through a single front controller
originally built for something else.

```
May 15   settings.json wires crs rewrite and crs filter directly, per event
Jun 28   crs and coursers merge into one crate
Jul 1    a single front controller is built to route Codex hooks
  ?      Claude's settings.json is switched to the same front controller,
         course-correct rules go silently unreachable
Aug 17   the gap is found and closed, same day the HookChain rewrite starts
```

The exact date of the silent break is not recoverable. `~/.claude/settings.json`
is not version-controlled, so there is no diff to point at, only the
commit that noticed and fixed it, closing a tracked todo. What is
recoverable is that a guardrail can look fully wired, file present, config
pointing at it, and still not run, for an unknown stretch of time, until
someone tests the actual path instead of reading the config.

## What is built but not running

<svg viewBox="0 0 640 210" role="img" aria-label="Timeline of the HookChain rewrite. April, first hook chain wiring. May, crs rewrite and crs filter added. Three month gap. August 17 to 20, four staged commits hc-a through hc-d build a port trait based replacement. It lands gated behind an environment variable, not yet the default." style="width:100%;height:auto;font-family:inherit;">
  <line x1="30" y1="100" x2="610" y2="100" stroke="#3a3f47" stroke-width="1.5"/>
  <g fill="#7dd3fc">
    <circle cx="60" cy="100" r="4"/>
    <circle cx="140" cy="100" r="4"/>
    <circle cx="420" cy="100" r="4"/>
    <circle cx="470" cy="100" r="4"/>
    <circle cx="520" cy="100" r="4"/>
    <circle cx="570" cy="100" r="4"/>
  </g>
  <g fill="#e6e6e6" font-size="11" text-anchor="middle">
    <text x="60" y="80">Apr 6</text>
    <text x="140" y="80">May 15</text>
    <text x="420" y="80">Aug 17</text>
    <text x="470" y="80">Aug 18</text>
    <text x="520" y="80">Aug 20</text>
    <text x="570" y="80">Aug 20</text>
  </g>
  <g fill="#9aa0a6" font-size="10" text-anchor="middle">
    <text x="60" y="125">docs</text>
    <text x="140" y="125">rewrite/filter</text>
    <text x="420" y="125">hc-a traits</text>
    <text x="470" y="125">hc-b adapters</text>
    <text x="520" y="125">hc-c config</text>
    <text x="570" y="125">hc-d wired</text>
  </g>
  <text x="300" y="160" text-anchor="middle" fill="#9aa0a6" font-size="11">three month gap between May and August</text>
  <text x="570" y="145" text-anchor="middle" fill="#7dd3fc" font-size="10">flag off by default</text>
</svg>

The dormant code lives in `crates/core/src/hook/chain.rs` and
`crates/coursers/src/hook/chain_runner.rs`. Its own doc comment draws the
pipeline it replaces.

```text
PreToolUse  ─►  [PreHook₁, PreHook₂, …]  ─►  outcome (Allow | Deny | Rewrite)
PostToolUse ─►  [PostHook₁, PostHook₂, …] ─►  outcome (Allow | Filter)
            ─►  [Observer₁, Observer₂, …] ─►  side-effects only (no blocking)
```

It is the same rule-block, rewrite, and filter logic that already runs,
now expressed as composable ports instead of one function that does
everything inline. It landed in four commits over four days, each one
scoped to a single step and explicit about what it left out.

| Commit | Date              | Scope                                                                                     | What it explicitly excludes                                                     |
| ------ | ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `hc-a` | Aug 17            | Four traits, 11 unit tests                                                                | "no concrete implementations, no wiring"                                        |
| `hc-b` | Aug 18            | Adapter structs wrapping existing rule/rewrite/filter logic                               | "all algorithms remain in their existing modules, concrete.rs is adapters only" |
| `hc-c` | Aug 20, afternoon | Unified config loading for rules, failure state, filters/rewrites                         | wiring into the binaries                                                        |
| `hc-d` | Aug 20, evening   | Wires the chain into `coursers pre`/`coursers post`, gated behind `COURSERS_HOOK_CHAIN=1` | "the legacy path is unchanged, zero risk to the default live behavior"          |

Three of the four commits, `hc-a` through `hc-c`, carry a `Claude-Session`
link. The system that decides what Claude Code is allowed to run was
mostly rebuilt, port by port, by Claude Code.

## Why the flag is still off

The module doc comment on `chain_runner.rs` does not hedge about this.

> This path is not yet enabled in production. A follow-up commit will flip
> the switch after validation that outcomes are equivalent.

Then it lists what is not yet equivalent.

```text
signal exit codes (130, 137, 143)
  legacy: excluded from failure-learning
  chain:  not excluded yet, inherits observer default

deny-message enrichment
  legacy: directory listing attached when a find-style command is blocked
  chain:  bare rule message, no enrichment

fine-tuning capture store
  legacy: denied and rewritten commands recorded
  chain:  not wired in at all
```

None of these are bugs exactly. They are places where the new
architecture is correct in shape but has not yet been proven to produce
the same outcomes as the thing it replaces, and the three-day-old code
says so in plain language instead of shipping quietly and finding out
later.

## The point

I did not find a flipped switch when I went looking for one. I found a
guardrail that had already gone silently dead once, caught only when
someone tested the real path instead of reading the config, and a
finished migration standing next to the fix, not yet allowed to replace
it, with the exact reasons why written into the code that would do the
replacing. That is a more honest state for a rewrite to be in than most
rewrites reach. It would have been easy to merge `hc-d` and call the
migration done. Instead the default stayed unchanged, the gaps got named
instead of hidden, and the thing actually intercepting my commands right
now is still the version that was fixed three days ago, not the version
that replaces it.
