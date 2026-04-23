import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { DEFAULT_MODEL } from "./gemini.js";

export function configDir() {
  return process.env.CGEMINI_CONFIG_DIR
    || path.join(os.homedir(), ".cgemini");
}

export function configFile() {
  return path.join(configDir(), "config.json");
}

export async function loadConfig() {
  const file = configFile();
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw new Error(`Failed to read config at ${file}: ${err.message}`);
  }
}

export async function saveConfig(cfg) {
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  const body = JSON.stringify(cfg, null, 2) + "\n";
  await fs.writeFile(configFile(), body, { mode: 0o600 });
}

export async function updateConfig(patch) {
  const current = await loadConfig();
  const next = { ...current, ...patch };
  await saveConfig(next);
  return next;
}

export function resolveApiKey(cfg) {
  return process.env.CGEMINI_API_KEY
    || process.env.GEMINI_API_KEY
    || cfg.apiKey
    || null;
}

export function resolveModel(cfg) {
  return process.env.CGEMINI_MODEL
    || cfg.model
    || DEFAULT_MODEL;
}

export function maskKey(key) {
  if (!key) return null;
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
