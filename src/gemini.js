export const DEFAULT_MODEL = "models/gemini-2.5-flash";

export const FALLBACK_MODELS = [
  "models/gemini-2.5-flash",
  "models/gemini-2.5-flash-lite",
  "models/gemini-2.0-flash-001",
  "models/gemini-2.0-flash-lite-001",
  "models/gemini-2.5-pro",
  "models/gemini-pro-latest"
];

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeModel(name) {
  if (!name) return DEFAULT_MODEL;
  return name.startsWith("models/") ? name : `models/${name}`;
}

function buildModelChain(preferred) {
  const first = normalizeModel(preferred);
  const chain = [first];
  for (const m of FALLBACK_MODELS) {
    if (!chain.includes(m)) chain.push(m);
  }
  return chain;
}

async function callGemini({ apiKey, model, prompt, fetchImpl = fetch }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = new Error(
      body?.error?.message || `Gemini HTTP ${res.status}`
    );
    err.status = res.status;
    err.body = body;
    err.retryable = RETRYABLE_STATUSES.has(res.status);
    throw err;
  }

  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    const err = new Error("Gemini returned no text content");
    err.body = body;
    err.retryable = true;
    throw err;
  }
  return { model, text };
}

export async function generate({
  apiKey,
  model,
  prompt,
  attemptsPerModel = 2,
  fetchImpl
}) {
  if (!apiKey) throw new Error("Missing Gemini API key. Run `cgemini login` or set CGEMINI_API_KEY.");
  if (!prompt) throw new Error("Empty prompt");

  const models = buildModelChain(model);
  let lastError;

  for (const m of models) {
    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      try {
        return await callGemini({ apiKey, model: m, prompt, fetchImpl });
      } catch (err) {
        lastError = err;
        const unauthorized = err.status === 401 || err.status === 403;
        if (unauthorized) throw err;
        if (!err.retryable) break;
        if (attempt < attemptsPerModel) {
          await sleep(400 * attempt);
        }
      }
    }
  }

  throw lastError || new Error("All Gemini models failed");
}
