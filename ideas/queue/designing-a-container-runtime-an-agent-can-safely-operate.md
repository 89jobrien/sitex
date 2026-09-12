---
title: "Designing a Container Runtime an Agent Can Safely Operate"
date: 2026-09-09
status: seed
priority: P1
theme: agent-safety
effort: large
---

## Hook

Giving an agent a container CLI is easy. Giving it a control surface where inspection is safe by default, mutations are explicit, and every action crosses the same policy boundary requires designing the runtime around agency rather than bolting an MCP server onto the side.

## Thesis

Agent-operable infrastructure should expose capabilities through policy-gated domain operations, not unrestricted shell access.

## Reader Value

### Engineers

A practical architecture for separating read-only inspection, controlled mutation, daemon authority, and adapter-specific behavior.

### Decision-makers

A checklist for distinguishing an agent integration from a product that merely lets a model invoke dangerous commands.

## Evidence

- Minibox's daemon and CLI split over a shared protocol.
- Read-only MCP inspection tools enabled by default.
- Policy-gated run, pull, stop, remove, bind-mount, and privileged operations.
- The port-and-adapter boundary shared by native Linux and VM-backed macOS runtimes.

## Mini Outline

1. Contrast shell access with a capability-oriented control surface.
2. Map inspection and mutation onto the minibox daemon boundary.
3. Show how policy remains stable while runtime adapters change.
4. Derive design rules for any infrastructure exposed to agents.

## Readiness

**Known gaps:** The article needs one end-to-end policy denial and audit trail captured from the MCP path.

**Next action:** Record an allowed inspection followed by a denied mutation using the same minibox session.
