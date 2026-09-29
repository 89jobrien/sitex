---
title: >-
  Provenance Is the Point, or Your Memory Is Rewriting Its Own Evidence
date: 2026-09-28
description: >-
  Why the fix for a self-corrupting agent memory is not a better
  summarizer but a store that can cite what it overwrote, and what that looks
  like when it is a type instead of a doc comment.
taxonomies:
  tags: [knowledge-systems, software-architecture, observability]
extra:
  related:
    [project:kgx, project:episteme, post:grounding-survives-summarization]
---

The case for agent memory is usually made as a compounding argument. Session one
learns something. Session two builds on it. Over weeks you accumulate a
knowledge base, and each session starts where the last one ended.

There is published evidence against that framing, and it is stronger evidence
than the framing deserves. From _Useful Memories Become Faulty When Continuously
Updated by LLMs_ ([arXiv:2605.12978](https://arxiv.org/abs/2605.12978)):

> As consolidation proceeds, memory utility first rises, then degrades, and can
> fall below the no-memory baseline.
>
> Even when consolidating from ground-truth solutions, GPT-5.4 fails on 54% of a
> set of ARC-AGI problems it had previously solved without memory.

And the control that should stop you writing a memory feature at all:

> An episodic-only control that simply retains those trajectories remains
> competitive with the consolidators we test. In a controlled ARC-AGI Stream
> environment that exposes Retain, Delete, and Consolidate actions, agents
> preserve raw episodes by default and double the accuracy of their
> forced-consolidation counterparts.

Accumulating memory is not a free win. An agent that never forgets can be worse
than an agent that starts clean. The same paper names the mechanism:

> Each consolidation step is a lossy rewrite of the memory store: useful details
> are dropped, spurious rules are introduced, and once-helpful abstractions drift
> away from the underlying task structure. … Because each update rewrites the
> products of earlier updates, small abstraction errors compound into faulty
> memory.

That is the actual failure. Not that memory fails to accumulate, but that
**accumulation overwrites the evidence that would let you notice.** The
prescription the same authors land on is about preservation:

> Raw episodes should be treated as first-class evidence, not disposable material
> to be compressed away. Abstraction should be selective, delayed, and grounded
> in recoverable trajectories.

## What provenance is actually for

Here is the reframing I think matters. Provenance is usually sold as an
attribution feature: this claim came from this document, so you can check it.

That is a feature. It is not the one worth building.

If a memory system can only cite a whole document, then consolidation has
already destroyed the thing you would need to audit. You can see that the claim
was extracted from a PDF. You cannot see whether the PDF still contains the
sentence the claim rests on, because that sentence was rewritten out of
existence four consolidations ago and nothing in the store remembers it.

So the useful primitive is narrower and sharper: **given any claim, return the
exact span it came from, and keep that span addressable after every
rewrite.** A store with that property makes consolidation auditable. A store
without it makes consolidation invisible, and invisible rewrites are exactly
what the paper above measured going wrong.

Notice this reframes the argument. I am not claiming provenance makes memory
compound. Nothing in the literature measures that, and I will come back to it.
I am claiming provenance makes the _rewrite_ inspectable, which is a much smaller
and much more defensible claim.

## A store that describes provenance

I have two knowledge stores built this year. The first is `kgx`: a JSON-backed
graph, document, and wiki toolkit. Its own README calls the document layer an
_"Immutable document store with chunking & provenance"_ ([`README.md`](https://github.com/89jobrien/kgx/blob/main/README.md)).

The code defines a type that is fully capable of real provenance. Source:
`crates/kgx/src/types.rs` in kgx.

```rust
/// A chunk of a document, used for provenance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: ChunkId,
    pub doc_id: DocId,
    pub text: String,
    pub offset: usize,
}
```

That is the right shape. A chunk has an identifier, a document, its text, and a
byte offset. Fine-grained citation is representable here.

Now the result type, ten lines further down the same file:

```rust
/// Result of a graph query with provenance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub query: String,
    pub nodes: Vec<Entity>,
    pub edges: Vec<Relation>,
    pub supporting_chunks: Vec<Chunk>,
}
```

The comment says "with provenance." The field is a `Vec<Chunk>`.

Given an `Entity`, I cannot tell you which chunk supports it. `supporting_chunks`
is a flat bag containing every chunk of every document any returned node
happens to cite. It answers "which documents are in play," not "what does this
node rest on." The offset field is recorded and never returned per node.

This is what a store that only _describes_ provenance looks like, and the
tell is not in the README. It is in the relationship that does not exist. Every
type involved is individually sensible. `Chunk` has an ID. `Entity` has
`source_docs: Vec<DocId>`. Nothing anywhere points from an entity at a chunk.

### Three ways a citation rots

The deeper issue is that citations have no lifecycle. Once written, nothing
maintains them. Each of these is a place they break.

**Deduplication that eats the citation.** Node deduplication is correct — it
accumulates. Source: `crates/kgx/src/graph.rs` in kgx.

```rust
if let Some(&id) = self.name_index.get(&key) {
    // Merge source doc if new.
    if let Some(doc) = source_doc
        && let Some(node) = self.nodes.get_mut(&id)
    {
        let doc_s = doc.to_string();
        if !node.source_docs.contains(&doc_s) {
            node.source_docs.push(doc_s);
        }
    }
    return id;
}
```

Edge deduplication does the opposite, because its key omits the source
([`ops/merge.rs:78-85`](https://github.com/89jobrien/kgx/blob/main/crates/kgx/src/ops/merge.rs)):

```rust
let key = (
    src_name.to_lowercase(),
    tgt_name.to_lowercase(),
    edge.relation_type.clone(),
);
if existing_edges.contains(&key) {
    continue;
}
```

Two documents asserting "Rust enables memory safety" produce one edge. The
first document's citation survives. The second is discarded, silently, by a
mechanism named _merge_. Same data model, two adjacent functions, opposite
behaviors, and the difference is whether `source_doc` is in the key.

This is worth dwelling on because deduplication is supposed to be the safe
operation. It is the one place where the system decides two records are the same
claim — and deciding that is precisely when you must decide _which sources back
it_. Skip that step and you have not deduplicated, you have deleted a citation.

**Re-ingestion that orphans citations.** Source:
`crates/kgx/src/document.rs` in kgx.

```rust
#[test]
fn ingest_replaces_existing_doc() {
    let mut store = fresh_store();
    store.ingest("d1", "First", "a.md", "original content");
    store.ingest("d1", "Second", "b.md", "replacement content");
    assert_eq!(store.doc_count(), 1);
    let doc = store.get("d1").expect("doc should exist");
    assert_eq!(doc.title, "Second");
}
```

Re-ingesting a `doc_id` replaces the document and its chunks wholesale.
Entities derived from version one survive, still citing `d1`, which now contains
different text. The citation is still syntactically valid. It now points at a
document that no longer contains the claim, and nothing in the schema can
represent that this happened.

**A confidence gate that deletes rather than records.** `add_edge` drops any
relation below `MIN_CONFIDENCE` (`graph.rs:123-126`) and the CLI reports
`{"skipped": true, "reason": "confidence below threshold"}`. A rejected claim
leaves no trace — no tombstone, no score, no record that an extractor produced
it and a filter refused it. For a system whose whole purpose is to accumulate,
silence is the one output it should never produce.

### Confidence that means nothing

One detail I think is worse than the structural bugs. An omitted confidence
defaults to the maximum. Source: `crates/kgx-cli/src/ingest.rs` in kgx.

```rust
#[serde(default = "default_confidence")]
pub confidence: f64,
```

```rust
fn default_confidence() -> f64 {
    1.0
}
```

There is a test for this, named `default_confidence_is_one`. So it is
deliberate. Since the gate rejects anything below `0.6`, a record that omits its
confidence is guaranteed to pass, and it passes as maximally certain.

The bundled dataset makes it concrete: all 30 edges sit at exactly `1.0`. A
confidence signal with zero variance is not a weak signal, it is a decorative
one — and `MIN_CONFIDENCE` reads like a quality filter while filtering nothing.

Contrast this with scoping. In `episteme`, a confidence is attached to a
`(source_digest, analysis_model, policy_version)` tuple, so a bad score is
attributable and re-runnable with different settings. Same float, and it means
something. A confidence you cannot attribute to a specific analysis run is a
number attached to a vibe.

## A store that enforces it

`episteme` is the other side of the comparison. The citation is a required part
of the type. Source: `src/domain/mod.rs` in Episteme.

```rust
/// A source location and excerpt supporting generated research content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvidenceReference {
    /// A verbatim excerpt from extracted source text.
    pub quote: String,
    /// A page, section, or deterministic text location.
    pub location: String,
}
```

There is no constructor for a claim that lacks evidence, and no representation
of "supported by document X" in place of a quote and a location. The identifier
is content-addressed rather than random, so re-analyzing the same input produces
the same ID:

```rust
blake3::hash(format!("{namespace}:{value}").as_bytes())
```

The compounding decision is in the schema rather than in prose. Source:
`migrations/004_document_intelligence.sql` in Episteme.

```sql
CREATE TABLE IF NOT EXISTS intelligence_entities (
  ...
);

CREATE TABLE IF NOT EXISTS document_intelligence_entities (
  source_digest VARCHAR NOT NULL,
  ...
  PRIMARY KEY (source_digest, analysis_model, policy_version, entity_id)
);
```

`intelligence_entities` carries **no** `source_digest`. Canonical entities
accumulate globally, across every document that mentions them.
`document_intelligence_entities` is keyed by source digest, so claims and
relations are versioned per input revision.

"Compounding rather than re-deriving" is not a thing I wrote in a design doc. It
is the difference between those two primary keys. One table holds what is true
across all sources; the other holds what was true of a specific version of a
specific input under a specific model. Re-ingesting changed content in `episteme`
adds a digest. It does not overwrite what the previous digest produced — which
is precisely the failure in `kgx`, avoided by a column that exists.

## The part I have to concede

The type boundary buys structure, not correctness, and the constrained-decoding
literature is blunt about this. _Grammar-Aligned Decoding_ (Kang, Dhillon,
Goldman, NeurIPS 2024) finds that constraining output can distort the model's
distribution into producing grammatical nonsense. And a controlled study of
constrained decoding across model sizes
([arXiv:2609.23742](https://arxiv.org/abs/2609.23742)) measures exactly the gap
my design inherits:

> CD eliminates all structural failures across all models (schema validity:
> 78.6–92.9% → 100%), but content accuracy reveals a persistent semantic gap …
> Schema conformance is necessary but not sufficient for semantic correctness;
> CD's reach ends exactly where schema conformance ends.

So an `EvidenceReference` with a real quote and a real location guarantees the
citation is _genuine_. It does not guarantee the quoted sentence supports the
claim. A real quotation attached to an unsupported inference passes every check
in `episteme`. Making fabrication impossible and making the model right are
separate problems, and I have solved the first.

The fix for the second is not a better type. It is letting the model _select_
rather than generate — which is the subject of
[Grounding That Survives Summarization](@/blog/grounding-survives-summarization.md).
Constrained decoding for identifier vocabularies predates the LLM era by years
(Wang et al., EMNLP 2023, constrains generation to valid Wikidata entities), and
Generative Agents used integer citation indices for the same reason.

## What the literature does not support

I went looking for prior art on the specific bugs above and mostly did not find
it, so:

- **Nobody has published "re-deriving vs. compounding" as a named problem.** The
  name is mine. The adjacent _named, measured_ phenomena are memory dilution
  (Hu, Long, Wang, [arXiv:2604.27003](https://arxiv.org/abs/2604.27003) — "Old
  memories are not erased but become harder to access as the pool grows"), error
  propagation (_How Memory Management Impacts LLM Agents_, ACL 2026 — a noisy
  retrieved record gets amplified and "if the resulting execution is then added
  back into memory, the error is likely to be further propagated to future
  tasks"), and the supersession gap (_Supersede_,
  [arXiv:2606.27472](https://arxiv.org/abs/2606.27472) — bounded memory drops
  accuracy from 92% to 77%).
- **Nothing measures provenance-typed memory as a causal factor.** No paper
  ablates it. My kgx-versus-episteme comparison is a two-codebase argument, not
  an experiment, and I should not pretend otherwise.
- **The dedup-key bug and the re-ingest orphaning have no published treatment for
  LLM stores.** What the mature field solved is the structural equivalent, twenty
  years ago. The lineage literature calls it _update lineage_ — "connects newer
  versions of modified data to older versions" (Cheney et al., _Data Lineage: A
  Survey_). W3C PROV-O models invalidation as a derivation rather than an
  absence: `prov:wasInvalidatedBy` and `prov:invalidatedAtTime`, so a re-ingest
  is an activity that _points at_ what it replaced. `kgx`'s re-ingest points at
  nothing.
- **I could not find any public source on what production agent tools do about
  memory provenance.** Vendor docs describe features, not memory schemas. I am
  not going to guess at Claude Code's or Cursor's internals.
- **Provenance is not free.** The provenance literature measures real overhead —
  1–23% time for process-level capture and roughly 20% space overhead for
  `PASSv2` (_A primer on provenance_, 2014), rising steeply for fine-grained
  lineage. The lesson is that granularity and cost trade off, and mature systems
  offer eager versus lazy as a knob. A Rust type that makes the citation's
  _existence_ non-optional costs nothing at runtime; _which span_ is the
  expensive part, and that is a runtime choice. Keep the citation, make the
  resolution lazy.

## What to take away

If you take one thing: **a citation is not a feature, it is an invariant, and
invariants belong in types.**

My `kgx` has every ingredient — chunk IDs, byte offsets, source document
references, a type literally documented as `/// A chunk of a document, used for
provenance` — and still cannot answer "what does this node rest on," because the
link between them was never made and nothing made its absence loud. Meanwhile
`episteme` gets the same guarantee from a column that may or may not contain a
digest.

The test I now use: **name the invariant you want, then check whether the type
system can represent its violation.** If a record that breaks your rule is
constructible — or if a record that satisfies it is equally constructible
without — you have a doc comment, not a design.

The compounding argument for memory is not mine, and I no longer find it
persuasive on its own. The argument I do find persuasive is narrower: memory
systems rewrite themselves, rewrites destroy evidence, and the only way to catch
a bad rewrite is to keep the thing it replaced and be able to point at it.

---

_kgx_ is a JSON-backed knowledge graph toolkit — three layers, no external
database. _Episteme_ is a local-first document ingestion pipeline with typed BAML
extraction and DuckDB provenance. Both are described in the project notes linked
above.
