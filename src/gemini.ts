import { config } from "./config.js";
import { CurrencyCode } from "./currencies.js";
import { logger } from "./logger.js";
import { systemPrompt } from "./systemPrompt.js";

type GeminiExtraction = {
  fromCurrency?: CurrencyCode;
  toCurrency?: CurrencyCode;
  amount?: number;
  amountCurrency?: CurrencyCode;
};

const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`;

const extractionPrompt = systemPrompt;

export const extractWithGemini = async (text: string): Promise<GeminiExtraction | null> => {
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: extractionPrompt },
          { text: `Сообщение клиента: ${text}` },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      topP: 0,
      topK: 1,
      maxOutputTokens: 128,
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    logger.warn("Gemini request failed", { status: response.status });
    return null;
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const textOutput = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOutput) {
    return null;
  }

  try {
    const parsed = JSON.parse(textOutput) as GeminiExtraction;
    return parsed;
  } catch {
    logger.warn("Gemini response not JSON", { textOutput });
    return null;
  }
};
