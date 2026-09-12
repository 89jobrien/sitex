---
title: Make Contract Drift Fail Before It Becomes Migration Work
date: 2026-09-11
description: "How Taskit turns quiet changes to shared files into visible review points before downstream users discover them."
---

A file can change cleanly in its own repository and still break everything
that treats it as a contract.

I have seen this with Rust types, CLI output, protocol enums, and configuration
files. The local build passes because the file and its direct callers changed
together. The real cost appears later, in another crate or another repository,
where somebody depended on the old shape without having a formal schema to
declare it.

Taskit's protocol-drift check exists to make that moment happen earlier.

## Name the files that carry promises

Not every contract has an `api.yaml` extension. A Rust source file containing
shared request types can be a protocol. So can the module that defines CLI
commands, a JSON fixture consumed by another tool, or a generated file other
repositories pin.

Taskit lets a workspace name those surfaces in `taskit.toml`. It records a
SHA-256 hash of each surface's normalized text in `taskit-protocol.lock`. The
default drift check fails when that normalized hash differs from the lockfile.

The configuration is small enough to be obvious in review:

```toml
[[protocol.surfaces]]
name = "api-types"
path = "crates/api/src/types.rs"

[[protocol.surfaces]]
name = "cli-commands"
path = "crates/cli/src/commands/mod.rs"
```

The names matter. `api-types` says why the file is special; it does not merely
say that the file is being watched. When the gate reports drift, the author can
connect the change to a contract the workspace chose to protect.

The hash does not explain whether the change is compatible. It does something
more basic and often more useful: it stops the change from being invisible.
Updating the lockfile becomes an explicit acknowledgement that a contract
moved.

## Failure creates a review point

Without a gate, a small refactor can merge under a description that never
mentions downstream users. When the drift check fails, it creates a point
where the author can ask why the surface changed, which consumers know about
it, and whether the migration belongs in the same work.

Sometimes the normalized contract changed intentionally, perhaps through an
additive change whose consumers are already safe. Then the right response is
to run the drift command's update mode and commit the new lock. Other times
the failed hash reveals that a local rename is actually a coordinated release.

My preferred sequence is deliberately boring. First, run the check and read
which named surface changed. Then inspect the diff and identify consumers.
Update code, fixtures, and documentation that share the contract. Only after
that decision is understood do I update the lockfile.

If `--update` is the first response to every failure, the lock becomes noise.
It still records the new hash, but it no longer creates the pause that gives
the mechanism value.

The tool cannot make that judgment. It can make skipping the judgment harder.

## Hashes are a tripwire, not a proof

A matching hash says the tracked file's normalized contract text matches the
repository's lockfile. It does not prove wire compatibility, semantic
compatibility, or correct behavior. Those still need tests: serialization
fixtures, conformance suites, consumer builds, or whatever matches the
contract in question.

I like the hash gate because it is cheap enough to apply to contracts that
would never justify a formal compatibility system. It catches the casual
change and leaves deeper validation to tools that understand the semantics.

The useful shift is social as much as technical. Once a surface is named in
Taskit, changing it stops looking like ordinary cleanup. It looks like what it
is: a decision that may create work somewhere else.

## Cross-repository changes need a second map

Within a configured Rust workspace, Taskit can run affected checks for crates
changed between `origin/main` and `HEAD`, plus direct dependents explicitly
listed in `[[workspace.propagation]]`. It does not infer Cargo dependencies
or automatically know about separate repositories that copied a JSON shape or
pinned a released crate.

For those changes, the drift gate is the start of the migration rather than
the whole solution. I still need repository search, release notes, and builds
in downstream projects. The advantage is timing: that work begins while the
contract change is still a local diff, not after consumers report unrelated
failures.

This is why I prefer a modest claim for hash tracking. Taskit does not prove
compatibility. It gives important files a tripwire and gives the team a chance
to treat an edit as migration work before the rest of the system forces the
issue.

## Sources

- [Protocol surface configuration](https://github.com/89jobrien/taskit/blob/main/crates/taskit-types/src/config.rs)
- [Normalized contract hashing](https://github.com/89jobrien/taskit/blob/main/crates/taskit-engine/src/protocol/contract_hash.rs)
- [Drift comparison and lockfile updates](https://github.com/89jobrien/taskit/blob/main/crates/taskit-engine/src/protocol/drift.rs)
- [Affected-crate detection and propagation](https://github.com/89jobrien/taskit/blob/main/crates/taskit-engine/src/affected.rs)
