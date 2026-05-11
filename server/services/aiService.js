import axios from "axios";
import OpenAI from "openai";

let openAIClient;

const defaultProvider = "template";

function isConfigured(value, placeholder) {
  return Boolean(value && value.trim() && value !== placeholder);
}

function getProviderPreference() {
  return (process.env.AI_PROVIDER || defaultProvider).trim().toLowerCase();
}

function publicError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function titleCase(value) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseJSON(content, providerName) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw publicError(`${providerName} returned invalid product research JSON.`);
  }
}

function validateFeatureHTML(html, providerName) {
  const cleaned = String(html || "").trim();

  if (!cleaned || !/^<ul[\s>]/i.test(cleaned) || !/<li[\s>]/i.test(cleaned)) {
    throw publicError(`${providerName} returned invalid feature HTML.`);
  }

  return cleaned;
}

function templateCleanProductInfo(product) {
  const cleanTitle = titleCase(product.trim());

  return {
    cleanTitle,
    category: "General Merchandise",
    imageSearchKeyword: `${cleanTitle} product`
  };
}

function templateFeaturesHTML(product) {
  const name = escapeHTML(titleCase(product));

  return `<ul>
<li>Designed to deliver dependable everyday performance for ${name} users.</li>
<li>Built with practical features that support home, jobsite, retail, or business use.</li>
<li>Easy to present in ecommerce listings with a clear, customer-friendly value proposition.</li>
<li>Durable construction and thoughtful design help support repeated use over time.</li>
<li>Versatile option for buyers looking for reliable quality and straightforward usability.</li>
<li>Great choice for improving productivity, convenience, and overall project results.</li>
</ul>`;
}

function getOpenAIClient() {
  if (!isConfigured(process.env.OPENAI_API_KEY, "YOUR_OPENAI_API_KEY")) {
    throw publicError("OpenAI API key is not configured on the server.", 500);
  }

  if (!openAIClient) {
    openAIClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  return openAIClient;
}

function normalizeOpenAIError(error) {
  if (error.status === 401) {
    return publicError("OpenAI authentication failed. Check OPENAI_API_KEY in server/.env.", 401);
  }

  if (error.status === 429) {
    return publicError("OpenAI rate limit or quota was reached. Falling back to local template mode.", 429);
  }

  if (error.status >= 400 && error.status < 500) {
    return publicError(`OpenAI request failed: ${error.message}`, error.status);
  }

  return publicError("OpenAI request failed. Falling back to local template mode.");
}

async function openAICleanProductInfo(product) {
  const openai = getOpenAIClient();

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a product research assistant. Return only valid JSON with cleanTitle, category, and imageSearchKeyword."
        },
        {
          role: "user",
          content: `Product:\n"${product}"\n\nReturn JSON:\n{\n  "cleanTitle": "",\n  "category": "",\n  "imageSearchKeyword": ""\n}`
        }
      ],
      temperature: 0.2
    });

    const parsed = parseJSON(response.choices[0]?.message?.content || "{}", "OpenAI");

    return {
      cleanTitle: String(parsed.cleanTitle || product).trim(),
      category: String(parsed.category || "").trim(),
      imageSearchKeyword: String(parsed.imageSearchKeyword || `${product} product`).trim()
    };
  } catch (error) {
    throw normalizeOpenAIError(error);
  }
}

async function openAIFeaturesHTML(product) {
  const openai = getOpenAIClient();

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Generate ecommerce product feature bullets. Return only raw HTML using one ul element with six li items. Do not use markdown or explanations."
        },
        {
          role: "user",
          content: `Generate 6 persuasive ecommerce bullet points\nfor the following product:\n\n${product}\n\nRules:\n- Return ONLY raw HTML\n- Use UL LI format\n- No markdown\n- No explanation`
        }
      ],
      temperature: 0.7
    });

    return validateFeatureHTML(response.choices[0]?.message?.content, "OpenAI");
  } catch (error) {
    throw normalizeOpenAIError(error);
  }
}

async function geminiGenerate(prompt, expectsJSON = false) {
  if (!isConfigured(process.env.GEMINI_API_KEY, "YOUR_GEMINI_API_KEY")) {
    throw publicError("Gemini API key is not configured on the server.", 500);
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: expectsJSON ? 0.2 : 0.7,
        responseMimeType: expectsJSON ? "application/json" : "text/plain"
      }
    },
    {
      timeout: 30000,
      params: { key: process.env.GEMINI_API_KEY }
    }
  );

  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function geminiCleanProductInfo(product) {
  const content = await geminiGenerate(
    `You are a product research assistant.

Product:
"${product}"

Return only valid JSON:
{
  "cleanTitle": "",
  "category": "",
  "imageSearchKeyword": ""
}`,
    true
  );

  const parsed = parseJSON(content, "Gemini");

  return {
    cleanTitle: String(parsed.cleanTitle || product).trim(),
    category: String(parsed.category || "").trim(),
    imageSearchKeyword: String(parsed.imageSearchKeyword || `${product} product`).trim()
  };
}

async function geminiFeaturesHTML(product) {
  const content = await geminiGenerate(
    `Generate 6 persuasive ecommerce bullet points for the following product:

${product}

Rules:
- Return ONLY raw HTML
- Use UL LI format
- No markdown
- No explanation`,
    false
  );

  return validateFeatureHTML(content, "Gemini");
}

async function ollamaGenerate(prompt, expectsJSON = false) {
  const baseURL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llama3.2";

  const response = await axios.post(
    `${baseURL}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      format: expectsJSON ? "json" : undefined,
      options: { temperature: expectsJSON ? 0.2 : 0.7 }
    },
    { timeout: 120000 }
  );

  return response.data?.response || "";
}

async function ollamaCleanProductInfo(product) {
  const content = await ollamaGenerate(
    `Return only JSON for this product.

Product:
"${product}"

JSON shape:
{
  "cleanTitle": "",
  "category": "",
  "imageSearchKeyword": ""
}`,
    true
  );

  const parsed = parseJSON(content, "Ollama");

  return {
    cleanTitle: String(parsed.cleanTitle || product).trim(),
    category: String(parsed.category || "").trim(),
    imageSearchKeyword: String(parsed.imageSearchKeyword || `${product} product`).trim()
  };
}

async function ollamaFeaturesHTML(product) {
  const content = await ollamaGenerate(
    `Generate 6 persuasive ecommerce bullet points for the following product:

${product}

Rules:
- Return ONLY raw HTML
- Use UL LI format
- No markdown
- No explanation`,
    false
  );

  return validateFeatureHTML(content, "Ollama");
}

function getProviders() {
  const preference = getProviderPreference();

  if (preference === "openai") return ["openai", "template"];
  if (preference === "gemini") return ["gemini", "template"];
  if (preference === "ollama") return ["ollama", "template"];
  if (preference === "template") return ["template"];

  return ["gemini", "ollama", "openai", "template"];
}

async function runWithFallback(actionName, product) {
  const providers = getProviders();
  const failures = [];

  for (const provider of providers) {
    try {
      if (actionName === "clean") {
        if (provider === "openai") return await openAICleanProductInfo(product);
        if (provider === "gemini") return await geminiCleanProductInfo(product);
        if (provider === "ollama") return await ollamaCleanProductInfo(product);
        return templateCleanProductInfo(product);
      }

      if (provider === "openai") return await openAIFeaturesHTML(product);
      if (provider === "gemini") return await geminiFeaturesHTML(product);
      if (provider === "ollama") return await ollamaFeaturesHTML(product);
      return templateFeaturesHTML(product);
    } catch (error) {
      failures.push(`${provider}: ${error.publicMessage || error.message}`);
    }
  }

  throw publicError(`AI generation failed. ${failures.join(" | ")}`);
}

export async function cleanProductInfo(product) {
  return runWithFallback("clean", product);
}

export async function generateFeaturesHTML(product) {
  return runWithFallback("features", product);
}
