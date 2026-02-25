const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

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

function getApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }
  return process.env.GEMINI_API_KEY;
}

// Helper for fetch with exponential backoff
async function fetchWithRetry(url, options, maxRetries = 6) {
  const MAX_DELAY = 30000; // Cap delay at 30 seconds
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      const data = await response.json();

      if (response.status === 429) { // Quota exceeded
        // exponential backoff with a cap and jitter
        let delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
        delay = Math.min(delay, MAX_DELAY);

        console.warn(`[Retry] Quota hit (429). Waiting ${Math.round(delay)}ms... Attempt ${i + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        // Only retry on server errors (5xx)
        if (response.status >= 500) {
          let delay = Math.pow(2, i) * 1000 + Math.random() * 500;
          delay = Math.min(delay, MAX_DELAY);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(JSON.stringify(data));
      }

      return data;
    } catch (err) {
      lastError = err;
      if (i === maxRetries - 1) break;
      const delay = Math.pow(2, i) * 2000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  console.error(`[Gemini] Max retries reached. Last error: ${lastError?.message || lastError}`);
  throw lastError || new Error("Max retries reached");
}

export async function carbonChat(userMessage, history = []) {
  try {
    const apiKey = getApiKey();

    // Deeply sanitize history to match Gemini's strict schema
    const sanitizedHistory = history.map(item => {
      // Standardize role: Gemini uses "model" instead of "assistant"
      const role = item.role === "assistant" ? "model" : (item.role || "user");

      let parts = [];
      if (Array.isArray(item.parts)) {
        // Ensure each part ONLY contains 'text'
        parts = item.parts.map(p => ({ text: p.text || p.content || "" })).filter(p => p.text);
      } else {
        // Handle cases where parts is missing but text/content exists
        const text = item.content || item.text || "";
        if (text) parts = [{ text }];
      }

      return { role, parts };
    }).filter(item => item.parts.length > 0);

    const data = await fetchWithRetry(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          ...sanitizedHistory,
          {
            role: "user",
            parts: [{ text: userMessage }],
          },
        ],
      }),
    });

    return {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini",
    };
  } catch (err) {
    console.error("Gemini chat error:", err.message);
    if (err.message?.includes("429") || err.message?.includes("Max retries")) {
      return { error: "QUOTA_EXCEEDED" };
    }
    return { error: err.message };
  }
}

export async function getPersonalizedSuggestions(
  weeklyEmissionsKg,
  categoryBreakdown,
  userId = "default"
) {
  const cacheKey = getCacheKey("suggestions", userId, { weeklyEmissionsKg, categoryBreakdown });
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return cachedData;

  const prompt = `
Give exactly 4 short actionable suggestions to reduce carbon footprint.
Weekly emissions: ${weeklyEmissionsKg} kg CO2
Breakdown: ${JSON.stringify(categoryBreakdown)}
Return ONLY a JSON array of 4 strings.
`;

  const result = await carbonChat(prompt);

  if (result.error === "QUOTA_EXCEEDED") {
    return {
      suggestions: [
        "Use public transport instead of private vehicles",
        "Reduce non-vegetarian meals during the week",
        "Switch off unused electrical appliances",
        "Recycle household waste properly",
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
  } catch (err) {
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

export async function getPatternSuggestions(activities, userId = "default") {
  // Use a truncated version of activities for cache key to avoid massive keys
  const cacheKey = getCacheKey("pattern", userId, activities.slice(0, 5).map(a => a._id));
  const cachedData = getFromCache(cacheKey);
  if (cachedData) return cachedData;

  const prompt = `
Analyze user activity history and detect a strong pattern.
Return ONLY JSON or null. 
Example JSON: {"pattern": "high travel on weekends", "suggestion": "Try carpooling", "confidence": 0.8}
History:
${JSON.stringify(
    activities.slice(0, 10).map((a) => ({
      date: a.createdAt,
      category: a.category,
      details: a.details,
    }))
  )}
`;

  const result = await carbonChat(prompt);
  if (result.error === "QUOTA_EXCEEDED") return null;

  try {
    const cleanText = result.text
      ?.replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const suggestion = JSON.parse(cleanText);
    if (!suggestion || suggestion.confidence < 0.7) return null;

    setToCache(cacheKey, suggestion);
    return suggestion;
  } catch (err) {
    console.log("Pattern JSON parse failed.");
    return null;
  }
}

export async function extractUnitsFromBill(imageBuffer, mimeType = "image/jpeg") {
  try {
    const apiKey = getApiKey();
    const base64Image = imageBuffer.toString("base64");

    const prompt = `You are an electricity bill parser for Indian electricity boards.
Find the total electricity CONSUMPTION in Units (kWh).
Return ONLY a plain integer number. If not found, return 0.`;

    const data = await fetchWithRetry(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
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
      }),
    });

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "0";
    console.log("Gemini bill extraction raw response:", rawText);

    const match = rawText.match(/\d+(\.\d+)?/);
    const units = match ? parseFloat(match[0]) : 0;

    return { units };
  } catch (err) {
    console.error("extractUnitsFromBill error:", err.message);
    return { error: "Could not process bill image. Please enter units manually." };
  }
}
