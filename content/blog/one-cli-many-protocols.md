---
title: One CLI Surface Across MCP, OpenAPI, GraphQL, and Shell
date: 2026-09-11
description: "What mcpipe can normalize across tool protocols, and what an honest abstraction has to leave different."
taxonomies:
  tags: [cli, developer-experience, integration, mcp]
extra:
  related: [project:mcpipe, post:machine-readable-cli]
---

The protocols aren't the same. The repeated work around them is.

MCP, OpenAPI, GraphQL, and manifest-compatible CLIs all describe callable operations. `mcpipe`
normalizes that overlap into discovery and execution. The real port is in `src/backend/mod.rs`:

```rust
#[async_trait]
pub trait Backend: Send + Sync {
    async fn discover(&self) -> Result<Vec<CommandDef>, BackendError>;
    async fn execute(
        &self,
        cmd: &CommandDef,
        args: ArgMap,
    ) -> Result<serde_json::Value, BackendError>;
}
```

## Normalize discovery first

Discovery is the useful common operation. Before a person or agent can call anything, it needs
names, descriptions, required arguments, and enough schema to construct values.

The MCP adapter requests `tools/list`, then maps each `inputSchema` into the common model. Source:
`src/backend/mcp.rs` (shortened).

```rust
let result = session
    .send_request("tools/list", serde_json::json!({}))
    .await?;
let tools = result
    .get("tools")
    .and_then(|value| value.as_array())
    .cloned()
    .unwrap_or_default();
let cmds = tools_to_commands(&tools);
```

OpenAPI starts from paths and HTTP methods. Its adapter keeps each parameter's original name and
location because execution still needs to distinguish a path value from a header or request body.

That difference survives normalization in `src/domain.rs`:

```rust
pub struct ParamDef {
    pub name: String,
    pub original_name: String,
    pub required: bool,
    pub description: String,
    pub location: ParamLocation,
    pub schema: serde_json::Value,
}

pub enum ParamLocation {
    Body,
    Query,
    Path,
    Header,
    ToolInput,
}
```

The common argument map doesn't make those values interchangeable. The OpenAPI adapter still puts
them in different parts of the request.

{% raw %}

```rust
// src/backend/openapi.rs
match param.location {
    ParamLocation::Path => {
        url_path = url_path.replace(
            &format!("{{{}}}", param.original_name),
            val.as_str().unwrap_or(&val.to_string()),
        );
    }
    ParamLocation::Query => query_params.push((param.original_name.clone(), val.to_string())),
    ParamLocation::Body => {
        body_map.insert(param.original_name.clone(), val);
    }
    ParamLocation::Header => header_params.push((param.original_name.clone(), val.to_string())),
    ParamLocation::ToolInput => {}
}
```

{% endraw %}

## Keep the leaks visible

GraphQL is the clearest warning against overclaiming. A response can contain both `data` and
`errors`. The current adapter turns any `errors` member into `BackendError::Execution`, so partial
data is discarded.

It also discovers mutation fields but currently emits a query-shaped document during execution.
That is a real limit in `src/backend/graphql.rs`, not a detail the CLI can normalize away:

{% raw %}

```rust
let fields = per_call_fields
    .or_else(|| self.fields_override.clone())
    .unwrap_or_else(|| "id".to_string());
let query = format!("{{ {} {{ {} }} }}", call, fields);

if let Some(errors) = value.get("errors") {
    return Err(BackendError::Execution(errors.to_string()));
}
```

{% endraw %}

The CLI backend has different limits. Discovery requires `schema --json`, execution requires JSON
on stdout, and command names support at most one nested level. An arbitrary executable with prose
help does not satisfy that contract.

The split is explicit in `src/backend/cli.rs`:

```rust
let output = Command::new(&self.command)
    .args(["schema", "--json"])
    .output()
    .await?;
let manifest: CliManifest = serde_json::from_slice(&output.stdout)?;

let parts: Vec<&str> = cmd.name.splitn(2, '-').collect();
let mut argv: Vec<String> = parts.iter().map(|part| part.to_string()).collect();
argv.push("--json".to_string());
```

MCP stdio inherits the child process environment. HTTP/SSE, OpenAPI, and GraphQL can use request
headers. Authentication cannot become one universal flag without hiding where credentials live.

Errors are normalized just as narrowly. The categories are consistent, but typed HTTP status,
GraphQL partial data, MCP metadata, and process exit details are not preserved. Source:
`src/domain.rs`.

```rust
pub enum BackendError {
    Discovery(String),
    Execution(String),
    NotFound(String),
    Transport(String),
    Schema(String),
}
```

## Cache the catalog, not the claim

Remote discovery can be expensive. `mcpipe` caches catalogs for MCP HTTP, OpenAPI, and GraphQL
sources. MCP stdio and CLI sources are not cached. `--refresh` bypasses loading and saves a fresh
catalog.

The cache silently misses when an entry is expired, unreadable, or invalid. It does not explain
whether a missing operation came from stale discovery data. Source: `src/cache.rs`.

```rust
pub fn load(&self, source: &str) -> Option<Vec<CommandDef>> {
    let path = self.path(source);
    let modified = std::fs::metadata(&path).ok()?.modified().ok()?;
    let age = SystemTime::now().duration_since(modified).ok()?;
    if age >= self.ttl {
        return None;
    }
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}
```

One CLI works when the common model stays small. Discovery, argument capture, execution, and JSON
output fit. Protocol-specific transport, error, and authentication semantics do not disappear.

The abstraction is useful because the adapters remain different. `Backend` is the shared doorway,
not proof that every room behind it is the same.

```rust
pub type ArgMap = HashMap<String, serde_json::Value>;
```

## Sources

- [`Backend` contract](https://github.com/89jobrien/mcpipe/blob/a72418622baa38e852df286b5bcf5dc61e6b0b65/src/backend/mod.rs)
- [Common command and error types](https://github.com/89jobrien/mcpipe/blob/a72418622baa38e852df286b5bcf5dc61e6b0b65/src/domain.rs)
- [MCP adapter](https://github.com/89jobrien/mcpipe/blob/a72418622baa38e852df286b5bcf5dc61e6b0b65/src/backend/mcp.rs)
- [OpenAPI adapter](https://github.com/89jobrien/mcpipe/blob/a72418622baa38e852df286b5bcf5dc61e6b0b65/src/backend/openapi.rs)
- [GraphQL adapter](https://github.com/89jobrien/mcpipe/blob/a72418622baa38e852df286b5bcf5dc61e6b0b65/src/backend/graphql.rs)
- [CLI manifest adapter](https://github.com/89jobrien/mcpipe/blob/a72418622baa38e852df286b5bcf5dc61e6b0b65/src/backend/cli.rs)
- [Catalog cache](https://github.com/89jobrien/mcpipe/blob/a72418622baa38e852df286b5bcf5dc61e6b0b65/src/cache.rs)
