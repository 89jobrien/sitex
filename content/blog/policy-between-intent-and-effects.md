---
title: Policy Gates Belong Between Intent and Side Effects
date: 2026-09-11
description: "What Minibox and Coursers taught me about placing safety checks after an action is understood but before it runs."
taxonomies:
  tags: [agent-harness, automation, security, software-architecture]
extra:
  related:
    [project:minibox, project:coursers, post:agent-safe-container-runtime]
---

I kept seeing safety guidance placed at one of two useless extremes. It appears in
the prompt before the agent has decided what to do, where it can be forgotten,
or in an audit log after the tool has run, where it can only explain the
damage.

The useful control point is between those moments: the action is concrete, but
the side effect has not started.

## Wait until the action has a shape

Policy needs something specific to evaluate. "Be careful with containers" is
not enough. "Run this image with a host bind mount and privileged mode" has
the information needed for a decision.

Minibox applies that point at both the MCP and daemon boundaries. MCP gates
explicit pull, stop, and remove operations and separately controls privileged
mode, bind mounts, and host networking. The daemon independently enforces
bind-mount and privileged-run policy for every external client, although an
allowed run may auto-pull a missing image.

The agent gets room to decide what operation it wants. Minibox gets the last
word before that operation changes the machine.

The policy decision is stronger when it receives a structured action rather
than raw prose. In simplified form, the run arguments look like this:

```json
{
  "image": "alpine",
  "command": ["/bin/sh"],
  "mounts": [
    {
      "host_path": "/absolute/workspace",
      "container_path": "/work",
      "read_only": true
    }
  ],
  "privileged": false
}
```

The request keeps image, command, mounts, network, and privilege fields
distinct. Current MCP policy evaluates mounts, privilege, and host networking;
it does not interpret command semantics. A shell policy that sees only an
opaque string has to parse intent back out of syntax.

This is why I prefer capability-level gates when the domain offers them. The
closer policy is to the operation, the less guessing it has to do.

## The same placement works for development tools

I use Coursers to apply the same pattern to shell commands. Its `crs` front
controller receives the exact command an agent proposes through a `PreToolUse`
hook. At that point it can pass the command through unchanged, rewrite it to a
configured preferred form, or deny it with a reason.

That is more useful than asking the model to remember every shell convention.
It is also more useful than scanning the transcript later and noticing that a
force push, credential mutation, service stop, or database drop already
happened.

Minibox and Coursers operate at different levels. Minibox understands domain
capabilities such as a privileged container. Coursers understands commands and
tool-use rules. The shared idea is the placement of the check: after intent
becomes inspectable, before execution makes it real.

Coursers also supports more than denial. A command can be rewritten to a
configured preferred form while the resulting command remains visible to the
caller. A tool-choice rule can reject shell `grep` and return guidance telling
the agent to use the dedicated Grep tool. A configured destructive-operation
rule can stop the invocation entirely.

Across policy systems, I think of the outcomes as a small vocabulary. Coursers
denies or rewrites matched actions and lets unmatched actions pass; approval
belongs in a broader control layer when a human decision is required:

- **Allow** when the action is within policy.
- **Rewrite** when the intent is acceptable but the mechanism should change.
- **Deny** when the capability is outside the agent's authority.
- **Approve** when a person must accept a specific side effect.

Keeping those outcomes distinct makes policy easier to review. A style
preference should not look like a denied production mutation, and an approval
should not be hidden inside a generic retry loop.

## Record matched decisions honestly

A policy gate should leave a reason behind. "Denied" is less useful than
"bind mounts are disabled for agent operations." A rewrite should show the
command that will actually run. Where a separate approval layer is involved,
it should identify the capability being granted rather than ask for vague
confirmation.

Coursers records matched denials, rewrites, and notifications. Silent passes
are not recorded, so it is not a complete action-decision-result audit trail.
That limitation should be explicit rather than hidden behind the word
"audit."

Prompts still matter. They help the agent choose sensible actions before a
gate is involved. Audit logs still matter. They help explain what happened
afterward. Neither replaces the narrow control point where the system can
understand an action and still stop it.

## Policy needs the same path as production

A gate is only real if the live execution path cannot step around it. I learned
that while working on Coursers: a rules file can be correct and a hook can look
configured while the actual front controller bypasses the rule set. Testing
the policy function is not enough. The request must be exercised through the
same command and configuration that an agent uses.

The same applies to an MCP adapter. If the CLI reaches the daemon through
policy but a second agent endpoint calls a runtime adapter directly, the
diagram has a gate and the system does not. One authority needs to own the
effect, and every client needs to cross it.

That operational check is what turns governance from documentation into
infrastructure. The rule and live path must agree, and matched policy decisions
should be recorded.

## Sources

- [Minibox MCP policy](https://github.com/89jobrien/minibox/blob/main/crates/mcp/src/policy.rs)
- [Minibox structured run arguments](https://github.com/89jobrien/minibox/blob/main/crates/mcp/src/types.rs)
- [Minibox container request validation](https://github.com/89jobrien/minibox/blob/main/crates/mcp/src/tools/containers.rs)
- [Minibox image mutation gate](https://github.com/89jobrien/minibox/blob/main/crates/mcp/src/tools/images.rs)
- [Minibox daemon policy composition](https://github.com/89jobrien/minibox/blob/main/crates/minibox/src/daemon/handler/mod.rs)
- [Minibox automatic image pulling](https://github.com/89jobrien/minibox/blob/main/crates/minibox/src/daemon/handler/run.rs)
- [Coursers front-controller path](https://github.com/89jobrien/coursers/blob/main/crates/coursers/src/crs_commands.rs)
- [Coursers pipeline actions](https://github.com/89jobrien/coursers/blob/main/crates/core/src/hook/pipeline.rs)
- [Coursers decision-log schema](https://github.com/89jobrien/coursers/blob/main/crates/core/src/hook/log.rs)
- [Coursers Grep guidance rule](https://github.com/89jobrien/coursers/blob/main/config/course-correct-rules.example.json)
- [Coursers destructive-operation gates](https://github.com/89jobrien/coursers/blob/main/.config/crs/plugins.d/godmode.toml)
- [Front-controller regression test](https://github.com/89jobrien/coursers/blob/main/crates/e2e/tests/pipeline.rs)
