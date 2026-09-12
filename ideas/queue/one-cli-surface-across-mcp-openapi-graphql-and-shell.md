---
title: "One CLI Surface Across MCP, OpenAPI, GraphQL, and Shell"
date: 2026-09-09
status: seed
priority: P2
theme: tool-interfaces
effort: medium
---

## Hook

MCP tools, OpenAPI operations, GraphQL fields, and shell subcommands all describe callable capabilities, but each makes users and agents learn a different discovery and invocation model. Normalizing them into one CLI is useful precisely where their differences refuse to disappear.

## Thesis

A unified tool surface should normalize discovery and invocation while preserving backend-specific semantics instead of pretending every protocol is identical.

## Reader Value

### Engineers

Design guidance for building protocol bridges without collapsing authentication, streaming, schemas, and errors into a misleading lowest common denominator.

### Decision-makers

A clearer explanation of when interface normalization reduces integration cost and when it merely hides complexity.

## Evidence

- Mcpipe's MCP stdio, MCP HTTP/SSE, OpenAPI, GraphQL, and CLI backends.
- Shared command discovery, argument parsing, output formatting, and caching.
- Backend-specific authentication and transport constraints.
- One operation expressed through two unlike protocols for comparison.

## Mini Outline

1. Invoke the same conceptual operation through several native interfaces.
2. Identify the common capability model mcpipe can safely normalize.
3. Show the semantics that must remain backend-specific.
4. Derive rules for honest abstraction boundaries.

## Readiness

**Known gaps:** The article needs one side-by-side command transcript with comparable operations across at least three backends.

**Next action:** Choose a small service exposed through OpenAPI, GraphQL, and an MCP wrapper and record the normalized calls.
