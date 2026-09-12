---
title: "Make Contract Drift Fail Before It Becomes Migration Work"
date: 2026-09-09
status: seed
priority: P2
theme: ci-contracts
effort: medium
---

## Hook

A shared type, CLI output, or protocol file can change cleanly in its own repository while silently creating work everywhere else. By the time downstream failures appear, an accidental edit has become a migration project.

## Thesis

Important contract surfaces should be explicitly named and hash-gated so every change is reviewed as a migration decision rather than discovered as downstream damage.

## Reader Value

### Engineers

A lightweight pattern for tracking contract files, acknowledging intentional changes, and propagating updates to consumers.

### Decision-makers

A way to make hidden integration risk visible before a local change consumes multiple teams' time.

## Evidence

- Taskit's named protocol surfaces and lockfile hashes.
- A drift failure before and after intentional lockfile update.
- Cross-repository examples such as a crate rename or JSON output change.
- The distinction between source compatibility, wire compatibility, and operational convention.

## Mini Outline

1. Start with a harmless local rename that creates distributed breakage.
2. Define which files behave as contracts even without a formal schema.
3. Walk through taskit's drift gate and explicit acknowledgement.
4. Explain when hashes help and when semantic conformance tests are still required.

## Readiness

**Known gaps:** The pitch needs one real drift report and the downstream consumers affected by that surface.

**Next action:** Select a recent taskit protocol-lock update and reconstruct the decision and propagation path.
