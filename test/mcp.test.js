import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { buildServer } from "../src/mcp.js";

async function withServer(fetchImpl, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cgemini-mcp-test-"));
  const previousEnv = { ...process.env };
  process.env.CGEMINI_CONFIG_DIR = dir;
  delete process.env.CGEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.CGEMINI_MODEL;

  try {
    const server = buildServer({ fetchImpl });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);

    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientT);

    try {
      await fn(client, dir);
    } finally {
      await client.close();
      await server.close();
    }
  } finally {
    process.env = previousEnv;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function okResponse(text) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }]
    })
  };
}

test("ask_gemini tool is listed with expected schema", async () => {
  await withServer(() => Promise.reject(new Error("unused")), async (client) => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "ask_gemini");
    assert.ok(tool, "ask_gemini should be listed");
    assert.equal(tool.inputSchema.required[0], "prompt");
  });
});

test("ask_gemini returns Gemini text on success", async () => {
  const fetchImpl = async () => okResponse("blockchain is a distributed ledger");
  await withServer(fetchImpl, async (client, dir) => {
    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ apiKey: "test-key" })
    );

    const result = await client.callTool({
      name: "ask_gemini",
      arguments: { prompt: "Explain blockchain" }
    });

    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].type, "text");
    assert.match(result.content[0].text, /distributed ledger/);
  });
});

test("ask_gemini surfaces missing-key error as tool error", async () => {
  const fetchImpl = async () => { throw new Error("should not be called"); };
  await withServer(fetchImpl, async (client) => {
    const result = await client.callTool({
      name: "ask_gemini",
      arguments: { prompt: "hi" }
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /api key/i);
  });
});

test("ask_gemini rejects empty prompt", async () => {
  const fetchImpl = async () => { throw new Error("should not be called"); };
  await withServer(fetchImpl, async (client, dir) => {
    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ apiKey: "test-key" })
    );
    const result = await client.callTool({
      name: "ask_gemini",
      arguments: { prompt: "   " }
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /prompt/i);
  });
});

test("ask_gemini honors model override argument", async () => {
  let usedUrl;
  const fetchImpl = async (url) => {
    usedUrl = url;
    return okResponse("ok");
  };
  await withServer(fetchImpl, async (client, dir) => {
    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ apiKey: "test-key", model: "models/gemini-2.5-flash" })
    );
    await client.callTool({
      name: "ask_gemini",
      arguments: { prompt: "hi", model: "gemini-2.5-pro" }
    });
    assert.match(usedUrl, /models\/gemini-2\.5-pro:generateContent$/);
  });
});
