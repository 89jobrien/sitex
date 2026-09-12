---
title: "Hexagonal Architecture Is a Change-Budget Tool"
date: 2026-09-09
status: seed
priority: P3
theme: software-architecture
effort: large
---

## Hook

Ports and adapters are often presented as diagram purity. Their practical value appears later, when a runtime, provider, storage engine, or platform must change and the team discovers how much of the system knew about the old choice.

## Thesis

Hexagonal architecture earns its cost by limiting the number of places that must change when an external capability is replaced.

## Reader Value

### Engineers

A concrete way to evaluate ports by expected change paths rather than by abstract layering rules.

### Decision-makers

A translation of architectural boundaries into migration cost, delivery risk, and option value.

## Evidence

- Minibox runtime adapters across Linux and VM-backed macOS.
- Doob's issue-tracker port and provider adapters.
- Crux provider and handler boundaries.
- One migration where a stable domain trait reduced the changed surface and one where a leaky boundary did not.

## Mini Outline

1. Begin with a forced backend replacement rather than an architecture diagram.
2. Count what changes with and without a stable port.
3. Compare several workspace boundaries and their reasons for existing.
4. Explain when the abstraction cost is premature.
5. Offer a change-budget test for proposed ports.

## Readiness

**Known gaps:** The post needs measurable before-and-after change surfaces from a real adapter migration.

**Next action:** Choose one completed backend replacement and count touched modules, tests, and public interfaces.
