import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const VERSIONED_ASSET = /\.(?:css|js)\?v=([a-zA-Z0-9._-]+)$/;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) return sourceFiles(url);
    return entry.name.endsWith(".js") ? [url] : [];
  }));
  return files.flat();
}

test("browser assets share one release token across the complete ESM graph", async () => {
  const html = await readFile(new URL("index.html", ROOT), "utf8");
  const references = [...html.matchAll(
    /(?:href|src)="([^"?#]+\.(?:css|js)(?:\?[^"#]*)?)"/g,
  )].map(([, reference]) => ({ source: "index.html", reference }));

  for (const file of await sourceFiles(new URL("src/", ROOT))) {
    const source = await readFile(file, "utf8");
    for (const [, reference] of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      references.push({ source: file.pathname.replace(ROOT.pathname, ""), reference });
    }
  }

  assert.ok(references.length > 2, "the test must inspect the entry assets and module imports");
  const tokens = new Set();
  for (const { source, reference } of references) {
    const match = reference.match(VERSIONED_ASSET);
    assert.ok(match, `${source} has an unversioned local browser asset: ${reference}`);
    tokens.add(match[1]);
  }
  assert.equal(tokens.size, 1, `browser assets use different release tokens: ${[...tokens]}`);
});
