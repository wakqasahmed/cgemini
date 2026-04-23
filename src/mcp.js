import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import { loadConfig, resolveApiKey, resolveModel } from "./config.js";
import { generate, FALLBACK_MODELS } from "./gemini.js";
import { buildReviewPrompt, FOCUS_OPTIONS } from "./review.js";

const ASK_GEMINI_TOOL = {
  name: "ask_gemini",
  description:
    "Ask Google Gemini a question and return its response. Uses the API key and model stored by cgemini (~/.cgemini/config.json) or CGEMINI_API_KEY / GEMINI_API_KEY env vars. Retries and falls back across models on transient errors.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The prompt to send to Gemini."
      },
      model: {
        type: "string",
        description: `Optional model override. Bare or qualified names accepted. Known models: ${FALLBACK_MODELS.join(", ")}.`
      }
    },
    required: ["prompt"],
    additionalProperties: false
  }
};

const REVIEW_CODE_TOOL = {
  name: "review_code",
  description:
    "Send a git diff to Gemini for an independent code review. Gemini acts as a reviewer that did not write the code — useful for catching blind spots after Claude has made changes. Returns a concise review with specific issues and a verdict (LGTM / needs changes).",
  inputSchema: {
    type: "object",
    properties: {
      diff: {
        type: "string",
        description: "The git diff to review (output of `git diff`, `git diff --cached`, etc.)."
      },
      focus: {
        type: "string",
        enum: FOCUS_OPTIONS,
        description: `What to focus on. "all" covers everything; others narrow the review. Options: ${FOCUS_OPTIONS.join(", ")}. Default: all.`
      },
      model: {
        type: "string",
        description: "Optional model override."
      }
    },
    required: ["diff"],
    additionalProperties: false
  }
};

export function buildServer({ fetchImpl } = {}) {
  const server = new Server(
    { name: "cgemini", version: "0.3.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [ASK_GEMINI_TOOL, REVIEW_CODE_TOOL]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    if (name === "ask_gemini") return handleAskGemini(args, fetchImpl);
    if (name === "review_code") return handleReviewCode(args, fetchImpl);
    return toolError(`Unknown tool: ${name}`);
  });

  return server;
}

async function handleAskGemini(args, fetchImpl) {
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (!prompt) return toolError("Missing required argument: prompt");

  const modelOverride = stringOrNull(args.model);
  try {
    const cfg = await loadConfig();
    const apiKey = resolveApiKey(cfg);
    const model = modelOverride || resolveModel(cfg);
    const { text, model: usedModel } = await generate({ apiKey, model, prompt, fetchImpl });
    return { content: [{ type: "text", text }], _meta: { model: usedModel } };
  } catch (err) {
    return toolError(err?.message || String(err));
  }
}

async function handleReviewCode(args, fetchImpl) {
  const diff = typeof args.diff === "string" ? args.diff.trim() : "";
  if (!diff) return toolError("Missing required argument: diff");

  const focus = FOCUS_OPTIONS.includes(args.focus) ? args.focus : "all";
  const modelOverride = stringOrNull(args.model);

  try {
    const cfg = await loadConfig();
    const apiKey = resolveApiKey(cfg);
    const model = modelOverride || resolveModel(cfg);
    const prompt = buildReviewPrompt(diff, focus);
    const { text, model: usedModel } = await generate({ apiKey, model, prompt, fetchImpl });
    return { content: [{ type: "text", text }], _meta: { model: usedModel, focus } };
  } catch (err) {
    return toolError(err?.message || String(err));
  }
}

function toolError(message) {
  return {
    isError: true,
    content: [{ type: "text", text: `cgemini error: ${message}` }]
  };
}

function stringOrNull(val) {
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

export async function runStdio() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
