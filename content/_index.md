---
title: "Joseph O'Brien"
sort_by: date
template: index.html
extra:
  role: "Agentic Systems Architect"
  focus:
    - Agentic systems
    - Rust platforms
    - AI and LLM infrastructure
    - Developer tooling
    - Reliability engineering
  featured_projects:
    - minibox
    - crux
    - taskit
---

I design and build agentic systems, developer platforms, and the infrastructure
that makes them dependable. My work covers LLM agents, container runtimes,
workflow engines, API tooling, and the safety controls that keep automated
systems observable and under human control.

Most of my systems work is in Rust. I also use Python for AI and data workflows,
Go for services and tooling, and Nushell for automation. I favor hexagonal
architecture, explicit error handling, strong tests, and adapters that let
external services change without pulling the core system apart.

I am most interested in the gap between a promising prototype and a system
people can actually operate. That means tracing decisions, recovering from
failed steps, enforcing policy around tool use, detecting drift, and giving
operators enough evidence to understand what happened.

My current projects explore those problems from several directions. They
include an agent-controllable container runtime, a typed workflow runtime for
agent pipelines, a Rust CI and task engine, code quality systems, secret
detection, semantic retrieval, and tools that turn APIs into usable command
interfaces.

See [projects](@/projects/_index.md) for write-ups, or [the blog](@/blog/_index.md) for
longer-form notes.
