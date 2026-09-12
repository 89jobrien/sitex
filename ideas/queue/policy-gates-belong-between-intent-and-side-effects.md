---
title: "Policy Gates Belong Between Intent and Side Effects"
date: 2026-09-09
status: seed
priority: P3
theme: agent-governance
effort: medium
---

## Hook

Safety instructions placed before an agent reasons can be forgotten, and checks placed after a tool runs can only describe the damage. The useful control point is the narrow moment after intent is known but before the side effect begins.

## Thesis

Agent governance is most effective when policy evaluates a structured proposed action immediately before execution and records the decision.

## Reader Value

### Engineers

A reusable placement model for allow, deny, rewrite, approval, and audit controls around tool execution.

### Decision-makers

A way to evaluate whether an agent system can prevent risky actions rather than merely document them afterward.

## Evidence

- Minibox policy gates around mutating container operations.
- Development hooks that inspect commands before tool execution.
- Distinct outcomes for allow, deny, rewrite, and observe-only behavior.
- A comparison with prompt-only restrictions and post-hoc audit logs.

## Mini Outline

1. Trace one risky action through instruction, intent, policy, execution, and audit.
2. Show why controls placed earlier or later lose leverage.
3. Compare command hooks with capability-level policy gates.
4. Derive a general governance boundary for agent tools.

## Readiness

**Known gaps:** The examples must stay focused on policy placement rather than repeating the existing hook-rewrite migration story.

**Next action:** Build one shared diagram using a minibox mutation and a command rewrite as parallel examples.
