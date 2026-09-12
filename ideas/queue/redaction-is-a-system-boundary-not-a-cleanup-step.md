---
title: "Redaction Is a System Boundary, Not a Cleanup Step"
date: 2026-09-09
status: seed
priority: P1
theme: privacy-architecture
effort: medium
---

## Hook

Most redaction happens after a log has already crossed the dangerous boundary: into a ticket, an LLM prompt, or a third-party service. By then the system is cleaning up exposure instead of preventing it.

## Thesis

Redaction belongs at the earliest outbound trust boundary and should preserve enough stable structure for the downstream task to remain useful.

## Reader Value

### Engineers

Guidance for placing redaction in pipelines and balancing privacy levels against diagnostic value.

### Decision-makers

A concrete way to ask where sensitive data leaves organizational control and what protection exists before that moment.

## Evidence

- Obfsck's Minimal, Standard, and Paranoid levels.
- Stable identifier mappings that preserve relationships without preserving identities.
- Pre-commit diff scanning and the alert analyzer's redact-before-LLM flow.
- Examples where over-redaction destroys debugging value and under-redaction leaks context.

## Mini Outline

1. Follow one sensitive log line through a typical support or AI workflow.
2. Identify the first irreversible trust-boundary crossing.
3. Compare tiered redaction outcomes and stable mappings.
4. Turn the example into placement and policy rules.

## Readiness

**Known gaps:** The post needs a compact before-and-after example that demonstrates retained relationships across several identifiers.

**Next action:** Produce one sanitized incident-style log at all three obfsck levels and compare diagnostic usefulness.
