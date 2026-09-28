---
title: Put Policy at the Edge of the Effect
date: 2026-09-11
description: "Automation is safer when intent becomes a structured request and policy runs immediately before the component that can cause the effect."
taxonomies:
  tags: [agent-harness, automation, security, software-architecture]
extra:
  related:
    [project:minibox, project:coursers, post:agent-safe-container-runtime]
---

```text
intent -> structured request -> policy decision -> effect
           "what, exactly?"     allow or deny      filesystem,
                                                   process, network,
                                                   or remote service
```

That sequence is the central safety pattern for automation. Let a person or
agent decide what it wants, turn that intent into explicit data, and evaluate
policy immediately before the component responsible for the side effect acts.

The timing matters. Before the request is structured, policy has too little
information. After execution, a log can explain an incident but cannot prevent
it.

## The four stages

**Intent** is a desired outcome: “run this program,” “publish this release,” or
“update that record.” Intent may begin as prose and may still be ambiguous.

A **structured request** names the operation and its security-relevant fields.
A container request, for example, can separate the image, command, network
mode, mounts, resource limits, and privileged flag. Policy no longer has to
guess those facts from a sentence or shell command.

A **policy decision** compares that request with rules and returns a small,
explicit result such as allow or deny. A useful denial also says which
capability was rejected and why.

The **effect owner** is the component that can actually change the world. It
holds the filesystem handle, process API, network client, database connection,
or daemon authority. The most important gate belongs at this boundary because
all accepted paths converge there.

“Immediately before” does not have to mean the final line before a system
call. It means after parsing and normalization, but before the operation starts
acquiring resources or making irreversible changes.

## Why instructions are not enforcement

A prompt can tell an agent not to use privileged containers or overwrite
production data. That guidance is valuable, but it is advisory. It competes
with every later instruction, depends on the model remembering it, and is
usually written before the exact request exists.

A check in the caller is stronger, but still incomplete. Systems gain new
callers over time: a command-line client, an HTTP endpoint, a scheduled job, or
another agent integration. One caller may forget the check, carry an older
version, or call a lower-level interface directly.

This is why safe systems use **defense in depth**: independent controls at
different boundaries. An early caller-side check gives fast feedback and
rejects obviously disallowed requests. A second check at the effect owner is
authoritative because bypassing one caller does not bypass the operation.
Operating-system isolation, least-privilege credentials, and audit records add
further layers.

These layers are not interchangeable. Prompts guide. Policy gates prevent.
Isolation limits damage. Logs support detection and investigation.

## Example one: Minibox container execution

[Minibox](https://github.com/89jobrien/minibox/blob/f75ef70c764b570554053f964cc1ba2deb85cb25/README.md)
is an open-source, agent-controllable container runtime written in Rust. A
daemon owns container lifecycle operations, while clients ask the daemon to
pull images, start containers, stop them, and remove them.

One client is its MCP server. The
[Model Context Protocol](https://modelcontextprotocol.io/specification/2025-06-18)
(MCP) is a standard way for an AI application to discover and call external
tools using structured messages. In this example, MCP is only the transport
and tool interface; it is not the policy itself.

A simplified run request looks like this:

```json
{
  "image": "alpine:3.20",
  "command": ["sh", "-lc", "make test"],
  "network": "none",
  "mounts": [],
  "privileged": false,
  "memory_limit_bytes": 536870912
}
```

This shape exposes facts that matter to policy. The MCP layer can reject a
privileged run, a host bind mount, or host networking unless that capability is
enabled. Pull, stop, and remove share a separate mutation permission. Those
checks are visible in the committed
[MCP policy implementation](https://github.com/89jobrien/minibox/blob/f75ef70c764b570554053f964cc1ba2deb85cb25/crates/mcp/src/policy.rs).

That is a useful first gate, but the MCP server is not the only possible
client. Treating it as the sole authority would make safety depend on every
caller using that adapter correctly.

Minibox therefore checks again inside the daemon. Its run handler validates
basic run policy before handing the request to container preparation. An
uncached image may then be retrieved. After that, Minibox builds an execution
manifest—a normalized description of the workload—and, when a manifest policy
has been configured, evaluates it before creating the overlay filesystem,
cgroup, or container-network resources. Standard daemon composition injects no
additional manifest policy. This optional gate precedes container setup, not
every possible preparatory side effect. The ordering is visible in the committed
[daemon run path](https://github.com/89jobrien/minibox/blob/f75ef70c764b570554053f964cc1ba2deb85cb25/crates/minibox/src/daemon/handler/run.rs).

The execution policy can constrain allowed and denied images, network modes,
privileged execution, memory, and host-mount prefixes. Its decision type has
only two outcomes: allow, or deny with a reason. See the committed
[execution policy](https://github.com/89jobrien/minibox/blob/f75ef70c764b570554053f964cc1ba2deb85cb25/crates/minibox-domain/src/execution_policy.rs).

The architecture also uses **ports and adapters**. A port is an interface the
core defines for something it needs, such as an image registry or container
runtime. An adapter connects that interface to a particular external system.
This separation makes implementations replaceable, but it also creates an
important policy lesson: a gate on one adapter cannot protect other adapters.
Rules that must apply to every run belong in the shared daemon path.

The two Minibox gates serve different purposes:

1. The MCP adapter rejects disallowed agent requests early.
2. The daemon protects the container operation regardless of which client sent
   it.

The second gate does not make the first redundant. It makes the system less
dependent on any single integration being perfect.

## Example two: Coursers command hooks

[Coursers](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/README.md)
is an open-source rule engine that course-corrects shell commands proposed by
AI coding tools. It can deny a command, rewrite it, emit a notification, run a
configured helper, or redact output.

Coursers receives **hook events**. A hook event is a structured callback from
the host application at a defined lifecycle point. A pre-tool-use event occurs
after the application knows the selected tool and its input, but before it
executes the tool. A post-tool-use event occurs after execution and can include
the result or exit status.

The pre-tool-use boundary produces the same sequence as the opening diagram:

```text
"inspect these files"
        -> { tool: "Bash", command: "..." }
        -> Coursers rules: allow, deny, or rewrite
        -> shell process starts
```

The command is concrete enough for rules to match, yet it has not run. A deny
can stop destructive syntax. A rewrite can preserve the goal while selecting a
safer or more reliable mechanism. The committed
[pipeline types and evaluator](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/core/src/hook/pipeline.rs)
show that the available actions form a closed set rather than arbitrary prose.

This is stronger than putting “never force-push” in a prompt because the host
invokes policy for the actual command. It is still not universal enforcement:
a shell launched outside the hooked application will not cross that boundary,
and the command rule cannot replace permissions enforced by Git hosting,
filesystem ownership, or the operating system.

The integration must also be tested through the configured command path. A
unit test can prove that a regex matches while the installed front controller
silently skips the rule set. Coursers includes an
[end-to-end regression test](https://github.com/89jobrien/coursers/blob/4931a35a669d3bff039d563394536e745a117cfc/crates/e2e/tests/pipeline.rs)
that sends a pre-tool-use payload through its real command entry point and
asserts that the entry point returns a denial. The host application is then
responsible for honoring that protocol response and suppressing execution.

## The practical design rule

For any automated operation, ask one question: which component can first make
the requested effect real?

Give that component a structured request, not prose. Normalize aliases and
validate malformed values before policy evaluation. Put the authoritative
decision on the path every caller must use. Return explicit outcomes and
human-readable denial reasons.

Then add—not substitute—supporting layers:

- guidance in prompts and user interfaces;
- early checks in adapters for fast feedback;
- authoritative checks at the effect owner;
- least-privilege operating-system and service credentials;
- records of the request, decision, and result;
- end-to-end tests proving denial happens before the effect.

One especially useful test installs a fake effect implementation that counts
calls. Submit a denied request and assert that the count remains zero. Another
uses an unreachable backend and checks that policy denial appears instead of a
connection error. Both test ordering, not merely rule correctness.

Structured requests do not solve every safety problem. A command field may
still contain a program with complex behavior, and policy can evaluate only
the facts it can see. The answer is to expose important capabilities as fields,
use conservative defaults, and keep lower-level containment in place.

The durable principle is simple: let automation form an intent, require it to
state that intent as data, and give the owner of the side effect the final
decision before anything changes.
