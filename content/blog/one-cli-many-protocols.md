---
title: One CLI Surface Across MCP, OpenAPI, GraphQL, and Shell
date: 2026-09-11
description: "What mcpipe can normalize across tool protocols, and what an honest abstraction has to leave different."
taxonomies:
  tags: [cli, developer-experience, integration, mcp]
extra:
  related: [project:mcpipe, post:machine-readable-cli]
---

I kept meeting the same capability through different front doors. An MCP
server called it a tool. OpenAPI called it an operation. GraphQL exposed it as
a field. A compatible CLI described it through a JSON command manifest.

The underlying action might be "list issues" in every case, but discovering
and invoking it required a different client each time. `mcpipe` is my attempt
to give those capabilities one shell-shaped entrance without pretending the
protocols underneath are the same.

## Normalize the part people repeat

`mcpipe` can connect to an MCP server over stdio or HTTP/SSE, read an OpenAPI
specification, introspect GraphQL, or query a CLI that implements its
`schema --json` manifest contract. From there it builds a command surface that
supports the same basic habits: list available operations, search by name,
pass arguments, and format the result.

That shared layer is useful for people, scripts, and agents. I do not need a
new discovery workflow every time a tool provider chooses a different
transport. An agent can also reason about commands instead of carrying a
custom adapter for every schema source.

The value is not that a CLI is inherently better than MCP or GraphQL. The
value is that the caller can keep one interaction model while `mcpipe` handles
discovering commands from the selected backend.

The first operation is usually discovery:

```text
mcpipe --mcp-stdio "my-mcp-server" --list
mcpipe --spec ./openapi.yaml --list
mcpipe --graphql https://example.test/graphql --list
mcpipe --cli my-manifest-compatible-cli --list
```

Those commands start from very different source material. MCP returns tool
definitions. OpenAPI describes paths and operations. GraphQL exposes a type
system through introspection. The CLI backend expects a structured manifest
from `schema --json`. `mcpipe` turns each source into a list a person can
search and an agent can inspect before choosing an operation.

That discovery step is easy to overlook, but it is where a lot of integration
friction lives. Calling a known endpoint is straightforward. Figuring out what
can be called, which arguments are required, and how to present it consistently
is the work that otherwise gets rebuilt in every client.

## Do not normalize away the truth

The abstraction gets dishonest when it claims the backends are equivalent.
They are not.

OpenAPI starts with HTTP operations and status codes. GraphQL has selection
sets and a response that can contain both data and errors. MCP includes tool
metadata and transport behavior of its own. A shell command may expose only
prose help and process exit codes. Authentication, streaming, cancellation,
and schema quality differ too.

`mcpipe` therefore needs backend-specific adapters even though the user sees a
shared command shape. The common layer owns discovery, argument handling, and
output presentation. Today those adapters translate into a deliberately
limited common model; they do not preserve every backend semantic.

Authentication is a good example. An OpenAPI service may need an HTTP header.
An MCP stdio server may inherit credentials from the environment of the
process that starts it. A wrapped CLI may already own an authenticated session.
HTTP backends share repeatable header flags, while stdio and wrapped CLIs rely
on their process environment or existing configuration.

Errors expose a current limit of the abstraction. OpenAPI keeps status and body
text, and the CLI backend keeps stderr, but top-level errors generally become
strings. GraphQL partial data is discarded when the response also contains
errors. The common surface is convenient, but it is not yet a lossless error
model.

That boundary is the main design work. Parsing another schema is relatively
straightforward. Deciding which differences the caller must still see is
harder.

## The cache is part of the interface

Schema discovery can involve fetching a document or introspecting a remote
service. `mcpipe` caches command catalogs for MCP HTTP, OpenAPI, and GraphQL
sources; MCP stdio and CLI sources are not cached. `--refresh` bypasses catalog
loading and overwrites the cache after discovery.

The current cache does not tell the user that a missing operation came from
stale discovery data rather than the backend. That is a real seam the common
interface still needs to expose.

The recurring lesson in `mcpipe` is that a unified surface is not one giant
adapter. It is a small common model surrounded by honest translations. The
more carefully I preserve those seams, the more useful the common CLI becomes.

One CLI across several protocols is useful because the protocols are
different, not because they secretly were the same all along.

## Sources

- [`mcpipe` backend contract and adapter modules](https://github.com/89jobrien/mcpipe/blob/main/src/backend/mod.rs)
- [MCP stdio and HTTP/SSE adapter](https://github.com/89jobrien/mcpipe/blob/main/src/backend/mcp.rs)
- [OpenAPI adapter, headers, and HTTP errors](https://github.com/89jobrien/mcpipe/blob/main/src/backend/openapi.rs)
- [Common command model](https://github.com/89jobrien/mcpipe/blob/main/src/domain.rs)
- [CLI manifest contract](https://github.com/89jobrien/mcpipe/blob/main/src/backend/cli.rs)
- [GraphQL discovery and error handling](https://github.com/89jobrien/mcpipe/blob/main/src/backend/graphql.rs)
- [Catalog caching and refresh flow](https://github.com/89jobrien/mcpipe/blob/main/src/main.rs)
