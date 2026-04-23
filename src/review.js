import { spawnSync } from "node:child_process";

export const FOCUS_OPTIONS = ["all", "security", "logic", "style"];
export const DEFAULT_FOCUS = "all";

const FOCUS_INSTRUCTIONS = {
  security:
    "Focus exclusively on security issues: injection vulnerabilities, authentication/authorization flaws, secrets or credentials in code, insecure dependencies, input validation gaps, OWASP Top 10. Ignore style and minor logic issues.",
  logic:
    "Focus on correctness: bugs, logic errors, off-by-one errors, null/undefined handling, missing error handling, race conditions, and edge cases that could cause incorrect behavior or crashes. Ignore style issues.",
  style:
    "Focus on code clarity: naming, readability, structure, duplication, and patterns that make the code hard to maintain or understand. Note only style issues that could hide bugs or confuse future readers.",
  all:
    "Cover all categories: security vulnerabilities, logic bugs and edge cases, missing error handling, and clarity issues that could hide correctness problems."
};

export function buildReviewPrompt(diff, focus = DEFAULT_FOCUS) {
  const instruction = FOCUS_INSTRUCTIONS[focus] || FOCUS_INSTRUCTIONS.all;
  return `You are an expert code reviewer doing an independent review of a git diff.

${instruction}

Rules:
- Be specific: reference function names, variable names, or describe the location clearly.
- Skip praise and filler. Only call out real issues.
- If a section looks correct, say nothing about it — silence means approval.
- End with a one-line verdict: LGTM / LGTM with minor notes / Needs changes.

<diff>
${diff}
</diff>`;
}

export function readDiffFromGit(flags) {
  let gitArgs;

  if (flags.staged) {
    gitArgs = ["diff", "--cached"];
  } else if (flags.last) {
    gitArgs = ["diff", "HEAD~1"];
  } else if (flags.head) {
    gitArgs = ["diff", "HEAD"];
  } else if (flags.files && flags.files.length > 0) {
    gitArgs = ["diff", "HEAD", "--", ...flags.files];
  } else {
    return null;
  }

  const result = spawnSync("git", gitArgs, { encoding: "utf8" });

  if (result.status !== 0) {
    const msg = (result.stderr || "").trim() || `git ${gitArgs[0]} failed`;
    throw new Error(msg);
  }

  return result.stdout || "";
}

export function readDiffFromStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}
