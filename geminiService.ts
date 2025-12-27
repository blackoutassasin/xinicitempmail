import { GoogleGenAI, Type } from "@google/genai";
import { Email } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Strips markdown code blocks and whitespace from a string to ensure valid JSON parsing.
 */
const cleanJsonResponse = (text: string): string => {
  let cleaned = text.trim();
  // Remove markdown code blocks if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  }
  return cleaned;
};

export const analyzeEmail = async (email: Email) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze this temporary email content for security risks and provide a concise summary.
      Email Subject: ${email.subject}
      Sender: ${email.sender} <${email.senderEmail}>
      Body: ${email.content}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "A one-sentence summary of the email.",
            },
            riskLevel: {
              type: Type.STRING,
              enum: ["low", "medium", "high"],
              description: "The assessed security risk level of the email.",
            },
            reasoning: {
              type: Type.STRING,
              description: "Short explanation for the risk assessment.",
            }
          },
          required: ["summary", "riskLevel", "reasoning"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    const cleanedText = cleanJsonResponse(text);
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return {
      summary: "Analysis unavailable.",
      riskLevel: "low",
      reasoning: "Failed to process email with AI."
    };
  }
};
