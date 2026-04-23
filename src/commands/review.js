import { loadConfig, resolveApiKey, resolveModel } from "../config.js";
import { generate } from "../gemini.js";
import {
  buildReviewPrompt,
  DEFAULT_FOCUS,
  FOCUS_OPTIONS,
  readDiffFromGit,
  readDiffFromStdin
} from "../review.js";

export async function reviewCommand(args) {
  const { flags, files } = parseArgs(args);

  const diff = await resolveDiff(flags, files);
  if (!diff.trim()) {
    process.stderr.write("No diff to review — nothing changed.\n");
    process.exit(0);
  }

  const cfg = await loadConfig();
  const apiKey = resolveApiKey(cfg);
  const model = resolveModel(cfg);
  const prompt = buildReviewPrompt(diff, flags.focus);

  const { text } = await generate({ apiKey, model, prompt });
  process.stdout.write(text.endsWith("\n") ? text : text + "\n");
}

function parseArgs(args) {
  const flags = { staged: false, last: false, head: false, focus: DEFAULT_FOCUS };
  const files = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--staged" || a === "-s") {
      flags.staged = true;
    } else if (a === "--last" || a === "-l") {
      flags.last = true;
    } else if (a === "--head") {
      flags.head = true;
    } else if (a === "--focus" || a === "-f") {
      const val = args[++i];
      if (!val || !FOCUS_OPTIONS.includes(val)) {
        throw new Error(
          `--focus requires one of: ${FOCUS_OPTIONS.join(", ")}`
        );
      }
      flags.focus = val;
    } else if (a.startsWith("--focus=")) {
      const val = a.slice("--focus=".length);
      if (!FOCUS_OPTIONS.includes(val)) {
        throw new Error(`--focus requires one of: ${FOCUS_OPTIONS.join(", ")}`);
      }
      flags.focus = val;
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown review flag: ${a}`);
    } else {
      files.push(a);
    }
  }

  const gitModeCount = [flags.staged, flags.last, flags.head, files.length > 0].filter(Boolean).length;
  if (gitModeCount > 1) {
    throw new Error("Combine only one of --staged, --last, --head, or [files]");
  }

  return { flags: { ...flags, files }, files };
}

async function resolveDiff(flags, files) {
  const hasGitFlag = flags.staged || flags.last || flags.head || files.length > 0;
  if (hasGitFlag) {
    return readDiffFromGit({ ...flags, files }) || "";
  }
  if (!process.stdin.isTTY) {
    return readDiffFromStdin();
  }
  // No flags, interactive terminal — default to git diff HEAD (all uncommitted)
  process.stderr.write("No diff source specified — using `git diff HEAD`.\n");
  return readDiffFromGit({ head: true }) || "";
}
