import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { extractGraphLinks, generateContentGraph } from "./generate.mjs";

const fixturesRoot = fileURLToPath(new URL("./fixtures/", import.meta.url));

test("parses content relationships from markdown", async () => {
  const graph = await generateContentGraph({
    rootDir: fixturesRoot,
  });

  assert.deepEqual(
    graph.nodes.map(({ id }) => id),
    ["post:bravo", "project:alpha"],
  );
  assert.deepEqual(graph.nodes[0].backlinks, [{ id: "project:alpha" }]);
  assert.deepEqual(graph.edges, [
    {
      source: "post:bravo",
      target: "project:alpha",
      directed: true,
      evidence: [
        { kind: "explicit", declaredBy: "project:alpha" },
        { kind: "link", declaredBy: "project:alpha" },
        { kind: "tag", sharedTags: ["automation", "testing"] },
      ],
      tagSimilarity: 1,
    },
  ]);
});

test("ignores links outside graph content", () => {
  const body = [
    "[External](https://example.com/projects/alpha/)",
    "[Fragment](#section)",
    "[Asset](diagram.svg)",
    "[Copied docs](docs/architecture.md)",
    "[Machine path](/Users/joe/dev/alpha/README.md)",
  ].join("\n");

  assert.deepEqual(extractGraphLinks(body, "content/projects/alpha.md"), []);
});

test("rejects unresolved content-shaped links", async () => {
  await assert.rejects(
    generateContentGraph({
      rootDir: `${fixturesRoot}/invalid`,
    }),
    /unknown link target \/blog\/missing\//,
  );
});
