import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  checkContentGraph,
  extractGraphLinks,
  generateContentGraph,
  writeContentGraph,
} from "./generate.mjs";

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

test("writes and checks canonical artifacts", async (context) => {
  const scratchRoot = `.ctx/_WORKING_DIR/content-graph-${process.pid}`;
  const outputPath = `${scratchRoot}/content-graph.json`;
  await mkdir(scratchRoot, { recursive: true });
  context.after(() => rm(scratchRoot, { recursive: true, force: true }));

  await writeContentGraph({ rootDir: fixturesRoot, outputPath });
  const firstWrite = await readFile(outputPath, "utf8");
  assert.match(firstWrite, /\n$/);
  await checkContentGraph({ rootDir: fixturesRoot, outputPath });

  await writeContentGraph({ rootDir: fixturesRoot, outputPath });
  assert.equal(await readFile(outputPath, "utf8"), firstWrite);

  await writeFile(outputPath, `${firstWrite} `);
  await assert.rejects(
    checkContentGraph({ rootDir: fixturesRoot, outputPath }),
    /stale content graph manifest; run bun run graph:data:write/,
  );
});
