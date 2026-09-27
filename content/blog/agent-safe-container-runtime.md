---
title: Designing an Agent-Safe Container Interface
date: 2026-09-11
description: "A capability-scoped container interface that keeps inspection and ordinary runs available while gating dangerous operations."
---

An AI agent that can operate a container runtime can also ask that runtime to
read host files, share the host's network, consume all available memory, or run
with elevated privileges. The threat is not only a malicious prompt. A faulty
plan, compromised dependency, or ambiguous instruction can produce the same
request.

The unsafe design is familiar: give the agent a shell and rely on its prompt to
avoid dangerous flags. That makes a general-purpose command interpreter the
security boundary. Every shell feature, executable on `PATH`, and runtime flag
becomes part of the agent's authority.

An agent-safe interface should do the opposite:

- expose narrow, typed operations rather than arbitrary commands;
- separate inspection from mutation;
- deny dangerous capabilities unless an operator enables each one; and
- enforce policy again in the component that performs the effect.

Minibox is a small, open-source container runtime written in Rust. Like many
system services, it has a daemon/client architecture: a long-running process
named `miniboxd` owns container state and performs runtime operations, while
clients send it structured requests over a local Unix socket.

One of those clients is a Model Context Protocol server. MCP is an open
protocol through which an AI application discovers and calls named tools with
structured inputs. In this case, the MCP server translates tools such as
`minibox_ps`, `minibox_logs`, and `minibox_run` into Minibox daemon requests. It
does not give the agent a host shell.

## Follow the request all the way down

The safety argument only makes sense when the whole path is visible. A request
to run a container travels through these boundaries:

```text
AI agent
  -> MCP client in the AI application
  -> minibox-mcp stdio server
  -> typed RunContainerInput
  -> AgentPolicy validation
  -> typed DaemonRequest::Run
  -> MiniboxDaemonClient
  -> local Unix socket
  -> miniboxd request handler
  -> daemon ContainerPolicy and admission checks
  -> selected runtime, filesystem, network, and resource adapters
```

The MCP server is an adapter: it converts one protocol into another. The daemon
is the runtime boundary: it owns the state and is the last Minibox component
that can refuse a request before an adapter creates the container.

This separation matters because the MCP process is not the only possible
daemon client. A CLI or another integration can speak the daemon protocol too.
Agent-side checks reduce what the agent may request; daemon-side checks protect
the runtime from requests regardless of which client sent them.

## Prefer typed operations to shell strings

The `minibox_run` tool accepts a structured `RunContainerInput`. Image,
command arguments, environment variables, mounts, memory, CPU weight, network
mode, and privileged mode are independent fields.

That is safer than accepting a string such as `mbx run ...` for two reasons.
First, the adapter does not need to reconstruct intent by parsing shell syntax.
Second, policy can inspect the exact capability being requested. A non-empty
mount list means host filesystem access is being proposed; a `host` network
value means network isolation is being removed.

Minibox's MCP policy starts with no optional permissions, supplies bounded
resource requests, validates higher-risk fields, rejects unknown network
modes, and requires an explicit permission for host networking. Bridge and
tailnet modes remain valid without that host-network permission.

This abridged pseudocode preserves the public implementation's decisions:

```rust
pub const fn safe_default() -> Self {
    Self {
        permissions: Vec::new(),
        default_memory_limit_bytes: Some(512 * 1024 * 1024),
        default_cpu_weight: Some(100),
        max_output_bytes: 1024 * 1024,
    }
}

pub fn validate_run(&self, input: &RunContainerInput) -> Result<()> {
    if input.privileged.unwrap_or(false)
        && !self.allows(AgentPermission::Privileged)
    {
        return Err(policy_denied("privileged"));
    }
    if !input.mounts.is_empty()
        && !self.allows(AgentPermission::BindMounts)
    {
        return Err(policy_denied("bind mounts"));
    }

    let network = parse_network_mode(input.network.as_deref())?;
    if network == NetworkMode::Host
        && !self.allows(AgentPermission::HostNetwork)
    {
        return Err(policy_denied("host networking"));
    }

    require_non_empty(&input.image, "image")?;
    Ok(())
}
```

Error construction is condensed, but the defaults and checks are unchanged.
Parsing the network
mode before checking permission is important. A misspelling such as `hostt`
becomes invalid input rather than an unrecognized value that might evade a
string comparison.

## Separate inspection from mutation

Most troubleshooting begins with observation: check whether the daemon is
reachable, list containers and cached images, read logs, or retrieve an
execution manifest. Those tools are available under Minibox's default MCP
policy because they inspect existing state.

Pulling an image, stopping a container, and removing a container mutate shared
daemon state. Minibox denies those tools unless the operator explicitly enables
the MCP mutation permission. A normal run is deliberately different: an
ephemeral, auto-removed, unprivileged run is the core agent use case, so it is
allowed by default and receives memory and CPU defaults. Networking defaults to
`none`; bridge and tailnet remain valid requests, while host networking requires
permission.

That distinction is more useful than labeling every container operation either
"safe" or "unsafe." It asks what persistent effect the operation has and what
authority it adds.

## Treat runtime options as capabilities

A capability is an authority the request would gain, not merely another
configuration field.

A **bind mount** exposes a host directory inside the container. Even a
read-only mount can reveal source code, credentials, or private data, so the
MCP policy denies any bind mount by default.

**Host networking** places the container on the host's network stack instead
of Minibox's default `none` mode. That can expose local services and removes a
useful isolation boundary, so it has a separate opt-in. Bridge and tailnet are
different network modes and do not use that permission.

**Privileged mode** requests substantially elevated container authority. It is
not required for ordinary diagnostic commands and is independently denied.

**Resource requests** can constrain accidental denial of service when the
selected `ResourceLimiter` adapter enforces them. When the agent omits values, the MCP adapter
supplies a 512 MiB memory request and CPU weight 100. Some adapters, including
the committed GKE `NoopLimiter`, do not enforce those values. Collected daemon
responses are capped at 1 MiB by default, limiting unbounded tool output. The
operator can override that cap with `MINIBOX_MCP_MAX_OUTPUT_BYTES`.

The resulting policy is easier to review as a matrix:

| Operation or capability                     | MCP default    | Explicit opt-in           | Runtime-boundary check                |
| ------------------------------------------- | -------------- | ------------------------- | ------------------------------------- |
| Inspect containers, images, logs, manifests | Allow          | None                      | Daemon handles typed request          |
| Ephemeral unprivileged run                  | Allow          | None                      | Daemon admission and runtime setup    |
| Pull, stop, or remove                       | Deny           | Mutation permission       | MCP gate; daemon owns operation       |
| Bind mount                                  | Deny           | Bind-mount permission     | MCP gate and daemon `ContainerPolicy` |
| Bridge or tailnet networking                | Allow          | None                      | Runtime-specific network adapter      |
| Host networking                             | Deny           | Host-network permission   | MCP gate before daemon request        |
| Privileged mode                             | Deny           | Privileged permission     | MCP gate and daemon `ContainerPolicy` |
| Memory and CPU requests                     | Apply defaults | Caller may request values | Selected `ResourceLimiter` adapter    |
| Collected output                            | Default 1 MiB  | Environment override      | MCP adapter                           |

Separate switches avoid a single "unsafe mode" that grants unrelated powers.
An operator can permit image pulls without also permitting privileged
containers or host filesystem access.

## Recheck policy where effects happen

An adapter-side denial is necessary, but it is not sufficient. The Minibox
daemon applies its own `ContainerPolicy` before container creation. Bind mounts
and privileged mode default to denied there too, under daemon configuration
separate from the MCP permissions.

The two layers answer different questions:

- MCP policy: may this agent-facing tool propose the operation?
- daemon policy: may this runtime instance perform the operation?

For bind mounts and privileged mode, both answers must be yes. Enabling an MCP
permission alone does not force the daemon to honor it. This is the useful
defense-in-depth property: a mistake or future regression in the adapter does
not automatically remove the runtime's policy boundary.

The public implementation is not a claim of a perfect sandbox. The daemon's
`ContainerPolicy` covers bind mounts, privileged mode, and minimum execution
priority. A separate manifest-level `ExecutionPolicy` can constrain images,
network modes, mounts, memory, and privilege, but it is optional and defaults
to no additional manifest policy. The standard daemon composition injects no
run-admission `ExecutionPolicy`. MCP-specific mutation and host-network
permissions remain adapter-side controls. Minibox also documents security work
that remains, including capability dropping, seccomp filtering, user-namespace
remapping, and rootless operation.

That limitation reinforces the broader design rule. Each dangerous capability
should eventually be represented explicitly and checked by the component that
can exercise it. Prompts can explain intended behavior, but prompts are not
authorization systems.

## The reusable pattern

This architecture is not specific to containers. Any agent integration that
can alter infrastructure benefits from the same shape:

1. Replace a general shell with named operations and typed inputs.
2. Keep read-only inspection available without granting mutation.
3. Model sensitive options as independent, deny-by-default capabilities.
4. Supply conservative limits and verify the selected adapter enforces them.
5. Validate before protocol translation and again before the side effect.
6. Return structured denials so callers can distinguish policy from failure.

The goal is not to make every agent action harmless. It is to make authority
visible, narrow, and enforceable at boundaries the model cannot talk around.

## Sources

- [Minibox project overview and security model](https://github.com/89jobrien/minibox)
- [MCP tool permission model](https://github.com/89jobrien/minibox/blob/f75ef70c764b570554053f964cc1ba2deb85cb25/crates/mcp/README.md)
- [Typed MCP inputs](https://github.com/89jobrien/minibox/blob/f75ef70c764b570554053f964cc1ba2deb85cb25/crates/mcp/src/types.rs)
- [Agent policy and safe defaults](https://github.com/89jobrien/minibox/blob/f75ef70c764b570554053f964cc1ba2deb85cb25/crates/mcp/src/policy.rs)
- [Container tool request mapping](https://github.com/89jobrien/minibox/blob/f75ef70c764b570554053f964cc1ba2deb85cb25/crates/mcp/src/tools/containers.rs)
- [Daemon container policy](https://github.com/89jobrien/minibox/blob/f75ef70c764b570554053f964cc1ba2deb85cb25/crates/minibox/src/daemon/handler/mod.rs)
- [Manifest execution policy](https://github.com/89jobrien/minibox/blob/f75ef70c764b570554053f964cc1ba2deb85cb25/crates/minibox-domain/src/execution_policy.rs)
- [GKE resource-limiter adapter](https://github.com/89jobrien/minibox/blob/f75ef70c764b570554053f964cc1ba2deb85cb25/crates/minibox/src/adapters/gke.rs)
- [Model Context Protocol introduction](https://modelcontextprotocol.io/introduction)
