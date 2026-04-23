import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { buildServer } from "../src/mcp.js";
import { buildReviewPrompt, FOCUS_OPTIONS } from "../src/review.js";

// ── prompt builder ────────────────────────────────────────────────────────────

test("buildReviewPrompt includes the diff", () => {
  const prompt = buildReviewPrompt("diff --git a/foo.js", "all");
  assert.match(prompt, /diff --git a\/foo\.js/);
});

test("buildReviewPrompt embeds focus instruction for security", () => {
  const prompt = buildReviewPrompt("...", "security");
  assert.match(prompt, /OWASP/i);
  assert.doesNotMatch(prompt, /naming/i);
});

test("buildReviewPrompt embeds focus instruction for logic", () => {
  const prompt = buildReviewPrompt("...", "logic");
  assert.match(prompt, /edge cases/i);
});

test("buildReviewPrompt falls back to all on unknown focus", () => {
  const prompt = buildReviewPrompt("...", "nonsense");
  assert.match(prompt, /security/i);
  assert.match(prompt, /edge cases/i);
});

test("FOCUS_OPTIONS contains expected values", () => {
  for (const v of ["all", "security", "logic", "style"]) {
    assert.ok(FOCUS_OPTIONS.includes(v), `missing: ${v}`);
  }
});

// ── MCP review_code tool ──────────────────────────────────────────────────────

async function withMcpServer(fetchImpl, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cgemini-review-test-"));
  const saved = { ...process.env };
  process.env.CGEMINI_CONFIG_DIR = dir;
  delete process.env.CGEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.CGEMINI_MODEL;

  const server = buildServer({ fetchImpl });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientT);

  try {
    await fn(client, dir);
  } finally {
    await client.close();
    await server.close();
    process.env = saved;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function okFetch(text) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] })
  });
}

test("review_code tool is listed alongside ask_gemini", async () => {
  await withMcpServer(okFetch("ok"), async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    assert.ok(names.includes("ask_gemini"));
    assert.ok(names.includes("review_code"));
  });
});

test("review_code returns Gemini review text", async () => {
  await withMcpServer(okFetch("LGTM — no issues found."), async (client, dir) => {
    await fs.writeFile(path.join(dir, "config.json"), JSON.stringify({ apiKey: "k" }));
    const result = await client.callTool({
      name: "review_code",
      arguments: { diff: "diff --git a/foo.js\n+const x = 1;" }
    });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /LGTM/);
  });
});

test("review_code accepts focus argument and passes it through", async () => {
  let capturedUrl;
  const fetchImpl = async (url, opts) => {
    capturedUrl = url;
    const body = JSON.parse(opts.body);
    const prompt = body.contents[0].parts[0].text;
    assert.match(prompt, /OWASP/i, "security focus prompt should mention OWASP");
    return {
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "Needs changes." }] } }] })
    };
  };
  await withMcpServer(fetchImpl, async (client, dir) => {
    await fs.writeFile(path.join(dir, "config.json"), JSON.stringify({ apiKey: "k" }));
    const result = await client.callTool({
      name: "review_code",
      arguments: { diff: "...", focus: "security" }
    });
    assert.equal(result.isError, undefined);
    assert.ok(capturedUrl, "fetch should have been called");
  });
});

test("review_code returns error when diff is empty", async () => {
  await withMcpServer(okFetch("ok"), async (client, dir) => {
    await fs.writeFile(path.join(dir, "config.json"), JSON.stringify({ apiKey: "k" }));
    const result = await client.callTool({
      name: "review_code",
      arguments: { diff: "   " }
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /diff/i);
  });
});

test("review_code returns error when API key is missing", async () => {
  await withMcpServer(okFetch("ok"), async (client) => {
    const result = await client.callTool({
      name: "review_code",
      arguments: { diff: "diff --git a/foo.js" }
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /api key/i);
  });
});
