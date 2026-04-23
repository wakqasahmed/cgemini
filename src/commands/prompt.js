import { loadConfig, resolveApiKey, resolveModel } from "../config.js";
import { generate } from "../gemini.js";

export async function promptCommand(args) {
  const prompt = await readPrompt(args);
  if (!prompt) throw new Error("Empty prompt. Pass text as arguments or pipe via stdin.");

  const cfg = await loadConfig();
  const apiKey = resolveApiKey(cfg);
  const model = resolveModel(cfg);

  const { text } = await generate({ apiKey, model, prompt });
  process.stdout.write(text.endsWith("\n") ? text : text + "\n");
}

async function readPrompt(args) {
  const joined = args.join(" ").trim();
  if (joined) return joined;
  if (process.stdin.isTTY) return "";
  return await readStdin();
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data.trim()));
    process.stdin.on("error", reject);
  });
}
