---
title: "Machine-Readable Output Changes Who a CLI Is For"
date: 2026-09-09
status: seed
priority: P2
theme: cli-design
effort: small
---

## Hook

Adding `--json` looks like an output-format feature. In practice it changes the CLI's consumers, compatibility obligations, error model, batch behavior, and definition of a stable interface.

## Thesis

Machine-readable output turns a human-operated CLI into an API and should be designed with the same contract discipline.

## Reader Value

### Engineers

Concrete rules for stable JSON shapes, exit codes, batch operations, context detection, and human-readable coexistence.

### Decision-makers

A way to recognize when a small automation request creates a long-lived integration surface.

## Evidence

- Doob's JSON todo output and documented exit codes.
- Batch add, complete, and remove operations.
- Git-based project and file context detection.
- A caller that depends on field names rather than terminal formatting.

## Mini Outline

1. Show the moment a shell command becomes another program's dependency.
2. Compare human output, JSON output, and exit-code contracts.
3. Use doob's batch and context behavior to expose design consequences.
4. End with a compatibility checklist for agent-first CLIs.

## Readiness

**Known gaps:** A concise consumer example is needed to demonstrate how a harmless field rename breaks automation.

**Next action:** Capture one doob JSON response and a minimal downstream parser, then simulate a shape change.
