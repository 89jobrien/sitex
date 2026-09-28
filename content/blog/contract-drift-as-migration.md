---
title: Make Contract Drift Fail Before It Becomes Migration Work
date: 2026-09-11
description: "How Taskit turns quiet changes to shared files into visible review points before downstream users discover them."
taxonomies:
  tags: [ci-cd, developer-experience, integration, release-engineering]
extra:
  related:
    [project:taskit, post:machine-readable-cli, post:25-projects-no-monorepo]
---

A local build can pass while a contract breaks somewhere else. The producer and
its direct callers changed together. The consumer did not.

The contract may be a Rust type, a serialized enum, CLI JSON, or a configuration
file. DevLoop treats serialized context tags as compatibility surfaces and locks
their spelling with tests.

Shortened excerpt from
`/Users/joe/dev/devloop/crates/devloop/src/context.rs`.

```rust
#[test]
fn context_kind_serializes_as_snake_case() {
    assert_eq!(
        serde_json::to_string(&ContextKind::ActiveCrate).unwrap(),
        "\"active_crate\""
    );
}

#[test]
fn context_item_serialized_tags_remain_unchanged() {
    let item = ContextItem::Metrics(RepoMetrics {
        total_commits: 1,
        active_crates: 2,
        total_sessions: 3,
    });

    assert_eq!(serde_json::to_value(item).unwrap()["kind"], "metrics");
}
```

## Name the files that carry promises

A serialization test protects behavior it knows about. It does not tell another
repository that the source file moved. Taskit's protocol-drift check handles that
earlier boundary by letting a workspace name files that carry promises.

Exact excerpt from
`/Users/joe/dev/taskit/crates/taskit-types/src/config.rs`.

```rust
#[derive(Debug, Deserialize)]
pub struct ProtocolConfig {
    #[serde(default)]
    pub surfaces: Vec<SurfaceEntry>,
    pub lockfile: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SurfaceEntry {
    pub name: String,
    pub path: String,
}
```

Taskit normalizes each tracked Rust file and hashes the result with SHA-256. It
drops blank lines, comments, and the usual `#[cfg(test)] mod tests` block. That
keeps documentation and test edits from looking like contract changes.

The normalization is not semantic analysis. It makes the tripwire quieter
without pretending to understand Rust compatibility.

Shortened excerpt from
`/Users/joe/dev/taskit/crates/taskit-engine/src/protocol/contract_hash.rs`.

```rust
pub fn normalize(content: &str) -> String {
    let mut normalized = Vec::new();

    for raw_line in content.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        let line = strip_trailing_comment(trimmed).trim();
        if !line.is_empty() {
            normalized.push(line.to_string());
        }
    }

    normalized.join("\n") + "\n"
}

pub fn hash(normalized: &str) -> String {
    hex::encode(Sha256::digest(normalized.as_bytes()))
}
```

## Failure creates a review point

Taskit calculates the current lock data, compares it with
`taskit-protocol.lock`, reports each named mismatch, and returns an error in the
normal checking mode. That forces the author to decide whether the edit is
harmless, additive, breaking, or part of a coordinated release.

Shortened excerpt from
`/Users/joe/dev/taskit/crates/taskit-engine/src/protocol/drift.rs`.

```rust
let current = calculate_lockfile(root, surfaces)?;
let expected = read_lockfile(&lock_path)?;
let drift = compare_lockfiles(&expected, &current);

if drift.is_empty() {
    return Ok(());
}

report_drift(&drift);

if hook || warn_only {
    return Ok(());
}

Err(TaskitError::other("core contract drift detected"))
```

The mode matters. The normal check fails. `warn_only` and the editor-hook path
report drift but return success. The read-only dashboard check also treats a
missing lockfile as configured without reporting a mismatch. Those paths are
signals, not merge gates.

An intentional change uses update mode. That writes the new lockfile, but the
write is only an acknowledgement. It does not prove that consumers were
migrated.

Shortened excerpt from
`/Users/joe/dev/taskit/crates/taskit-engine/src/protocol/drift.rs`.

```rust
if update {
    if ctx.dry_run {
        taskit_output::taskit_dry!("write {lock_rel}");
    } else {
        write_lockfile(&lock_path, &current)?;
    }
    return Ok(());
}
```

Running update first defeats the mechanism. Inspect the named surface, find its
consumers, update code and fixtures, then accept the new hash.

The hash also has a known parser limit. A space followed by `//` inside a string
literal is treated as a trailing comment. Taskit documents and tests that rather
than claiming parser-level normalization.

Exact excerpt from
`/Users/joe/dev/taskit/crates/taskit-engine/src/protocol/contract_hash.rs`.

```rust
#[test]
fn strip_trailing_comment_false_positive_on_space_slash_slash_in_string() {
    assert_eq!(
        strip_trailing_comment(r#"let s = "a // b";"#),
        r#"let s = "a"#
    );
}
```

## Hashes are a tripwire, not a proof

A matching hash proves one narrow fact. The normalized text matches the recorded
text. It does not prove wire compatibility, behavior, or successful downstream
builds. Serialization fixtures and consumer tests still own those questions.

Taskit can widen checks inside one configured workspace. It detects changed
crate paths against `origin/main` and adds dependents declared in
`workspace.propagation`.

Shortened excerpt from
`/Users/joe/dev/taskit/crates/taskit-engine/src/affected.rs`.

```rust
fn apply_propagation(affected: &mut BTreeSet<String>, ws: &WorkspaceConfig) {
    let direct: Vec<String> = affected.iter().cloned().collect();

    for crate_name in &direct {
        for entry in &ws.propagation {
            if crate_name == &entry.source {
                affected.extend(entry.dependents.iter().cloned());
            }
        }
    }
}
```

That expansion is explicit and single-pass. Taskit does not infer Cargo
dependencies, follow transitive propagation chains, or discover consumers in
other repositories. Cross-repository migration still needs search, release
notes, and downstream builds.

The win is timing. A source edit starts looking like migration work while it is
still a local diff.

Exact excerpt from
`/Users/joe/dev/taskit/crates/taskit-engine/src/affected.rs`.

```rust
#[test]
fn apply_propagation_expands_source_to_declared_dependents() {
    let ws = make_ws(
        &[("common", None), ("api", None), ("cli", None)],
        &[("common", &["api", "cli"])],
    );
    let mut affected: BTreeSet<String> = ["common".to_string()].into();

    apply_propagation(&mut affected, &ws);

    assert!(affected.contains("api"));
    assert!(affected.contains("cli"));
}
```

## Sources

- [Taskit protocol configuration](https://github.com/89jobrien/taskit/blob/ed428faa61f563fc8d84761fa1846613a9aa9500/crates/taskit-types/src/config.rs)
- [Taskit contract normalization](https://github.com/89jobrien/taskit/blob/ed428faa61f563fc8d84761fa1846613a9aa9500/crates/taskit-engine/src/protocol/contract_hash.rs)
- [Taskit drift comparison](https://github.com/89jobrien/taskit/blob/ed428faa61f563fc8d84761fa1846613a9aa9500/crates/taskit-engine/src/protocol/drift.rs)
- [Taskit affected-crate propagation](https://github.com/89jobrien/taskit/blob/ed428faa61f563fc8d84761fa1846613a9aa9500/crates/taskit-engine/src/affected.rs)
