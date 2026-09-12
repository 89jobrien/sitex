---
title: "Treat Agent Prompts Like Interfaces"
date: 2026-09-09
status: seed
priority: P2
theme: prompt-engineering
effort: medium
---

## Hook

Teams edit agent instructions as prose but depend on them like code. A small wording change can alter tool choice, safety behavior, output shape, and downstream automation without any review of compatibility.

## Thesis

Operational prompts should be treated as behavioral interfaces with named inputs, explicit constraints, representative examples, and conformance checks.

## Reader Value

### Engineers

A method for separating intent from mechanism and testing prompt behavior across representative cases.

### Decision-makers

A governance model for understanding what changes when an agent's instructions are revised.

## Evidence

- Repository and global CLAUDE.md instruction layers.
- Skills that turn terse commands into structured workflows.
- Course-correction rules that enforce tool boundaries outside prompt prose.
- Before-and-after examples where wording changes alter observable behavior.

## Mini Outline

1. Present a one-line prompt edit with a surprisingly broad behavioral effect.
2. Map prompt components to familiar interface concepts.
3. Separate testable outcomes from model-specific phrasing.
4. Show where external enforcement is still required.
5. Propose a lightweight prompt conformance suite.

## Readiness

**Known gaps:** The argument needs three stable behavioral examples that can be tested without relying on exact model wording.

**Next action:** Select one tool-choice rule, one safety rule, and one output-shape rule and record pass/fail examples.
