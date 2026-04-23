import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const SLASH_COMMAND_DIR = path.join(os.homedir(), ".claude", "commands");
const SLASH_COMMAND_FILE = path.join(SLASH_COMMAND_DIR, "gemini.md");
const SLASH_COMMAND_BODY = `---
description: Ask Gemini and inject the response into this conversation
---

!cgemini "$ARGUMENTS"
`;

export async function installCommand(args) {
  const flags = parseFlags(args);
  let didAny = false;

  if (!flags.slashOnly) {
    didAny = installMcp(flags) || didAny;
  }
  if (!flags.mcpOnly) {
    didAny = (await installSlash(flags)) || didAny;
  }

  if (!didAny) {
    process.stderr.write("No changes were made.\n");
    return;
  }

  process.stderr.write(
    "\nInstalled. Try it in any Conductor workspace:\n" +
    "  - ask the agent: \"Use the ask_gemini tool to explain blockchain.\"\n" +
    "  - or type directly: /gemini Explain blockchain in simple terms\n"
  );
}

function parseFlags(args) {
  const flags = { mcpOnly: false, slashOnly: false, force: false };
  for (const a of args) {
    if (a === "--mcp-only") flags.mcpOnly = true;
    else if (a === "--slash-only") flags.slashOnly = true;
    else if (a === "--force") flags.force = true;
    else throw new Error(`Unknown install flag: ${a}`);
  }
  if (flags.mcpOnly && flags.slashOnly) {
    throw new Error("--mcp-only and --slash-only are mutually exclusive");
  }
  return flags;
}

function installMcp() {
  const claudePath = which("claude");
  if (!claudePath) {
    process.stderr.write(
      "⚠ `claude` CLI not found on PATH — skipping MCP registration.\n" +
      "  Install Claude Code (https://docs.anthropic.com/en/docs/claude-code) " +
      "and re-run `cgemini install`, or run `cgemini install --slash-only`.\n"
    );
    return false;
  }

  const result = spawnSync(
    claudePath,
    ["mcp", "add", "gemini", "-s", "user", "--", "cgemini-mcp"],
    { encoding: "utf8" }
  );

  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;

  if (result.status === 0) {
    process.stderr.write("✓ Registered MCP server `gemini` (user scope).\n");
    return true;
  }

  if (/already exists/i.test(combined)) {
    process.stderr.write("✓ MCP server `gemini` already registered — skipped.\n");
    return false;
  }

  process.stderr.write(
    `✗ Failed to register MCP server (exit ${result.status}):\n${combined.trim()}\n`
  );
  throw new Error("claude mcp add failed");
}

async function installSlash(flags) {
  await fs.mkdir(SLASH_COMMAND_DIR, { recursive: true });
  const existing = await readIfExists(SLASH_COMMAND_FILE);

  if (existing === SLASH_COMMAND_BODY) {
    process.stderr.write("✓ Slash command /gemini already up to date — skipped.\n");
    return false;
  }

  if (existing !== null && !flags.force) {
    process.stderr.write(
      `✗ ${SLASH_COMMAND_FILE} already exists with different contents.\n` +
      "  Re-run with --force to overwrite.\n"
    );
    throw new Error("slash command already exists");
  }

  await fs.writeFile(SLASH_COMMAND_FILE, SLASH_COMMAND_BODY);
  process.stderr.write(`✓ Wrote slash command to ${SLASH_COMMAND_FILE}\n`);
  return true;
}

async function readIfExists(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

function which(cmd) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8"
  });
  if (result.status !== 0) return null;
  const first = (result.stdout || "").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return first || null;
}
