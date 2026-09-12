---
title: Redaction Is a System Boundary, Not a Cleanup Step
date: 2026-09-11
description: "Why obfsck can redact data before it enters LLM prompts, staged commits, or manually prepared support artifacts."
---

A log line can be safe on my machine and unsafe one command later. The moment
I paste it into an issue, send it to an LLM, or attach it to a support request,
it crosses into a system with different retention, access, and trust.

If redaction happens after that point, it is not protection. It is cleanup.

## Put `obfsck` before the boundary

I built `obfsck` to sit in the path data already takes. Its `redact` command
accepts a file or stdin, and its alert analyzer sanitizes logs before building
the LLM prompt. The pre-commit `scan` command checks a staged diff before a
secret becomes repository history when it is installed as a commit hook.

Those placements matter more than the size of the pattern library. A perfect
detector that runs after upload cannot undo the upload. A good detector on the
outbound path can stop or transform the data while I still control it.

For the same reason, I do not think of redaction as a final formatting pass.
It is an adapter at a trust boundary: local logs in, deliberately reduced data
out.

## Useful data has structure

The naive version replaces everything suspicious with `[REDACTED]`. That is
safe in one sense and nearly useless in another. If the same user appears in
multiple lines, or an internal address repeatedly talks to the same external
address, an investigator needs those relationships even when the original
identities must disappear.

Within one stateful obfuscation operation, `obfsck` uses stable mappings for
that reason. The same email, username, or IP becomes the same token throughout
the text. A person becomes `[USER-1]`; the next person becomes `[USER-2]`. The
names are gone, but the sequence of events still makes sense.

For example, an incident fragment might begin like this:

```text
login failed user=alice email=alice@corp.example src=10.1.1.5
retry accepted user=alice email=alice@corp.example src=10.1.1.5
```

After redaction, the values change but the relationship survives:

```text
login failed user=[USER-1] email=[EMAIL-1] src=[IP-INTERNAL-1]
retry accepted user=[USER-1] email=[EMAIL-1] src=[IP-INTERNAL-1]
```

The second line still tells me that the same identity retried from the same
source. That is often the difference between a sanitized log that can support
diagnosis and one that is technically clean but operationally empty.

Its `minimal`, `standard`, and `paranoid` levels make the trade explicit.
`minimal` runs the enabled baseline patterns, primarily credentials but also
some sensitive identifiers. `standard` adds common identifiers and personal
data. `paranoid` goes further into paths, hostnames, and high-entropy values.
The right level depends on where the output is going, not on a universal idea
of "clean."

## Put the control in the normal path

The most reliable redaction step is one I do not have to remember at the end.
For repository changes, `scan --staged` can inspect the diff at commit
time. For log analysis, the alert analyzer fetches from Loki or VictoriaLogs,
obfuscates the result, and only then prepares the model request. For an ad hoc
support bundle, `redact` can sit directly in the pipe that creates the file I
will share.

These are deliberately different integrations around the same boundary. A
pre-commit scan may block because a credential should never enter history. A
log pipeline usually transforms because the sanitized structure is still
valuable. The policy should match the consequence of crossing the boundary.

The alert analyzer also has a real dry-run path. With JSON output enabled, it
returns the sanitized prompt plus a local mapping without calling the model,
so I can inspect the prompt the model would receive. The standalone `redact`
command transforms its output even in audit mode, so it should not be
described as a dry run.

## Treat failure honestly

Redaction cannot prove that arbitrary text contains no sensitive information.
Patterns miss unfamiliar formats, and aggressive rules can erase the clue
that would have explained an incident. That is why placement and policy still
matter even with a capable scanner.

The safest workflow combines both: reduce what can leave, run `obfsck` before
it leaves, preserve stable relationships where they are needed, and let the
destination determine how aggressive the transformation should be.

I also assume patterns will miss things. Project names, customer-specific
identifiers, and novel token formats may be sensitive without matching a
built-in rule. The `redact` CLI supports custom YAML groups and allowlists;
the scanner, library, analyzer, and MCP paths are only partially configurable.
Those controls are maintenance tools, not a proof that free-form text is safe.
The less data the workflow collects in the first place, the less a redactor
has to recognize perfectly.

Mappings also do not persist automatically between separate operations, and
`scan` examines added lines from a unified diff rather than proving an entire
repository clean. Those limits are another reason to treat redaction as one
boundary control rather than a certificate of safety.

That is a system boundary, not a cosmetic one. By the time the text needs
cleaning up somewhere else, the important decision has already been made.

## Sources

- [Obfsck levels and stable mappings](https://github.com/89jobrien/obfsck/blob/main/src/lib.rs)
- [Staged-diff scanner](https://github.com/89jobrien/obfsck/blob/main/src/bin/scan.rs)
- [Alert analyzer redaction boundary](https://github.com/89jobrien/obfsck/blob/main/src/analyzer/mod.rs)
- **Redaction CLI and custom configuration:** `src/cli.rs` in the audited local Obfsck checkout; public `main` has not yet synchronized this implementation.
- [Configuration roadmap and current integration limits](https://github.com/89jobrien/obfsck/blob/main/docs/feature-roadmap.md)
