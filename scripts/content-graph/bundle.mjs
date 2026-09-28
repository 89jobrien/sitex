import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const entryPoint = resolve(projectRoot, "scripts/content-graph/ui.mjs");
const outputPath = resolve(projectRoot, "static/js/content-graph.js");

export async function buildContentGraphBundle() {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "iife",
    minify: true,
    target: ["es2022"],
    write: false,
  });
  return Buffer.from(result.outputFiles[0].contents);
}

export async function writeContentGraphBundle() {
  const bytes = await buildContentGraphBundle();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
}

export async function checkContentGraphBundle() {
  const [expected, actual] = await Promise.all([
    buildContentGraphBundle(),
    readFile(outputPath),
  ]);
  if (!expected.equals(actual)) {
    throw new Error("stale content graph bundle; run bun run graph:bundle");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === "--write") await writeContentGraphBundle();
  else if (mode === "--check") await checkContentGraphBundle();
  else throw new Error("expected --write or --check");
}
