---
title: "episteme"
date: 2026-09-28
description: "Local-first document ingestion and intelligence pipeline in Rust: spans are numbered at the boundary, models select span IDs instead of writing quotes, Rust reconstructs verbatim evidence and re-verifies it against the source before anything is written to DuckDB or an Obsidian vault."
taxonomies:
  tags: [cli, knowledge-systems, security]
extra:
  repo: "https://github.com/89jobrien/episteme"
  related: [project:kgx, post:grounding-survives-summarization]
---

Verified against `feat/classification-batch`. The package is `episteme-local`
v0.1.1 on crates.io; the library crate and installed binary are both
`episteme`.

`episteme` ingests documents into an Obsidian vault. Its distinguishing
choice is that **the model never writes a quotation.** Source spans are
numbered at ingestion, the model selects identifiers, and Rust copies the text
back out and re-checks it against the source. A fabricated citation is
therefore unrepresentable rather than merely discouraged.

That design is the subject of
[Grounding That Survives Summarization](@/blog/grounding-survives-summarization.md).
This page is the reference.

## Architecture

```text
inbox document
  -> document_extractor   (Poppler / Tesseract / Pandoc, no shell)
  -> source spans         (S000001.., with character ranges)
  -> baml_analyzer        (model selects span IDs only)
  -> evidence reconstruction + validation in Rust
  -> DuckDB intelligence graph
  -> vault note + zk index
```

| Module                                         | Responsibility                                              |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `domain`                                       | Types, validation, blake3 stable IDs                        |
| `ports`                                        | Port traits                                                 |
| `adapters`                                     | BAML analyzer, DuckDB, vault, extractors, `zk`, model probe |
| `intelligence`                                 | Entity/claim/relation graph construction                    |
| `classification`                               | Single-document and batch classification                    |
| `ingest`, `watch`, `doctor`, `stage`, `config` | Orchestration and setup                                     |
| `baml_client`                                  | **Generated** -- do not edit or lint                        |

## The grounding mechanism

Output classes declare `evidence_span_ids string[]`. There is no field for a
quote. Source: `baml_src/research.baml`.

```text
class ClaimOutput {
  local_id string
  text string
  kind ClaimKind
  confidence_percent int
  evidence_span_ids string[]
}
```

Rust then resolves each identifier to a real quote and location, and rejects
any quote absent from the source (`src/domain/mod.rs`):

```rust
if evidence.into_iter().any(|item| {
    item.quote.trim().is_empty()
        || item.location.trim().is_empty()
        || !source.contains(&item.quote)
}) {
    return Err(DomainError::InvalidIntelligence);
}
```

The citation set narrows through the pipeline. The aggregation stage may only
cite spans the per-chunk stage already selected, so grounding is monotonically
non-expanding and survives map/reduce summarization.

## Storage model

Four SQL migrations. The schema encodes the compounding decision directly:

| Table                            | Keyed by                                                       |
| -------------------------------- | -------------------------------------------------------------- |
| `intelligence_entities`          | `entity_id` alone -- **global, no source digest**              |
| `document_intelligence_entities` | `(source_digest, analysis_model, policy_version, entity_id)`   |
| `intelligence_claims`            | `(source_digest, analysis_model, policy_version, claim_id)`    |
| `semantic_relations`             | `(source_digest, analysis_model, policy_version, relation_id)` |

Canonical entities accumulate across every document; claims and relations are
versioned per source digest. Re-ingesting changed content creates a new
digest rather than overwriting, so prior reasoning stays addressable.

## Usage

Requires Poppler, Tesseract, Pandoc, `zk`, and a local OpenAI-compatible model
endpoint bound to an explicit loopback address. No cloud fallback exists.

```text
cargo install episteme-local

episteme --config episteme.toml doctor
episteme --config episteme.toml init
episteme --config episteme.toml classify "/path/inside/inbox/document.pdf"
episteme --config episteme.toml classify-batch --summary ".ctx/summary.json"
episteme --config episteme.toml analyze --force "/path/inside/inbox/document.pdf"
episteme --config episteme.toml ingest "/path/inside/inbox/document.pdf"
episteme --config episteme.toml watch
```

`classify` stores typed metadata and prints the record as JSON without
touching the vault. `analyze` produces the evidence-grounded graph. `watch`
requires two unchanged observations before processing a file.

## Known limitations

- **The model can select the wrong span.** Every mechanism here verifies that a
  quotation is _real_, never that it _supports the claim_. A real quote attached
  to an unsupported sentence passes all four checks. No accuracy comparison
  between span-ID output and free-quote output has been run.
- **Confidence is a range check, not a calibration.** `confidence_percent` must
  fall in 60-100. That rejects nonsense and nothing more.
- **The span-ID pattern was not retrofitted.** The older `ResearchDraftOutput`
  still declares `evidence EvidenceReferenceOutput[]` with a `quote string` the
  model writes directly, defended only by the source re-verification above.
  `ResearchChunkOutput`, `AggregatedResearchOutput`, `ClaimOutput`,
  `EntityOutput`, and `SemanticRelationOutput` all use span IDs.
- **Document tools run outside a sandbox.** Poppler, Tesseract, and Pandoc are
  invoked as bounded shell-free subprocesses but not inside a networkless OS
  sandbox, so automatic public downloads stay disabled. Externally supplied
  tools remain trusted input.
- **Long documents are degraded, not summarized.** Inputs exceeding every
  classifier profile are reduced to a deterministic bounded head/tail excerpt,
  so tail content never reaches extraction.
- **Heavy runtime.** 17 runtime dependencies including a bundled DuckDB build,
  `reqwest` with rustls, and a pinned `baml = "=0.221.0"`. The pinned BAML and
  DuckDB versions mean upstream updates need deliberate bumps.
- **A local endpoint is mandatory.** There is no degraded mode. A system that
  refuses to emit ungrounded output also refuses to emit output when the model
  is down.

## Code Quality

`unsafe_code = "forbid"` and clippy `all` plus `pedantic` are both `deny` in
`Cargo.toml`. Zero `todo!()` or `unimplemented!()` in hand-written source.
33 integration tests across 17 files in `tests/`, plus 9 unit tests in
`src/domain` and `src/adapters`.

`rustqual 1.2.0` reports `iosp_score` 97% but `quality_score` 27%, with 137
dead-code and 32 untested warnings. **These numbers are not a meaningful
quality signal here:** the repo has no `rustqual.toml`, so the scan includes
the 19 generated files under `src/baml_client/`, which account for most of the
dead-code and test-coverage warnings. Unlike `kgx` and `sandbox`, this workspace
has no curated baseline. Excluding `src/baml_client/` and re-measuring would be
the honest comparison.

## License

MIT OR Apache-2.0
