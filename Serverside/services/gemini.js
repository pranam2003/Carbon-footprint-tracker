const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent";

function getApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }
  return process.env.GEMINI_API_KEY;
}

/**
 * Carbon chat
 */
export async function carbonChat(userMessage) {
  try {
    const apiKey = getApiKey();

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }],
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }

    return {
      text:
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No response from Gemini",
    };
  } catch (err) {
    console.error("Gemini chat error:", err);
    return { error: err.message };
  }
}

/**
 * Personalized suggestions (uses carbonChat internally)
 */
export async function getPersonalizedSuggestions(
  weeklyEmissionsKg,
  categoryBreakdown
) {
  const prompt = `
Give exactly 4 short, actionable suggestions to reduce carbon footprint.
Weekly emissions: ${weeklyEmissionsKg} kg CO2
Breakdown: ${JSON.stringify(categoryBreakdown)}
Return ONLY a JSON array of 4 strings.
`;

  try {
    const result = await carbonChat(prompt);
    const match = result.text.match(/\[[\s\S]*\]/);
    if (match) {
      return { suggestions: JSON.parse(match[0]) };
    }
  } catch (err) {
    console.error("Gemini suggestions error:", err);
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

/**
 * Electricity bill extraction
 * (stub for now so imports don't crash)
 */
export async function extractUnitsFromBill() {
  return { units: 0 };
}
