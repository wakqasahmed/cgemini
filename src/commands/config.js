import {
  configFile,
  loadConfig,
  maskKey,
  resolveApiKey,
  resolveModel,
  saveConfig,
  updateConfig
} from "../config.js";

export async function configCommand(args) {
  const [sub, ...rest] = args;
  switch (sub) {
    case "set-key":
      return setKey(rest);
    case "set-model":
      return setModel(rest);
    case "show":
      return show();
    case "remove-key":
      return removeKey();
    default:
      throw new Error(
        "Unknown config subcommand. Use: set-key | set-model | show | remove-key"
      );
  }
}

async function setKey([key]) {
  if (!key) throw new Error("Usage: cgemini config set-key <api-key>");
  await updateConfig({ apiKey: key });
  process.stderr.write("API key saved.\n");
}

async function setModel([model]) {
  if (!model) throw new Error("Usage: cgemini config set-model <model>");
  await updateConfig({ model });
  process.stderr.write(`Default model set to ${model}\n`);
}

async function show() {
  const cfg = await loadConfig();
  const effectiveKey = resolveApiKey(cfg);
  const effectiveModel = resolveModel(cfg);
  const output = {
    configFile: configFile(),
    storedKey: maskKey(cfg.apiKey),
    storedModel: cfg.model || null,
    effectiveKey: maskKey(effectiveKey),
    effectiveModel,
    keySource: keySource(cfg),
    modelSource: modelSource(cfg)
  };
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

async function removeKey() {
  const cfg = await loadConfig();
  if (!cfg.apiKey) {
    process.stderr.write("No stored API key to remove.\n");
    return;
  }
  delete cfg.apiKey;
  await saveConfig(cfg);
  process.stderr.write("Removed stored API key.\n");
}

function keySource(cfg) {
  if (process.env.CGEMINI_API_KEY) return "env:CGEMINI_API_KEY";
  if (process.env.GEMINI_API_KEY) return "env:GEMINI_API_KEY";
  if (cfg.apiKey) return "config";
  return "unset";
}

function modelSource(cfg) {
  if (process.env.CGEMINI_MODEL) return "env:CGEMINI_MODEL";
  if (cfg.model) return "config";
  return "default";
}
