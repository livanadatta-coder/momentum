// ============================================================================
// Momentum — Gemini Service
// All Gemini API calls go through here.
// ============================================================================

import {
  GoogleGenerativeAI,
  GenerativeModel,
  GenerationConfig,
} from "@google/generative-ai";

// ─────────────────────────────────────────────────────────────────────────────

const MOMENTUM_SYSTEM_PROMPT = `
You are the intelligence engine behind Momentum — an autonomous AI Chief of Staff.

Your role is to proactively help the user by:

- analysing workload
- predicting risks
- protecting focus time
- preparing recovery plans
- generating concise executive briefings

Always respond in VALID JSON ONLY.

Rules:

- NEVER wrap JSON inside markdown.
- NEVER use \`\`\`json.
- NEVER explain your answer.
- NEVER include prose before or after the JSON.
- Return exactly one valid JSON object.
`.trim();

// ─────────────────────────────────────────────────────────────────────────────

export interface GeminiRequest {
  prompt: string;
  context?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GeminiResponse {
  text: string;
  parsed?: unknown;
  tokensUsed?: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Finish reasons that mean the model stopped naturally (complete output).
// Everything else means the output is potentially incomplete.
const COMPLETE_FINISH_REASONS = new Set([
  "STOP",
  "1",               // proto enum value for STOP in some SDK versions
  "FINISH_REASON_UNSPECIFIED",   // treat unspecified as complete
]);

// ─────────────────────────────────────────────────────────────────────────────

const MODEL_CASCADE = [
  "gemini-2.5-flash",
];

// ─────────────────────────────────────────────────────────────────────────────

export class GeminiService {
  private client: GoogleGenerativeAI;
  private activeModel = MODEL_CASCADE[0];

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  private getModel(modelName: string): GenerativeModel {
    return this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: MOMENTUM_SYSTEM_PROMPT,
    });
  }

  // --------------------------------------------------------------------------
  // JSON parsing — with JSON mode active, strategy 1 should always succeed.
  // Strategies 2-4 are kept as fallbacks for edge cases.

  private parseGeminiResponse(text: string): unknown {
    const raw = text.trim();

    // 1. Direct parse (expected path with responseMimeType: "application/json")
    try {
      return JSON.parse(raw);
    } catch { /* fall through */ }

    // 2. Strip markdown fences if model ignored the MIME type hint
    try {
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      return JSON.parse(cleaned);
    } catch { /* fall through */ }

    // 3. Extract outermost JSON object
    try {
      const start = raw.indexOf("{");
      const end   = raw.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(raw.substring(start, end + 1));
      }
    } catch { /* fall through */ }

    // 4. Extract outermost JSON array
    try {
      const start = raw.indexOf("[");
      const end   = raw.lastIndexOf("]");
      if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(raw.substring(start, end + 1));
      }
    } catch { /* fall through */ }

    console.error("[Gemini] All parse strategies failed. Raw length:", raw.length, "Last char:", JSON.stringify(raw.slice(-1)));
    return undefined;
  }

  // --------------------------------------------------------------------------
  // Single model call. Returns a GeminiResponse or throws.
  // Checks finishReason — if the generation was cut short, throws an
  // IncompleteGenerationError so the caller can retry.

  private async callModel(
    modelName: string,
    content:   string,
    config:    GenerationConfig,
    attempt:   number,
  ): Promise<GeminiResponse> {
    const model = this.getModel(modelName);
    console.log(`[Momentum] 10. Gemini request: ${modelName}${attempt > 0 ? ` (retry ${attempt})` : ""}`);

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: content }] }],
      generationConfig: config,
    });

    // ── Inspect finish reason ─────────────────────────────────────────────
    const candidate    = result.response.candidates?.[0];
    const finishReason = String(candidate?.finishReason ?? "STOP");

    if (!COMPLETE_FINISH_REASONS.has(finishReason)) {
      // Output is incomplete — do not attempt to parse it.
      console.warn(
        `[Gemini] Incomplete generation: finishReason=${finishReason}`,
        `| attempt=${attempt + 1}`,
        `| chars=${result.response.text().length}`,
      );
      const err = new Error(`INCOMPLETE:${finishReason}`);
      throw err;
    }

    const text       = result.response.text();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount;
    const parsed     = this.parseGeminiResponse(text);

    return { text, parsed, tokensUsed };
  }

  // --------------------------------------------------------------------------

  async generate(request: GeminiRequest): Promise<GeminiResponse> {
    // GenerationConfig extended with gemini-2.5-flash thinking controls.
    // thinkingBudget: 0 disables the model's internal chain-of-thought, which
    // otherwise silently consumes thousands of tokens before any output is
    // written — causing MAX_TOKENS truncation on every structured JSON call.
    const config = {
      temperature:      request.temperature ?? 0.3,
      maxOutputTokens:  request.maxTokens ?? 8192,
      topP:             0.95,
      responseMimeType: "application/json",
      thinkingConfig:   { thinkingBudget: 0 },
    } as GenerationConfig;

    const content = request.context
      ? `${request.context}\n\n${request.prompt}`
      : request.prompt;

    let lastError: unknown;

    for (const modelName of MODEL_CASCADE) {
      // Allow one retry per model for incomplete generations (non-STOP finish).
      // Network/quota errors are NOT retried here — they surface immediately.
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          const response    = await this.callModel(modelName, content, config, attempt);
          this.activeModel  = modelName;
          return response;

        } catch (err: unknown) {
          const message = getErrorMessage(err);

          // Non-STOP finish — retry once with the same model
          if (message.startsWith("INCOMPLETE:") && attempt === 0) {
            console.warn("[Gemini] Retrying once after incomplete generation...");
            continue; // inner loop: attempt 1
          }

          // Quota / rate-limit — warn and propagate
          if (message.includes("429") || message.includes("quota") || message.includes("RESOURCE_EXHAUSTED")) {
            console.warn(`[Gemini] Quota limit hit on ${modelName}.`);
            lastError = err;
            break; // try next model
          }

          // Transient server error — try next model
          if (message.includes("503") || message.includes("overloaded") || message.includes("UNAVAILABLE")) {
            console.warn(`[Gemini] Server unavailable on ${modelName}.`);
            lastError = err;
            break; // try next model
          }

          // Any other error (including second INCOMPLETE) — propagate immediately
          lastError = err;
          if (!message.startsWith("INCOMPLETE:")) {
            // Only log non-INCOMPLETE errors to avoid noise
            console.error("=================================");
            console.error("Gemini Model:", modelName, "| attempt:", attempt + 1);
            console.error(err);
            console.error("=================================");
          }
          throw err;
        }
      }
    }

    throw lastError ?? new Error("All Gemini models unavailable.");
  }

  // --------------------------------------------------------------------------

  async generateJSON<T>(request: GeminiRequest): Promise<T> {
    try {
      const response = await this.generate(request);

      if (response.parsed !== undefined) {
        return response.parsed as T;
      }

      // JSON mode should make this branch unreachable, but guard it anyway
      console.error("[Gemini] parsed is undefined — raw text length:", response.text.length);
      throw new Error("Gemini returned unparseable JSON.");

    } catch (err) {
      const msg = getErrorMessage(err);
      const isQuota = msg.includes("429") || msg.includes("quota") ||
                      msg.includes("RESOURCE_EXHAUSTED") || msg.includes("temporarily unavailable");
      if (!isQuota) {
        console.error("[Gemini] generateJSON failed:", msg);
      }
      throw new Error(
        "Momentum AI is temporarily unavailable. Please try again in a few moments."
      );
    }
  }

  // --------------------------------------------------------------------------

  getActiveModel(): string {
    return this.activeModel;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

let instance: GeminiService | null = null;

export function getGeminiService(): GeminiService {
  if (!instance) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("VITE_GEMINI_API_KEY is not set.");
    }

    instance = new GeminiService(apiKey);
  }

  return instance;
}
