---
title: One Workspace Without a Monorepo
date: 2026-08-23
description: "How discovery and automation coordinate more than a hundred repositories without taking ownership away from each project."
---

There is no workspace-wide `.git`. That is the point.

I keep more than a hundred projects under one development root. Some are active products, some are
libraries, and some are experiments. They use different languages and move at different speeds.
Each repository owns its history, branches, CI, versioning, and releases.

Yet the collection behaves like a workspace because coordination sits one layer above Git.
Discovery answers what exists. Cross-repository status shows what needs attention. Dependency
inspection and command automation make coordinated changes manageable. None of those systems
turns the repositories into one transaction or one release train.

That separation is the thesis: independent repositories can behave like one workspace when shared
discovery and automation coordinate them, while Git history and releases remain locally owned.

## The operating scale

At this scale, memory is not an inventory system. Repository names are easy to forget, active work
is spread across branches, and a library change may affect consumers elsewhere. Running the same
command by hand in dozens of directories is slow and, more importantly, produces no reliable
record of which repository passed or failed.

The tools in this system have deliberately narrow jobs:

- [Rx](https://github.com/89jobrien/rx) discovers repositories, gathers Git status, inspects Cargo
  dependencies, and runs commands across selected repositories.
- [Godmode](https://github.com/89jobrien/godmode) keeps task graphs and agent work scoped to the
  current repository.
- [Taskit](https://github.com/89jobrien/taskit) determines which crates are affected inside one
  Rust repository and runs that repository's workflow.

Rx observes across boundaries. Godmode and Taskit operate within a boundary. Git remains the
authority underneath all three.

The design follows three questions a reader with many repositories eventually asks:

1. What repositories do I have?
2. What state are they in right now?
3. How do I change several of them without pretending the change is atomic?

## Problem one: inventory

A folder full of repositories is not yet a workspace. The first requirement is a trustworthy list
of what is there.

Rx can read explicit metadata from a registry, but it can also discover repositories by walking a
root directory. Discovery recognizes both a `.git` directory and a `.git` file, so ordinary clones
and Git worktrees appear in the same inventory. Ignored directories are excluded, and each result
becomes repository metadata that later operations can consume.

This matters because the inventory should not depend on every project joining a central build
configuration. A new repository becomes visible because it is a repository, not because someone
remembered to add it to a monorepo manifest.

Optional metadata adds meaning without taking ownership. A repository can be labeled with a role,
language, default branch, or tags. That supports questions such as “show me active Rust libraries”
without moving any source tree or changing any Git remote.

The central map should stay shallow. It needs enough information to identify and group projects,
but build commands, architecture notes, and release instructions belong with the repository they
describe. The map tells automation where to look; the project remains the source of truth.

This approach has an important failure mode: discovery can tell you that a repository exists, but
not whether it is maintained, correctly configured, or safe to modify. Inventory is the beginning
of coordination, not proof of health.

## Problem two: cross-repository status

Once the inventory exists, the next question is operational: which repositories are dirty, on an
unexpected branch, ahead of their remote, behind it, or unable to answer at all?

A monorepo can answer much of that with one Git invocation because it has one working tree. A
multi-repository workspace needs to run the same probe separately in every repository and preserve
the result separately.

Rx does that through a small Git-status interface. Its production adapter invokes Git within each
repository, while the status collector can process repositories in parallel. The result for one
repository includes its own branch, working-tree state, ahead/behind counts, and any error.

Per-repository errors are essential. One missing remote or malformed checkout should not erase the
status of every other project. The observer reports partial failure instead of inventing a
workspace-wide success or failure state.

The same principle applies to dependencies. Rx scans Cargo manifests, records packages, and adds an
edge when one known package depends on another. The resulting graph answers questions such as
“which repositories consume this crate?” before a breaking change begins.

That graph is observability, not a build system. It does not create a shared lockfile, guarantee
that every consumer uses the same revision, or prove that downstream branches compile together.
It reveals coupling so that each affected repository can be checked on its own terms.

Status collection is most useful when it stays read-only. It creates a shared view without silently
cleaning working trees, switching branches, pulling remotes, or rewriting local work. Observation
comes before intervention.

## Problem three: coordinated change

The hardest case is a change that crosses repository boundaries. A shared Rust crate may change its
public API, several consumers may need updates, and each consumer may have a different test suite
and release policy.

The dependency graph provides the candidate list. Rx can then fan out a command with bounded
concurrency, a timeout, and optional fail-fast behavior. Each execution retains its repository,
argument list, exit code, standard output, standard error, and error state.

Separate results are more valuable than a single wall of terminal output. They show which
repositories passed, which failed, and which never ran. The operator can retry one project without
rerunning everything or confusing a timeout with a test failure.

Fan-out is useful for read-only checks and for commands whose effects are already understood. It is
not a distributed transaction. If a command modifies five repositories and fails on the sixth,
the first five are still modified. Automation must expose that reality rather than imply rollback
that Git cannot provide across independent histories.

The safe cross-repository workflow is therefore staged:

1. Discover the downstream repositories.
2. Inspect their current branches and working trees.
3. Update one repository at a time or in explicitly independent groups.
4. Run each repository's own quality gates.
5. Commit and review the changes in that repository.
6. Release projects according to their local dependency order and policy.

Local tooling makes step four efficient without weakening ownership. Inside a Rust repository,
Taskit compares changed files with the configured crate map and expands declared dependents. It can
run only the affected parts of that repository's workspace. Its analysis stops at the Git boundary;
Rx supplies the cross-repository view.

Godmode applies the same boundary to task state. It finds the nearest Git root and keeps the task
graph with that repository. Work on one project does not leak into another project's plan merely
because both projects live under the same parent directory.

These boundaries also make the tools replaceable. Cross-repository discovery does not need to own
task scheduling, and task scheduling does not need to own Git status. Shared conventions connect
the tools, but each tool has a limited responsibility and a visible failure surface.

## What stays local

This model intentionally gives up several monorepo properties:

- There is no atomic commit spanning every affected project.
- There is no single lockfile proving one dependency resolution.
- There is no universal CI result for the whole collection.
- Configuration may be duplicated across repositories.
- Migrations and releases happen in stages.

In return, each repository can choose its own release cadence, branch policy, quality gates, and
versioning. A prototype does not inherit the production workflow of an unrelated service. A library
can publish a compatibility release without forcing every consumer to release at the same time.

That trade is worthwhile when repository autonomy is a requirement rather than an accident. The
coordination layer reduces the cost of autonomy; it does not conceal the cost.

## A workspace is a behavior

The useful definition of a workspace is not “everything inside one Git repository.” It is a system
that can answer what exists, show the state of the whole collection, reveal important coupling, and
apply repeatable operations with clear results.

Independent repositories can provide that behavior. They need a discoverable inventory, read-only
cross-repository observability, bounded command execution, and disciplined handoffs to local build
and release tools.

The line to protect is ownership. Shared automation may find, inspect, and coordinate repositories.
It should not blur their histories or claim guarantees that only a true monorepo transaction could
provide. Coordination lives above Git. History and releases stay below it.

## Sources

- [Rx repository discovery](https://github.com/89jobrien/rx/blob/02101072c8b7daf57466e12a096397e145862ac2/crates/rx-core/src/repo.rs)
- [Rx status collection](https://github.com/89jobrien/rx/blob/02101072c8b7daf57466e12a096397e145862ac2/crates/rx-core/src/status/mod.rs)
- [Rx dependency graph](https://github.com/89jobrien/rx/blob/02101072c8b7daf57466e12a096397e145862ac2/crates/rx-core/src/graph.rs)
- [Rx fan-out execution](https://github.com/89jobrien/rx/blob/02101072c8b7daf57466e12a096397e145862ac2/crates/rx-core/src/fan.rs)
- [Godmode repository detection](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/detect.rs)
- [Godmode task dispatch](https://github.com/89jobrien/godmode/blob/main/crates/godmode-core/src/dispatch.rs)
- [Taskit affected-crate detection](https://github.com/89jobrien/taskit/blob/ed428faa61f563fc8d84761fa1846613a9aa9500/crates/taskit-engine/src/affected.rs)
