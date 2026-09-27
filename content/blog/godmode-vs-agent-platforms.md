---
title: "Method, package, runtime: three layers of agent tooling"
date: 2026-08-23
description: "A reader-first model for separating development methodology, workflow packaging, and agent runtime execution."
---

Agent tools become confusing when every product is described as an "agent platform."
The label can refer to instructions that shape how an agent works, a package that
installs those instructions, or a program that actually calls a model and executes
tools. Those are different responsibilities.

A more useful model has three layers:

1. **Development methodology** defines how work should proceed: clarify the goal,
   design, plan, test, review, verify, and finish.
2. **Workflow packaging** delivers reusable skills, agents, hooks, commands, and
   integrations to a host such as Claude Code.
3. **Runtime execution** runs the agent loop: send context to a model, receive a
   response, invoke tools, record events, and continue until the task stops.

Projects can cover more than one layer; the point is to ask which layer owns each decision.

## Walk through one agent task

Suppose I ask an agent to add an export command to an application.

At the **methodology layer**, the request becomes a sequence of engineering decisions.
The agent confirms the expected file format, identifies affected components, writes a
plan, adds a failing test, implements the smallest change, runs checks, and requests a
review. This layer answers: _What counts as responsible progress?_

At the **packaging layer**, the host discovers the relevant workflow. A plugin might
provide an `export-feature` skill, a review agent, a pre-commit hook, and a command that
chains them together. Claude Code plugins can package skills, agents, hooks, commands, and
MCP server configuration; the host loads those components and decides when or how to invoke them.
This layer answers: _How does the workflow reach the agent session?_

At the **runtime layer**, software assembles the conversation, sends it to a model
provider, interprets any requested tool calls, applies safety checks, stores events, and
feeds tool results back into the next model turn. This layer answers: _What actually runs
the model-and-tools loop?_

The same task can involve all three layers without any one tool owning all three:

```text
request
  -> methodology chooses the next engineering step
  -> plugin exposes the skill, agent, hook, or command
  -> runtime calls the model and executes approved tools
  -> results return to the methodology for the next decision
```

This distinction also clarifies two overloaded terms.

A **skill** is guidance the model can load for a kind of work. It can direct tool use,
but prose alone is not a model provider or tool executor.

A **Claude Code plugin** distributes extensions such as skills, specialized agents,
event hooks, commands, or MCP configuration. It extends the host; it does not replace
Claude Code's own agent runtime merely by existing.

With that model in place, Godmode, Atelier, and Braid become useful case studies rather
than three vaguely comparable "platforms."

## Case study: Godmode owns development state

[Godmode](https://github.com/89jobrien/godmode) describes itself as a Rust-native
development methodology plugin for Claude Code. It combines procedural skills with a
CLI-backed task graph.

Its important boundary is between guidance and state. Skills tell the coding agent how
to brainstorm, plan, debug, test, review, or verify. The CLI records task status and
dependency relationships in `.ctx/godmode/tasks.yaml`, allowing the work graph to survive
beyond one chat session.

For the export example, Godmode can represent a chain such as:

```yaml
tasks:
  - id: test-export
    title: Add a failing export test
    status: pending
    depends_on: []

  - id: implement-export
    title: Implement export behavior
    status: pending
    depends_on: [test-export]
```

The CLI can identify runnable tasks, reject a start when dependencies remain unfinished,
and emit independent task chains for bounded parallel dispatch. Its documented pre-commit
hook can also block commits while tasks are still running and run Rust quality gates.

**Godmode can:**

- define and distribute a software-development method;
- persist task states and causal dependencies;
- expose machine-readable status and dispatch plans;
- coordinate session start, task transitions, verification, and handoff;
- ask a host coding agent to delegate independent work.

**Godmode cannot, by itself:**

- act as a general model-provider loop;
- turn a model response into arbitrary tool execution without a host agent harness;
- replace an application runtime such as Braid;
- guarantee good engineering merely because a skill was installed.

Claude Code still runs the coding session. Godmode makes the development process around
that session explicit, durable, and partly enforceable. Its README credits
[Superpowers](https://github.com/obra/superpowers) as the methodological ancestor, while
moving stateful task-graph operations into a Rust CLI.

Godmode therefore spans the methodology layer and part of the packaging layer. Its CLI
adds governed workflow state, but it is not the runtime executing a general-purpose
agent's provider and tool loop.

## Case study: Atelier packages a workshop

[Atelier](https://github.com/89jobrien/atelier) is a personal development-workflow plugin.
Its published interface is a collection of focused skills for onboarding, Rust gates,
review fixes, hook diagnostics, Git safety, CI assistance, project summaries, and
handoffs.

Atelier's architecture is intentionally compositional. Its README says its agent wrappers
delegate their logic to `devkit`, and its session-start chain requires
[`sanctum`](https://github.com/89jobrien/sanctum). Atelier provides convenient doors into
those capabilities rather than absorbing every implementation into one program.

For the export task, an Atelier skill could select the repository's preferred quality
gate, invoke a review workflow, or capture a handoff. The plugin gives Claude Code a
shared vocabulary and repeatable entry points for those operations.

**Atelier can:**

- package reusable development skills for Claude Code;
- wrap existing review, CI, Git-safety, and handoff workflows;
- compose specialized companion tools behind a consistent interface;
- make a personal toolchain easier to invoke from an agent session.

**Responsibilities Atelier does not document or provide:**

- delegated agent logic when its companion tools are absent;
- serve as a standalone model-provider and tool-execution engine;
- persist a causal development task graph in the way Godmode documents;
- become a product runtime merely because it bundles agent-facing workflows.

Atelier is the clearest example of the packaging layer. Thinness is not an omission if
the goal is composition. A well-made plugin can be valuable precisely because it gives a
host stable entry points into tools that retain their own responsibilities.

## Case study: Braid executes agents

[Braid](https://github.com/89jobrien/braid) describes a Rust-first personal agent
platform. Its workspace includes domain models, provider and tool-executor ports, a
runtime engine, provider adapters, redaction, hook-gated tool execution, an MCP server,
event storage, context assembly, a command-line interface, and a terminal inspector.

Those are runtime concerns. A provider port separates the engine from a particular model
backend. A tool-executor port separates requested actions from their implementation.
Redaction and hooks sit near execution boundaries, while event storage and the inspector
make a running session observable.

For the export task, Braid can be the program that sends the request and repository
context to a model, receives a tool call, checks it, executes it, stores the resulting
event, and starts the next turn.

**Braid can:**

- run a model-and-tools agent loop;
- support provider and tool implementations through explicit ports;
- apply redaction and pre/post execution hooks;
- assemble context and persist session events;
- expose operator interfaces through a CLI, MCP server, and terminal UI.

**Responsibilities Braid does not provide by itself:**

- supply a complete software-development methodology simply by running an agent;
- decide that every project should use Godmode's phases or task graph;
- make Atelier's external companion tools available unless integrated;
- eliminate the need for policies, skills, tests, and human judgment above the engine.

Braid occupies the runtime layer. It could load or cooperate with packaged workflows,
and those workflows could follow a methodology, but its defining responsibility is
executing and observing agents.

## Compare responsibilities, not feature counts

| Project | Primary layer                              | Owns                                                     | Does not replace              |
| ------- | ------------------------------------------ | -------------------------------------------------------- | ----------------------------- |
| Godmode | Methodology plus stateful workflow support | Development phases, task graph, gates, dispatch shape    | General agent runtime         |
| Atelier | Workflow packaging                         | Skills and entry points into companion tools             | Delegated tools or model loop |
| Braid   | Runtime execution                          | Provider loop, tools, safety boundaries, context, events | Development methodology       |

This is a responsibility map, not a benchmark. Hooks appear in both plugins and runtimes,
for example, but they guard different boundaries. A plugin hook can react to events in a
coding host. A runtime hook can gate a tool invocation inside an agent engine. Shared
vocabulary does not imply identical ownership.

The practical test is simple. When evaluating an agent tool, ask three questions:

1. If I change my engineering process, which component changes?
2. If I move from one coding host to another, which workflows must be repackaged?
3. If I switch model providers or tool backends, which runtime adapter changes?

If one answer is "everything," the system may be tightly coupled. If the answers point
to distinct boundaries, the architecture is easier to explain, test, and replace.

Godmode, Atelier, and Braid are not interchangeable. Godmode governs how development work
moves, Atelier packages ways to invoke a workshop, and Braid runs agents. Keeping those
layers separate makes both the overlap and the gaps easier to reason about.

## Public sources

- [Godmode README](https://github.com/89jobrien/godmode/blob/main/README.md)
- [Atelier README](https://github.com/89jobrien/atelier/blob/main/README.md)
- [Braid README](https://github.com/89jobrien/braid/blob/main/README.md)
- [Claude Code plugin documentation](https://code.claude.com/docs/en/plugins)
- [Superpowers README](https://github.com/obra/superpowers/blob/main/README.md)
