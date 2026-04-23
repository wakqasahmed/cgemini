import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { loginCommand } from "./commands/login.js";
import { configCommand } from "./commands/config.js";
import { promptCommand } from "./commands/prompt.js";
import { installCommand } from "./commands/install.js";
import { reviewCommand } from "./commands/review.js";

const HELP = `Usage: cgemini [command] [args]

Commands:
  cgemini "<prompt>"               Send a prompt to Gemini and print the response
  cgemini review                   Review a git diff with Gemini (independent code review)
    --staged | -s                    Review staged changes (git diff --cached)
    --last   | -l                    Review last commit (git diff HEAD~1)
    --head                           Review all uncommitted changes (git diff HEAD)
    --focus <area>                   Narrow the review: all | security | logic | style
    [file ...]                       Review specific files (git diff HEAD -- <files>)
    (no flags)                       Reads diff from stdin, or defaults to git diff HEAD
  cgemini login                    Interactively store your Gemini API key
  cgemini config set-key <key>     Save an API key to ~/.cgemini/config.json
  cgemini config set-model <model> Save the default model
  cgemini config show              Print effective configuration
  cgemini config remove-key        Remove the stored API key
  cgemini install                  Register the MCP server and /gemini slash command
                                   with Claude Code (for use in Conductor)
                                   Flags: --mcp-only | --slash-only | --force

Environment overrides:
  CGEMINI_API_KEY   overrides the stored key (GEMINI_API_KEY also accepted)
  CGEMINI_MODEL     overrides the stored model
  CGEMINI_CONFIG_DIR overrides the config directory (default ~/.cgemini)

Examples:
  cgemini "Summarize this repo in one sentence"
  cgemini review --staged
  cgemini review --last --focus security
  git diff | cgemini review
  cgemini config set-model models/gemini-2.5-pro
  cgemini install
`;

export async function run(argv) {
  const [first, ...rest] = argv;

  if (!first || first === "-h" || first === "--help" || first === "help") {
    process.stdout.write(HELP);
    return;
  }

  if (first === "-v" || first === "--version" || first === "version") {
    const version = await readVersion();
    process.stdout.write(version + "\n");
    return;
  }

  switch (first) {
    case "login":
      return loginCommand();
    case "config":
      return configCommand(rest);
    case "install":
      return installCommand(rest);
    case "review":
      return reviewCommand(rest);
    default:
      return promptCommand(argv);
  }
}

async function readVersion() {
  const pkgPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "package.json"
  );
  const raw = await readFile(pkgPath, "utf8");
  return JSON.parse(raw).version;
}
