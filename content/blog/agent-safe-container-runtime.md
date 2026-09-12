---
title: Designing a Container Runtime an Agent Can Safely Operate
date: 2026-09-11
description: "What changed when Minibox stopped treating agent access as ordinary shell access with a different client."
taxonomies:
  tags: [agent-runtime, containers, security, software-architecture]
extra:
  related:
    [project:minibox, project:crux, post:policy-between-intent-and-effects]
---

The shortest path to an agent-controlled container runtime is to give the
agent a shell and tell it to run container commands. That also gives the agent
every typo, unsafe flag, and host-level escape hatch the shell can reach.

When I added agent access to Minibox, I took a different route. Its agent
interface is not a wrapper around `mbx`. It is another client of the same
daemon protocol, with a smaller set of capabilities and policy checks in front
of mutation.

## Start with inspection

An agent usually needs to understand the machine before it needs to change it.
Listing containers, reading a manifest, and fetching logs are useful during
diagnosis and comparatively easy to reason about. A policy-bounded,
ephemeral, unprivileged run can be useful too, although it is not a complete
sandbox and may pull a missing image into shared storage. Mounting a host
directory, enabling privileged mode, or explicitly changing shared runtime
state is a different class of operation.

I made the Minibox MCP server reflect that distinction. Inspection and
policy-bounded ephemeral runs are allowed by default. Explicit pull, stop, and
remove operations require a mutation opt-in, while privileged mode, bind
mounts, and host networking have separate controls. A run can still populate
the shared image cache when its image is missing.

This is less flexible than a shell, on purpose. The MCP surface exposes no
generic host-shell operation. Commands arrive as structured arguments to a
container run, while host-affecting capabilities are gated separately.

A typical diagnostic session can therefore stay read-only for most of its
life. The agent lists containers, reads the manifest for the one that failed,
and fetches its logs. If it decides a replacement container is needed, the
request changes category. Before execution, MCP validates the typed request
and gates privileged mode, bind mounts, and host networking. The daemon then
parses the image and applies its configured run policy. Minibox does not
currently interpret command semantics as policy.

The daemon also has its own runtime policy, which is concrete enough to inspect
in configuration:

```toml
[policy]
allow_privileged = false
allow_bind_mounts = false
```

Those settings are separate from the MCP server's agent policy. The MCP layer
decides which requests an agent may propose; daemon configuration decides
which capabilities the runtime will honor from any client. Neither layer asks
the model whether it thinks a mount is safe. A person can choose a different
policy for a controlled environment, but the default does not rely on good
judgment emerging from a prompt.

## Keep one authority

Minibox has a daemon and client split. I kept the `mbx` CLI, the MCP server,
and the Crux plugin on the same daemon protocol so they would not each grow
their own container lifecycle rules.

That matters because the daemon remains the common authority for effects and
run validation. MCP adds a separate agent policy that does not apply to the
CLI or Crux plugin. Native mode also checks for a root peer, while other
adapter suites rely primarily on socket permissions.

The same separation keeps platform details out of the policy model. Native
Linux and VM-backed macOS adapters do very different work underneath, but the
question "may this agent start a privileged container?" should not change with
the adapter.

The request path looks roughly like this:

```text
agent -> Minibox MCP tool -> policy check -> daemon protocol -> runtime adapter
```

Each boundary has one job. MCP turns a model request into a typed Minibox
operation. Policy decides whether that operation is available. The daemon
owns runtime state and validation. The adapter deals with the operating
system. Keeping those responsibilities separate makes a denial easier to
explain and a backend easier to replace.

It also gives me one place to watch the system. The read-only Minibox TUI polls
the same daemon's container list and displays its lifecycle event stream. That
is a live operational view, not a complete policy audit trail, but it avoids
reconstructing runtime state from the MCP transcript alone.

## Make the dangerous thing visible

Agent safety gets vague when every action is called a tool invocation. The
useful distinction is what happens after the call. Reading logs is not the
same class of event as attaching a host directory. Stopping a disposable test
container is not the same as removing shared state.

A good agent control surface names those differences. It gives inspection a
wide path, mutation a narrower one, and high-risk capabilities their own
decision points. It also leaves enough structured information for a person to
see what was requested and why it was denied.

The goal is not to make an agent incapable of operating infrastructure. The
goal is to let it do real work without making unrestricted shell access the
price of admission. Minibox became more useful to agents when it exposed less
of the machine and more of the domain.

That does not make Minibox a complete sandbox. The runtime still has platform
security work of its own, and a policy-approved operation can still be a bad
idea. The narrower claim is more practical: an agent interface should not be
more powerful than the task requires, and the component performing the side
effect should enforce that limit. Everything else is an instruction waiting
to be ignored.

## Sources

- [Minibox MCP policy](https://github.com/89jobrien/minibox/blob/main/crates/mcp/src/policy.rs)
- [Container tool request handling](https://github.com/89jobrien/minibox/blob/main/crates/mcp/src/tools/containers.rs)
- [Image mutation gate](https://github.com/89jobrien/minibox/blob/main/crates/mcp/src/tools/images.rs)
- [Daemon run and automatic image pulling](https://github.com/89jobrien/minibox/blob/main/crates/minibox/src/daemon/handler/run.rs)
- [Daemon configuration and runtime policy](https://github.com/89jobrien/minibox/blob/main/crates/miniboxd/src/config.rs)
- [Daemon policy composition](https://github.com/89jobrien/minibox/blob/main/crates/minibox/src/daemon/handler/mod.rs)
- [Daemon request authority and peer checks](https://github.com/89jobrien/minibox/blob/main/crates/minibox/src/daemon/server.rs)
- [Crux daemon client](https://github.com/89jobrien/minibox/blob/main/crates/minibox-crux-plugin/src/lib.rs)
- [Adapter registry](https://github.com/89jobrien/minibox/blob/main/crates/miniboxd/src/adapter_registry.rs)
- [TUI daemon event client](https://github.com/89jobrien/minibox/blob/main/crates/minibox-tui/src/event.rs)
