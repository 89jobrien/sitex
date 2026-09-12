---
title: "bamlish"
date: 2026-08-18
description: "Structured LLM output library for the dev workspace -- defines BAML schemas and exposes a generated, type-safe Rust client (baml_client) for AI functions covering git branch analysis, multi-role council synthesis, Claude session parsing, doob task analysis, cross-session analysis, and devloop agent planning."
taxonomies:
  tags: [developer-experience, integration, llm]
extra:
  repo: ""
  related: [project:devkit, project:doob, project:message-extractor]
---

# bamlish

Structured LLM output library for the dev workspace. Defines BAML schemas and exposes a generated
Rust client (`baml_client`) for calling AI functions with type-safe return values.

Covers: git branch analysis, multi-role council synthesis, Claude session parsing, doob task
analysis, cross-session analysis, devloop agent planning, and meta-schema generation.

## Usage

Add to `Cargo.toml`:

```toml
bamlish = { path = "../bamlish" }
```

Types and the async call surface are exposed at the crate root:

```rust
use bamlish::{B, BranchInsight, CitedFinding};

let insight: BranchInsight = B.AnalyzeBranch.call(
    "feature/auth".into(),
    commits,
    sessions,
    commit_count,
    session_count,
    None,
).await?;
```

For council analysis, run the role functions in parallel and synthesize:

```rust
use bamlish::{B, CouncilInsight};

let (strict, creative, general) = tokio::join!(
    B.AnalyzeBranch_StrictCritic.call(...),
    B.AnalyzeBranch_CreativeExplorer.call(...),
    B.AnalyzeBranch_GeneralAnalyst.call(...),
);
let council: CouncilInsight = B.SynthesizeCouncilInsights.call(...).await?;
```

## BAML functions by domain

| Domain          | Key functions                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch analysis | `AnalyzeBranch`, `AnalyzeBranchWithCodeStructure`, `ExtractUserIntent`, `AnswerTimelineQuestion`                                              |
| Council         | `AnalyzeBranch_StrictCritic`, `_CreativeExplorer`, `_GeneralAnalyst`, `_SecurityReviewer`, `_PerformanceAnalyst`, `SynthesizeCouncilInsights` |
| Conversation    | `SummarizeConversation`, `AnalyzeToolUsage`, `AnalyzeTaskProgression`, `QuickSummarize`, `GenerateSessionTitle`                               |
| Session logs    | `AnalyzeSession`, `AnalyzeErrorPatterns`, `SummarizeProductivity`, `ParseLogEntry`                                                            |
| Doob            | `SummarizeProjectTodos`, `TriageOpenTodos`, `GenerateStandup`, `SummarizeHandoff`                                                             |
| DevLoop         | `BuildAgentSystem`, `AnalyzeCode`, `CreatePlan`                                                                                               |
| Meta            | `GetMetaBamlFunctions`, `GetMetaBamlClasses`, `GetMetaBamlEnums`                                                                              |

## LLM clients

| Client           | Pool                               | Used for                         |
| ---------------- | ---------------------------------- | -------------------------------- |
| `CustomGPT5`     | OpenAI GPT-5 → Anthropic Sonnet4   | Synthesis, complex reasoning     |
| `CustomGPT5Mini` | OpenAI GPT-5Mini → Anthropic Haiku | Lightweight tasks, council roles |
| `CustomFast`     | round-robin Mini/Haiku             | Load distribution                |

Both `CustomGPT5` and `CustomGPT5Mini` have `retry_policy Exponential` (max 2, 300ms base, 1.5×)
for 429 backoff during parallel council execution. A schema lint test guards this invariant.

## Environment variables

| Variable            | Purpose            |
| ------------------- | ------------------ |
| `OPENAI_API_KEY`    | OpenAI provider    |
| `ANTHROPIC_API_KEY` | Anthropic provider |

At least one is required for live calls. Schema lint tests run without any key.

## Regenerating the client

Schema sources live in `baml_src/`. After editing any `.baml` file:

```bash
uvx --from baml-py@0.221.0 baml-cli generate
```

The `generators.baml` `version` field and the `baml` crate version in `Cargo.toml` must match.

## Dev tooling prerequisites

```bash
cargo install cargo-deny --locked
```

## Running tests

```bash
# Schema lint only (no API key required)
cargo test

# BAML function tests (requires API key)
npx @boundaryml/baml-cli test

# Benchmarks
cargo bench
```
