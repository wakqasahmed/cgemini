import readline from "node:readline";
import { updateConfig } from "../config.js";

function promptHidden(query) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const onData = (char) => {
      const c = char.toString("utf8");
      if (c === "\n" || c === "\r" || c === "\r\n" || c === "\u0004") return;
      readline.moveCursor(process.stdout, -1, 0);
      readline.clearLine(process.stdout, 1);
      process.stdout.write(query + "*".repeat(rl.line.length));
    };

    process.stdin.on("data", onData);

    rl.question(query, (answer) => {
      process.stdin.removeListener("data", onData);
      rl.close();
      resolve(answer.trim());
    });
    rl.on("SIGINT", () => {
      process.stdin.removeListener("data", onData);
      rl.close();
      reject(new Error("Login cancelled"));
    });
  });
}

export async function loginCommand() {
  process.stderr.write(
    "Paste your Gemini API key (get one at https://aistudio.google.com/apikey).\n"
  );
  const key = await promptHidden("API key: ");
  process.stdout.write("\n");
  if (!key) throw new Error("No API key provided");
  await updateConfig({ apiKey: key });
  process.stderr.write("Saved API key to ~/.cgemini/config.json\n");
}
