import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDocument } from "./core.mjs";

const projectInput = {
  sourcePath: "content/projects/minibox.md",
  frontmatter: {
    title: "Minibox",
    date: "2026-08-18",
    description: "A policy-gated container runtime.",
    taxonomies: {
      tags: ["systems-software", "containers", "security"],
    },
    extra: {
      related: ["post:agent-safe-container-runtime", "project:repro"],
    },
  },
  links: ["/blog/agent-safe-container-runtime/"],
};

test("normalizes content identity and metadata", () => {
  assert.deepEqual(normalizeDocument(projectInput), {
    id: "project:minibox",
    sourcePath: "content/projects/minibox.md",
    kind: "project",
    title: "Minibox",
    description: "A policy-gated container runtime.",
    date: "2026-08-18",
    route: "/projects/minibox/",
    tags: ["containers", "security", "systems-software"],
    relatedIds: ["post:agent-safe-container-runtime", "project:repro"],
    links: ["/blog/agent-safe-container-runtime/"],
  });

  assert.equal(
    normalizeDocument({
      ...projectInput,
      sourcePath: "content/blog/_index.md",
    }),
    null,
  );

  assert.equal(
    normalizeDocument({
      ...projectInput,
      sourcePath: "content/blog/draft.md",
      frontmatter: { ...projectInput.frontmatter, draft: true },
    }),
    null,
  );
});

test("rejects invalid graph metadata", () => {
  assert.throws(
    () =>
      normalizeDocument({
        ...projectInput,
        frontmatter: { ...projectInput.frontmatter, description: "" },
      }),
    /description must be a non-empty string/,
  );

  assert.throws(
    () =>
      normalizeDocument({
        ...projectInput,
        frontmatter: { ...projectInput.frontmatter, slug: "custom" },
      }),
    /custom slug or path overrides are unsupported/,
  );

  assert.throws(
    () =>
      normalizeDocument({
        ...projectInput,
        frontmatter: {
          ...projectInput.frontmatter,
          taxonomies: { tags: ["security", "security"] },
        },
      }),
    /tags must be unique/,
  );

  assert.throws(
    () =>
      normalizeDocument({
        ...projectInput,
        frontmatter: {
          ...projectInput.frontmatter,
          taxonomies: { tags: ["Not Valid"] },
        },
      }),
    /tags must use lowercase kebab-case/,
  );
});
