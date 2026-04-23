import test from "node:test";
import assert from "node:assert/strict";

import { generate, DEFAULT_MODEL } from "../src/gemini.js";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

function textCandidate(text) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

test("generate returns text on happy path", async () => {
  const fetchImpl = async () => jsonResponse(textCandidate("hi there"));
  const out = await generate({
    apiKey: "k",
    model: DEFAULT_MODEL,
    prompt: "hello",
    fetchImpl
  });
  assert.equal(out.text, "hi there");
  assert.equal(out.model, DEFAULT_MODEL);
});

test("generate falls back to the next model on 503", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length < 3) return jsonResponse({ error: { message: "busy" } }, 503);
    return jsonResponse(textCandidate("recovered"));
  };
  const out = await generate({
    apiKey: "k",
    model: DEFAULT_MODEL,
    prompt: "hi",
    fetchImpl
  });
  assert.equal(out.text, "recovered");
  assert.ok(calls.length >= 3, "expected retry and fallback");
});

test("generate fails fast on 401 without trying fallbacks", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return jsonResponse({ error: { message: "unauthorized" } }, 401);
  };
  await assert.rejects(
    generate({ apiKey: "k", model: DEFAULT_MODEL, prompt: "hi", fetchImpl }),
    /unauthorized/i
  );
  assert.equal(calls, 1, "should not retry auth failures");
});

test("generate throws when API key is missing", async () => {
  await assert.rejects(
    generate({ apiKey: null, model: DEFAULT_MODEL, prompt: "hi" }),
    /api key/i
  );
});

test("generate normalizes bare model name", async () => {
  let usedUrl;
  const fetchImpl = async (url) => {
    usedUrl = url;
    return jsonResponse(textCandidate("ok"));
  };
  await generate({
    apiKey: "k",
    model: "gemini-2.5-flash",
    prompt: "hi",
    fetchImpl
  });
  assert.match(usedUrl, /models\/gemini-2\.5-flash:generateContent$/);
});
