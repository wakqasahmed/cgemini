import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  configFile,
  loadConfig,
  maskKey,
  resolveApiKey,
  resolveModel,
  saveConfig,
  updateConfig
} from "../src/config.js";
import { DEFAULT_MODEL } from "../src/gemini.js";

async function withTempConfigDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cgemini-test-"));
  const previousEnv = { ...process.env };
  process.env.CGEMINI_CONFIG_DIR = dir;
  delete process.env.CGEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.CGEMINI_MODEL;
  try {
    await fn(dir);
  } finally {
    process.env = previousEnv;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("loadConfig returns empty object when no file", async () => {
  await withTempConfigDir(async () => {
    const cfg = await loadConfig();
    assert.deepEqual(cfg, {});
  });
});

test("saveConfig + loadConfig round-trips", async () => {
  await withTempConfigDir(async () => {
    await saveConfig({ apiKey: "abc123", model: "models/gemini-2.5-pro" });
    const cfg = await loadConfig();
    assert.equal(cfg.apiKey, "abc123");
    assert.equal(cfg.model, "models/gemini-2.5-pro");
  });
});

test("updateConfig merges without overwriting other fields", async () => {
  await withTempConfigDir(async () => {
    await saveConfig({ apiKey: "abc123", model: "m1" });
    await updateConfig({ model: "m2" });
    const cfg = await loadConfig();
    assert.equal(cfg.apiKey, "abc123");
    assert.equal(cfg.model, "m2");
  });
});

test("resolveApiKey prefers env over config", async () => {
  await withTempConfigDir(async () => {
    process.env.CGEMINI_API_KEY = "from-env";
    assert.equal(resolveApiKey({ apiKey: "from-file" }), "from-env");
  });
});

test("resolveApiKey falls back to GEMINI_API_KEY then config", async () => {
  await withTempConfigDir(async () => {
    process.env.GEMINI_API_KEY = "legacy-env";
    assert.equal(resolveApiKey({ apiKey: "from-file" }), "legacy-env");
    delete process.env.GEMINI_API_KEY;
    assert.equal(resolveApiKey({ apiKey: "from-file" }), "from-file");
    assert.equal(resolveApiKey({}), null);
  });
});

test("resolveModel prefers env, then config, then default", async () => {
  await withTempConfigDir(async () => {
    assert.equal(resolveModel({}), DEFAULT_MODEL);
    assert.equal(resolveModel({ model: "custom" }), "custom");
    process.env.CGEMINI_MODEL = "env-model";
    assert.equal(resolveModel({ model: "custom" }), "env-model");
  });
});

test("maskKey masks key in the middle", () => {
  assert.equal(maskKey(null), null);
  assert.equal(maskKey("short"), "***");
  assert.equal(maskKey("abcdefghij"), "abcd…ghij");
});

test("config file is written with 0600 permissions", async () => {
  await withTempConfigDir(async () => {
    await saveConfig({ apiKey: "secret" });
    const stat = await fs.stat(configFile());
    const mode = stat.mode & 0o777;
    assert.equal(mode, 0o600);
  });
});
