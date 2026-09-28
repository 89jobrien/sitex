---
title: Redaction Is a System Boundary, Not a Cleanup Step
date: 2026-09-11
description: "Why obfsck can redact data before it enters LLM prompts, staged commits, or manually prepared support artifacts."
taxonomies:
  tags: [developer-experience, observability, security]
extra:
  related:
    [
      project:obfsck,
      post:policy-between-intent-and-effects,
      post:tools-that-change-behavior,
    ]
---

A log line can be safe on my machine and unsafe one command later. Paste it
into an issue, send it to a model, or attach it to a support request and it
crosses into a system with different retention, access, and trust.

Redacting it afterward does not protect anything. That is cleanup after the
boundary has already been crossed.

This shortened excerpt shows the ordering inside the alert analyzer. Obfsck
transforms the alert before it builds the prompt and calls the provider. Source:
`src/analyzer/mod.rs` in Obfsck.

```rust
let (obf_output, obf_fields, mapping) =
    obfuscate_alert(output, output_fields.as_ref(), self.obfuscation_level);

let user_prompt = build_user_prompt(
    alert,
    &labels,
    &obf_output,
    &obf_fields,
    self.obfuscation_level,
);

let analysis = self
    .provider
    .analyze(SYSTEM_PROMPT, &user_prompt)
    .and_then(|raw| self.parse_analysis_response(&raw));
```

## Put `obfsck` before the boundary

I built `obfsck` to sit in paths data already takes. The `redact` command reads
a file or stdin. The analyzer sanitizes fetched logs before creating an LLM
request. The scanner can inspect a staged diff before a secret enters history.

Position matters more than pattern count. A detector that runs after upload
cannot undo the upload. One on the outbound path can still block or transform
the data.

One stateful `Obfuscator` owns the level, mapping, counters, PII switch, and
allowlist. Source: `src/lib.rs` in Obfsck.

```rust
#[derive(Debug)]
pub struct Obfuscator {
    level: ObfuscationLevel,
    pii: bool,
    allowlist: Allowlist,
    map: ObfuscationMap,
    counters: Counters,
}

pub fn obfuscate_text(
    text: &str,
    level: ObfuscationLevel,
) -> (String, ObfuscationMapExport) {
    let mut obfuscator = Obfuscator::new(level);
    let out = obfuscator.obfuscate(text);
    (out, obfuscator.mapping())
}
```

## Useful data has structure

Replacing every suspicious value with `[REDACTED]` removes relationships that
matter during diagnosis. If one user retries twice from one address, I need to
know those events share an identity even when I do not need the identity.

Obfsck keeps mappings stable within one operation. The same email, username,
or IP receives the same numbered token each time. The names disappear while
the sequence remains readable.

The project locks that behavior down directly. Source:
`tests/test_obfuscation.rs` in Obfsck.

```rust
#[test]
fn repeated_values_map_to_single_stable_token() {
    let input = "src=10.0.0.7 dst=10.0.0.7 user=alice user=alice";
    let (out, map) = obfuscate_text(input, ObfuscationLevel::Standard);

    assert_eq!(out.matches("[IP-INTERNAL-1]").count(), 2);
    assert_eq!(out.matches("[USER-1]").count(), 2);
    assert_eq!(map.ips.len(), 1);
    assert_eq!(map.users.len(), 1);
}
```

Mappings belong to that `Obfuscator` instance. They do not persist across
separate commands or analyzer runs. Stable tokens preserve relationships
inside one operation, not across the lifetime of a system.

The allocator returns an existing token before advancing its counter. Source:
`src/lib.rs` in Obfsck.

```rust
fn get_or_create_token(
    counters: &mut Counters,
    category: TokenCategory,
    original: &str,
    mapping: &mut HashMap<String, String>,
) -> String {
    if let Some(existing) = mapping.get(original) {
        return existing.clone();
    }

    let n = counters.next(category);
    let token = format!("[{}-{}]", category.label(), n);
    mapping.insert(original.to_string(), token.clone());
    token
}
```

## Make the trade explicit

`minimal`, `standard`, and `paranoid` describe different outbound policies.
Minimal applies enabled baseline secret patterns. Standard adds structural PII
such as emails, IP addresses, and users. Paranoid also processes paths,
hostnames, and high-entropy values.

More aggressive is not automatically better. Broad rules can erase the clue
that explains an incident. The right level follows the destination.

The sequence is explicit in `Obfuscator::obfuscate`. Source: `src/lib.rs` in
Obfsck.

```rust
s = Cow::Owned(self.obfuscate_secrets(s.as_ref()));
if self.level == ObfuscationLevel::Minimal || !self.pii {
    return s.into_owned();
}

s = Cow::Owned(self.obfuscate_ips(s.as_ref()));
s = Cow::Owned(self.obfuscate_emails(s.as_ref()));
s = Cow::Owned(self.obfuscate_containers(s.as_ref()));

if self.level == ObfuscationLevel::Paranoid {
    s = Cow::Owned(self.obfuscate_paths(s.as_ref()));
    s = Cow::Owned(self.obfuscate_hostnames(s.as_ref()));
    s = Cow::Owned(self.obfuscate_high_entropy(s.as_ref()));
}
```

## Put the control in the normal path

The reliable redaction step is the one I do not have to remember later.
`scan --staged` gets the staged diff itself. An installed commit hook can stop
a matching addition before Git records it.

The scanner does not prove the repository is clean. It checks added lines in a
unified diff. That scope is useful at commit time, but it is not a full audit.

This shortened excerpt is the scanner's actual boundary. Source:
`src/bin/scan.rs` in Obfsck.

```rust
for (line_no, line) in diff.lines().enumerate() {
    if let Some(path) = line.strip_prefix("+++ ") {
        current_path = diff_path(path);
        continue;
    }
    if line.starts_with("@@ ") {
        next_source_line = hunk_new_line_start(line);
        continue;
    }
    if !line.starts_with('+') {
        continue;
    }

    let content = &line[1..];
    let source_line = next_source_line.unwrap_or(line_no + 1);
```

The analyzer has a real dry-run path. It returns the sanitized prompt and a
local mapping without calling the model. The standalone `redact` command is
different. Audit mode still writes transformed output.

The analyzer's early return is the proof. Source: `src/analyzer/mod.rs` in
Obfsck.

```rust
if dry_run {
    info!("Dry run - skipping LLM analysis");
    return json!({
        "obfuscated_prompt": user_prompt,
        "obfuscation_mapping": mapping_json,
        "note": "Dry run - no LLM call made"
    });
}
```

## Treat failure honestly

Regexes cannot prove arbitrary text contains no sensitive information.
Project names, customer identifiers, and unfamiliar credentials can miss
built-in patterns. Entropy rules can also erase useful evidence.

The CLI accepts custom YAML patterns and allowlists, but configuration is not
uniform across every entry point. The CLI applies runtime YAML patterns and
then the library's compiled definitions. The scanner, analyzer, library, and
MCP paths do not yet share one injected pattern engine.

That limitation is recorded beside the bundled pass. Source: `src/lib.rs` in
Obfsck.

```rust
fn obfuscate_secrets(&mut self, text: &str) -> String {
    // TODO(roadmap-pattern-engine): Inject one configurable pattern set across all entry points.
    let mut s: Cow<'_, str> = Cow::Borrowed(text);
    for pat in secret_patterns() {
        // Pattern level checks and replacement happen here.
    }
    s.into_owned()
}
```

Redaction is one boundary control, not a safety certificate. Collect less,
transform before release, preserve only the relationships needed for
diagnosis, and assume patterns will miss something.

The scanner test checks that a finding reports its location without echoing
the matched secret. Source: `tests/test_scan_cli.rs` in Obfsck.

```rust
assert_eq!(output.status.code(), Some(1), "stderr: {stderr}");
assert!(!stderr.contains(&secret), "secret leaked in stderr: {stderr}");
assert!(stderr.contains("config.txt:7"), "missing source location: {stderr}");
```

## Sources

- [Obfsck levels and stable mappings](https://github.com/89jobrien/obfsck/blob/main/src/lib.rs)
- [Redaction CLI and custom configuration](https://github.com/89jobrien/obfsck/blob/main/src/cli.rs)
- [Staged-diff scanner](https://github.com/89jobrien/obfsck/blob/main/src/bin/scan.rs)
- [Alert analyzer redaction boundary](https://github.com/89jobrien/obfsck/blob/main/src/analyzer/mod.rs)
- [Redaction pattern configuration](https://github.com/89jobrien/obfsck/blob/main/config/secrets.yaml)
