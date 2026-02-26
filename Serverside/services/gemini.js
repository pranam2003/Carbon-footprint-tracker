// 






















// geminiService.js

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

/** -----------------------------
 * In-memory cache (simple)
 * ----------------------------- */
const cache = new Map();
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

function getCacheKey(type, userId, data) {
  return `${type}:${userId}:${JSON.stringify(data)}`;
}

function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Cache] Returning cached data for: ${key.split(":")[0]}`);
    return cached.data;
  }
  return null;
}

function setToCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/** -----------------------------
 * API key helper
 * ----------------------------- */
function getApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured (GEMINI_API_KEY missing)");
  }
  return process.env.GEMINI_API_KEY;
}

/** -----------------------------
 * GLOBAL RATE LIMITER (Queue)
 * Prevents multiple concurrent Gemini requests causing 429
 * ----------------------------- */
let active = 0;
const queue = [];
const MAX_CONCURRENT = 1; // increase to 2 only if you still don't see 429
const MIN_GAP_MS = 600; // spacing between requests
let lastStart = 0;

function runLimited(taskFn) {
  return new Promise((resolve, reject) => {
    queue.push({ taskFn, resolve, reject });
    console.log(`[Gemini Queue] Added item. active: ${active}, queued: ${queue.length}`);
    drainQueue();
  });
}

async function drainQueue() {
  if (active >= MAX_CONCURRENT) return;
  const item = queue.shift();
  if (!item) return;

  active++;
  try {
    const now = Date.now();
    const wait = Math.max(0, MIN_GAP_MS - (now - lastStart));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();

    const result = await item.taskFn();
    item.resolve(result);
  } catch (e) {
    item.reject(e);
  } finally {
    active--;
    drainQueue();
  }
}

/** -----------------------------
 * Robust JSON reading
 * Some error responses may not be valid JSON
 * ----------------------------- */
async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** -----------------------------
 * Fetch with exponential backoff
 * - Uses Retry-After header if present
 * - Retries on 429 + 5xx
 * ----------------------------- */
async function fetchWithRetry(url, options, maxRetries = 6) {
  const MAX_DELAY = 60000; // allow up to 60 seconds
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      const data = await safeJson(response);

      // Rate limit / quota
      if (response.status === 429) {
        console.log("[429 body]", JSON.stringify(data, null, 2));
        console.log("[429 headers] retry-after =", response.headers.get("retry-after"));

        const errText = JSON.stringify(data || {}).toLowerCase();
        const quotaExhausted =
          errText.includes("resource_exhausted") ||
          errText.includes("quota exceeded") ||
          errText.includes("quota") ||
          errText.includes("exceeded");

        // If it's a hard limit (limit: 0) or quota exhausted after one try, fail fast
        if (errText.includes("limit: 0") || (quotaExhausted && i >= 1)) {
          throw new Error(`QUOTA_EXCEEDED: ${JSON.stringify(data)}`);
        }

        const retryAfterHeader = response.headers.get("retry-after");
        let retryDelayBody = 0;

        // Try to get retryDelay from body (e.g. details[i].retryDelay = "42s")
        if (data?.error?.details) {
          const info = data.error.details.find((d) => d["@type"]?.includes("RetryInfo"));
          if (info?.retryDelay) {
            retryDelayBody = parseFloat(info.retryDelay.replace("s", "")) * 1000;
          }
        }

        let delay = retryAfterHeader
          ? Math.min(parseInt(retryAfterHeader, 10) * 1000, 60000)
          : retryDelayBody > 0
            ? Math.min(retryDelayBody, 60000)
            : Math.min(15000 * Math.pow(2, i) + Math.random() * 1000, 60000);

        console.warn(
          `[Retry] 429 Quota/Rate limit. Waiting ${Math.round(delay)}ms... Attempt ${i + 1}/${maxRetries}`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!response.ok) {
        // Don't retry 4xx (except 429 already handled)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(
            `Client Error ${response.status}: ${JSON.stringify(data)}`
          );
        }

        // Retry 5xx
        if (response.status >= 500) {
          const delay = Math.min(
            Math.pow(2, i) * 1000 + Math.random() * 500,
            MAX_DELAY
          );
          console.warn(
            `[Retry] Server ${response.status}. Waiting ${Math.round(delay)}ms...`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        throw new Error(`Unexpected error: ${JSON.stringify(data)}`);
      }

      return data;
    } catch (err) {
      lastError = err;
      if (i === maxRetries - 1) break;

      const delay = Math.min(Math.pow(2, i) * 2000 + Math.random() * 500, MAX_DELAY);
      console.warn(`[Retry] Network/other error. Waiting ${Math.round(delay)}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.error(
    `[Gemini] Max retries reached. Last error: ${lastError?.message || lastError}`
  );
  throw lastError || new Error("Max retries reached");
}

/** -----------------------------
 * Helpers to reduce TPM usage
 * ----------------------------- */
const MAX_TURNS = 8; // keep last 8 messages only
const MAX_CHARS_PER_PART = 1500;

function clampText(s = "") {
  if (!s) return "";
  return s.length > MAX_CHARS_PER_PART ? s.slice(0, MAX_CHARS_PER_PART) : s;
}

function sanitizeHistory(history = []) {
  return history
    .map((item) => {
      const role =
        item.role === "assistant" ? "model" : item.role === "model" ? "model" : "user";

      let parts = [];
      if (Array.isArray(item.parts)) {
        parts = item.parts
          .map((p) => ({ text: clampText(p.text || p.content || "") }))
          .filter((p) => p.text);
      } else {
        const text = clampText(item.content || item.text || "");
        if (text) parts = [{ text }];
      }

      return { role, parts };
    })
    .filter((item) => item.parts.length > 0)
    .slice(-MAX_TURNS);
}

/** -----------------------------
 * Optional: cache chat responses too
 * Helps if UI repeats same call
 * ----------------------------- */
function getChatCacheKey(userId, userMessage, history) {
  // keep cache key small: use trimmed history only
  const trimmed = sanitizeHistory(history);
  return getCacheKey("chat", userId, {
    msg: userMessage,
    h: trimmed.map((x) => ({ r: x.role, t: x.parts?.[0]?.text?.slice(0, 120) })),
  });
}

/** -----------------------------
 * Gemini chat wrapper
 * ----------------------------- */
export async function carbonChat(userMessage, history = [], userId = "default") {
  try {
    const apiKey = getApiKey();

    // Cache to avoid duplicate repeated calls (optional but helpful)
    const chatCacheKey = getChatCacheKey(userId, userMessage, history);
    const cached = getFromCache(chatCacheKey);
    if (cached) return cached;

    const sanitizedHistory = sanitizeHistory(history);

    const payload = {
      contents: [
        ...sanitizedHistory,
        { role: "user", parts: [{ text: clampText(userMessage) }] },
      ],
      // You can add generationConfig if needed
      // generationConfig: { temperature: 0.6, maxOutputTokens: 512 },
    };

    const data = await runLimited(() =>
      fetchWithRetry(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    const result = {
      text:
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No response from Gemini",
    };

    setToCache(chatCacheKey, result);
    return result;
  } catch (err) {
    console.error("Gemini chat error:", err?.message || err);

    // Standardize QUOTA error for your UI
    const msg = err?.message || "";
    if (msg.includes("429") || msg.includes("Max retries")) {
      return { error: "QUOTA_EXCEEDED" };
    }
    return { error: msg };
  }
}

/** -----------------------------
 * Suggestions (cached)
 * ----------------------------- */
export async function getPersonalizedSuggestions(
  weeklyEmissionsKg,
  categoryBreakdown,
  userId = "default"
) {
  const cacheKey = getCacheKey("suggestions", userId, {
    weeklyEmissionsKg,
    categoryBreakdown,
  });
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return cachedData;

  const prompt = `
Give exactly 4 short actionable suggestions to reduce carbon footprint.
Weekly emissions: ${weeklyEmissionsKg} kg CO2
Breakdown: ${JSON.stringify(categoryBreakdown)}
Return ONLY a JSON array of 4 strings.
`;

  // NOTE: suggestions do NOT need conversation history
  const result = await carbonChat(prompt, [], userId);

  if (result.error === "QUOTA_EXCEEDED") {
    return {
      suggestions: [
        "Use public transport or carpool to reduce travel emissions",
        "Opt for plant-based meals a few times a week",
        "Improve home insulation and use energy-efficient appliances",
        "Minimize single-use plastics and recycle more effectively",
      ],
    };
  }

  try {
    const match = result.text?.match(/\[[\s\S]*\]/);
    if (match) {
      const suggestions = { suggestions: JSON.parse(match[0]) };
      setToCache(cacheKey, suggestions);
      return suggestions;
    }
  } catch {
    console.log("Gemini JSON parse failed. Using fallback.");
  }

  return {
    suggestions: [
      "Use public transport more often",
      "Reduce non-vegetarian meals",
      "Lower electricity usage",
      "Recycle household waste",
    ],
  };
}

/** -----------------------------
 * Pattern suggestions (cached)
 * ----------------------------- */
export async function getPatternSuggestions(activities, userId = "default") {
  const cacheKey = getCacheKey(
    "pattern",
    userId,
    (activities || []).slice(0, 5).map((a) => a?._id)
  );
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return cachedData;

  const prompt = `
Analyze user activity history and detect a strong pattern.
Return ONLY JSON or null. 
Example JSON: {"pattern":"high travel on weekends","suggestion":"Try carpooling","confidence":0.8}
History:
${JSON.stringify(
    (activities || []).slice(0, 10).map((a) => ({
      date: a.createdAt,
      category: a.category,
      details: a.details,
    }))
  )}
`;

  // NOTE: pattern also does NOT need conversation history
  const result = await carbonChat(prompt, [], userId);
  if (result.error === "QUOTA_EXCEEDED") return null;

  try {
    const cleanText = result.text
      ?.replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const suggestion = JSON.parse(cleanText);
    if (!suggestion || suggestion.confidence < 0.7) return null;

    setToCache(cacheKey, suggestion);
    return suggestion;
  } catch {
    console.log("Pattern JSON parse failed.");
    return null;
  }
}

/** -----------------------------
 * Bill units extraction (image)
 * Uses limiter + retry, low token output
 * ----------------------------- */
export async function extractUnitsFromBill(imageBuffer, mimeType = "image/jpeg") {
  try {
    const apiKey = getApiKey();
    const base64Image = imageBuffer.toString("base64");

    const prompt = `You are an electricity bill parser for Indian electricity boards.
Find the total electricity CONSUMPTION in Units (kWh).
Return ONLY a plain integer number. If not found, return 0.`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 20,
      },
    };

    const data = await runLimited(() =>
      fetchWithRetry(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "0";
    console.log("Gemini bill extraction raw response:", rawText);

    const match = rawText.match(/\d+(\.\d+)?/);
    const units = match ? parseFloat(match[0]) : 0;

    return { units };
  } catch (err) {
    console.error("extractUnitsFromBill error:", err?.message || err);
    return { error: "Could not process bill image. Please enter units manually." };
  }
}