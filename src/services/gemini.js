const { GoogleGenerativeAI } = require("@google/generative-ai");

function getGeminiClient() {
  const rawKeyA = process.env.GOOGLE_GENAI_API_KEY;
  const rawKeyB = process.env.GEMINI_API_KEY;
  const apiKey = (rawKeyA || rawKeyB || "").trim();
  if (!apiKey) {
    throw new Error(
      "Missing GOOGLE_GENAI_API_KEY (or GEMINI_API_KEY) in environment"
    );
  }
  const masked =
    apiKey.length >= 12
      ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`
      : "present";
  const modelInEnv = process.env.GEMINI_MODEL || "(default)";
  // Minimal debug to verify env loading; avoid logging full secret
  // eslint-disable-next-line no-console
  console.log(
    `[gemini] Using model: ${modelInEnv}; API key: ${masked}; lengths {GOOGLE_GENAI_API_KEY:${
      rawKeyA ? rawKeyA.length : 0
    }, GEMINI_API_KEY:${rawKeyB ? rawKeyB.length : 0}}`
  );
  return new GoogleGenerativeAI(apiKey);
}

function getModel(modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash") {
  const client = getGeminiClient();
  return client.getGenerativeModel({ model: modelName });
}

async function tryGenerateContent(modelName, request) {
  const model = getModel(modelName);
  return await model.generateContent(request);
}

async function generateWithFallback(candidates, request) {
  const unique = candidates.filter(Boolean);
  let lastError = null;
  for (const name of unique) {
    try {
      const res = await tryGenerateContent(name, request);
      console.log(`[gemini] succeeded with model: ${name}`);
      return { response: res.response, model: name };
    } catch (err) {
      lastError = err;
      console.warn(
        `[gemini] model failed: ${name} -> ${err?.status || ""} ${
          err?.statusText || ""
        }`
      );
      continue;
    }
  }
  throw lastError || new Error("All candidate models failed");
}

module.exports = { getModel, generateWithFallback };
