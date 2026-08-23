---
title: 70 Projects, No Monorepo
date: 2026-08-23
---

I keep 70+ independent projects under `~/dev`. Rust, Go, Nushell, and a few
prototypes that never left "prototype." Each one has its own git repo, its
own history, and its own remote or no remote at all. No monorepo, no shared
`.git`, no Bazel/Nx-style build graph tying them together.

And yet they do not feel like 70 unrelated things. They feel like one
workspace. Here is how that holds together without the tooling that usually
makes it hold together.

<svg viewBox="0 0 640 220" role="img" aria-label="Monorepo, one shared .git enclosing many project folders, versus independent repos, each project with its own separate .git" style="width:100%;height:auto;font-family:inherit;">
  <text x="130" y="24" text-anchor="middle" fill="#9aa0a6" font-size="13">monorepo</text>
  <rect x="20" y="36" width="220" height="150" rx="8" fill="none" stroke="#7dd3fc" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="130" y="54" text-anchor="middle" fill="#7dd3fc" font-size="11">.git</text>
  <g fill="none" stroke="#e6e6e6" stroke-width="1.2">
    <rect x="36" y="66" width="60" height="34" rx="4"/>
    <rect x="104" y="66" width="60" height="34" rx="4"/>
    <rect x="172" y="66" width="52" height="34" rx="4"/>
    <rect x="36" y="110" width="60" height="34" rx="4"/>
    <rect x="104" y="110" width="60" height="34" rx="4"/>
    <rect x="172" y="110" width="52" height="34" rx="4"/>
    <rect x="36" y="154" width="188" height="24" rx="4"/>
  </g>
  <text x="410" y="24" text-anchor="middle" fill="#9aa0a6" font-size="13">this workspace</text>
  <g fill="none" stroke="#e6e6e6" stroke-width="1.2">
    <rect x="300" y="40" width="70" height="40" rx="4"/>
    <rect x="300" y="94" width="70" height="40" rx="4"/>
    <rect x="300" y="148" width="70" height="40" rx="4"/>
    <rect x="385" y="40" width="70" height="40" rx="4"/>
    <rect x="385" y="94" width="70" height="40" rx="4"/>
    <rect x="385" y="148" width="70" height="40" rx="4"/>
    <rect x="470" y="40" width="70" height="40" rx="4"/>
    <rect x="470" y="94" width="70" height="40" rx="4"/>
    <rect x="470" y="148" width="70" height="40" rx="4"/>
  </g>
  <g fill="none" stroke="#7dd3fc" stroke-width="1" stroke-dasharray="2 2">
    <rect x="296" y="36" width="78" height="48" rx="5"/>
    <rect x="296" y="90" width="78" height="48" rx="5"/>
    <rect x="296" y="144" width="78" height="48" rx="5"/>
    <rect x="381" y="36" width="78" height="48" rx="5"/>
    <rect x="381" y="90" width="78" height="48" rx="5"/>
    <rect x="381" y="144" width="78" height="48" rx="5"/>
    <rect x="466" y="36" width="78" height="48" rx="5"/>
    <rect x="466" y="90" width="78" height="48" rx="5"/>
    <rect x="466" y="144" width="78" height="48" rx="5"/>
  </g>
</svg>

## The index is a file, not a tool

At the root of `~/dev` there is a single `CLAUDE.md` with a table listing
project name and one-line description. That is it. No dependency graph and
no build manifest. Just enough to stop me, or an agent working alongside
me, from guessing what a project is from its name alone. `crux` sounds like
it could be an LLM wrapper. It is actually an agentic Rust DSL and runtime
trace model, explicitly not an LLM layer. `rx` sounds like secrets
management. It is a shell command prefix learning system. The table exists
because names lie and I got tired of re-discovering that the hard way.

Every project also carries its own `CLAUDE.md` with build commands,
architecture notes, and gotchas specific to it. The root file is the map.
The per-project file is the terrain. Nothing links them except a
convention. Check the root table first, then descend.

<svg viewBox="0 0 640 180" role="img" aria-label="Root CLAUDE.md as a map, branching by convention rather than by link, to per-project CLAUDE.md files for crux, rx, minibox, doob, and others" style="width:100%;height:auto;font-family:inherit;">
  <rect x="270" y="16" width="100" height="36" rx="6" fill="none" stroke="#7dd3fc" stroke-width="1.5"/>
  <text x="320" y="39" text-anchor="middle" fill="#7dd3fc" font-size="12">~/dev/CLAUDE.md</text>
  <text x="320" y="66" text-anchor="middle" fill="#9aa0a6" font-size="10">convention, not a link</text>
  <g stroke="#3a3f47" stroke-width="1" stroke-dasharray="3 3">
    <line x1="320" y1="52" x2="90" y2="118"/>
    <line x1="320" y1="52" x2="220" y2="118"/>
    <line x1="320" y1="52" x2="350" y2="118"/>
    <line x1="320" y1="52" x2="480" y2="118"/>
    <line x1="320" y1="52" x2="580" y2="118"/>
  </g>
  <g fill="none" stroke="#e6e6e6" stroke-width="1.2">
    <rect x="40" y="118" width="100" height="34" rx="5"/>
    <rect x="170" y="118" width="100" height="34" rx="5"/>
    <rect x="300" y="118" width="100" height="34" rx="5"/>
    <rect x="430" y="118" width="100" height="34" rx="5"/>
    <rect x="540" y="118" width="70" height="34" rx="5"/>
  </g>
  <g fill="#e6e6e6" font-size="11" text-anchor="middle">
    <text x="90" y="139">crux/</text>
    <text x="220" y="139">rx/</text>
    <text x="350" y="139">minibox/</text>
    <text x="480" y="139">doob/</text>
    <text x="575" y="139">…</text>
  </g>
</svg>

## Conventions travel as prose, not as package versions

A monorepo enforces consistency by construction. One lockfile, one CI
config, one place to bump a shared dependency. Across 70 separate repos I
do not get that for free, so the consistency has to travel some other way.
Mostly it travels as _written convention_, re-applied per repo rather than
inherited.

- Several Rust workspaces gate commits through their own `cargo xtask
pre-commit`, hand-written per project, `minibox` runs fmt check, clippy,
  and a release build behind that gate, and other projects that adopt the
  same shape copy it rather than share a crate.
- `minibox` is designated the canonical reference for CI and workflow
  patterns, meaning `ci.yml`, `nightly.yml`, `release.yml`, and
  `deny.toml`. New projects do not inherit these by import. They get
  copied and adapted, with minibox as the thing you diff against when
  something looks off.
- HANDOFF files live in a `.ctx/` directory in every project that uses the
  session-handoff workflow, and generated filenames always work the repo's
  own dirname in as a component. `HANDOFF.doob.doob.yaml`, not
  `HANDOFF.doob.workspace.yaml`, so a file never lies about which project
  it belongs to once it is out of context.

None of this is enforced by tooling. It is enforced by the convention being
written down somewhere I will actually read it again, and by treating
drift from it as a bug when I notice it.

## The boundary is the point, not the cost

The obvious objection is that this means constant duplication. Some, yes.
Every `xtask` crate is hand-rolled rather than shared. But a lot of what
looks like duplication is actually isolation doing its job. When a project
needs parallel worktrees on distinct branches for genuinely separate lines
of work, they sit side by side as their own directories rather than being
forced into one working tree or a branching scheme that fights the tool.
Independent repos just let them be independent.

Same logic applies to `seaography`, which is a vendored upstream clone
kept read-only on purpose. It is reference material, not a project I own,
and treating it as a separate repo is what keeps that boundary honest
instead of it slowly becoming our fork of seaography by accident.

## Where this breaks down

It is not free. Cross-project changes, the kind a monorepo makes atomic,
have to be done project by project, commit by commit, with no shared CI
run to confirm nothing downstream broke. If I rename a crate, `linuxbox`
to `mbx` was a recent one, every reference outside that repo goes stale
until someone or some agent greps for it. There is no single `git log`
across the workspace. Understanding what happened this week means walking
70 repos, which is exactly the itch that led to building `devloop` and
`herald` as workspace-level observability layers on top of independent git
histories, rather than as an alternative to them.

That trade seems right for this shape of work. Mostly-independent projects
at wildly different maturity levels, production employer code next to
half-finished prototypes, where the cost of true monorepo coupling would
outweigh the convenience. The consistency that matters, build gates,
naming, and where state lives, comes from conventions I keep re-reading
and re-applying, not from a tool that would make skipping them impossible.
