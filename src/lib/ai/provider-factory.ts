import type { LanguageModel } from "ai";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createMistral } from "@ai-sdk/mistral";
import { getTierSettings } from "./settings";
import {
  ensureLocalModelLoaded,
  isLocalOpenAIProvider,
  resolveLocalOpenAIApiKey,
  resolveLocalOpenAIBaseUrl,
} from "./local-provider";
import {
  APPLE_FM_MAX_INPUT_CHARS,
  APPLE_FM_MODEL_ID,
  APPLE_FM_PROVIDER_ID,
  getAppleFmBaseUrl,
  getAppleFmStatus,
} from "./apple-fm";
import { groupForTask, type AITaskId, type AITier } from "@/lib/ai/tasks";
import { getRoutingFallbackEnabled, getRoutingTier } from "@/lib/app-preferences";

export function createLanguageModel(
  provider: string,
  modelId: string,
  apiKey: string,
  baseUrl?: string,
): LanguageModel {
  if (isLocalOpenAIProvider(provider)) {
    const openaiCompatible = createOpenAI({
      apiKey: resolveLocalOpenAIApiKey(apiKey),
      baseURL: resolveLocalOpenAIBaseUrl(baseUrl),
    });
    return openaiCompatible.chat(modelId);
  }

  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    case "xai": {
      const xai = createXai({ apiKey });
      return xai(modelId);
    }
    case "mistral": {
      const mistral = createMistral({ apiKey });
      return mistral(modelId);
    }
    case "deepseek": {
      const deepseek = createOpenAI({
        apiKey,
        baseURL: "https://api.deepseek.com/v1",
      });
      return deepseek(modelId);
    }
    case APPLE_FM_PROVIDER_ID: {
      const appleFm = createOpenAI({ apiKey, baseURL: baseUrl });
      return appleFm.chat(modelId);
    }
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

export type AIRoutingErrorCode =
  | "ai_tier_not_configured"
  | "apple_fm_unavailable"
  | "local_server_unavailable";

export class AIRoutingError extends Error {
  constructor(
    public code: AIRoutingErrorCode,
    message: string,
    public status: number = code === "ai_tier_not_configured" ? 400 : 422,
  ) {
    super(message);
    this.name = "AIRoutingError";
  }
}

export interface ResolvedTaskModel {
  model: LanguageModel;
  providerId: string;
  modelId: string;
  tier: AITier;
  /** Set for the embedded Apple model – callers reject bigger inputs (étape 2). */
  maxInputChars?: number;
}

/** The single seam between call sites and providers: task → group → tier → model.
 *  Resolution order is task pref > group pref > shipped default; only the group
 *  level exists in v1, `context` reserves the slot for per-locale overrides. */
export async function getLanguageModelForTask(
  taskId: AITaskId,
  _context?: { locale?: string },
): Promise<ResolvedTaskModel> {
  const tier = getRoutingTier(groupForTask(taskId));
  return resolveTier(tier, true);
}

async function resolveTier(tier: AITier, allowFallback: boolean): Promise<ResolvedTaskModel> {
  const settings = await getTierSettings(tier);
  if (!settings) {
    throw new AIRoutingError("ai_tier_not_configured", `The ${tier} tier is not configured`);
  }

  if (tier === "local" && settings.provider === APPLE_FM_PROVIDER_ID) {
    const status = await getAppleFmStatus();
    if (!status.available) {
      const fallback = await tryByokFallback(allowFallback);
      if (fallback) return fallback;
      throw new AIRoutingError("apple_fm_unavailable", status.reason ?? "unknown");
    }
    const baseUrl = getAppleFmBaseUrl();
    if (baseUrl == null) {
      const fb = await tryByokFallback(allowFallback);
      if (fb) return fb;
      throw new AIRoutingError("apple_fm_unavailable", "sidecar_unreachable");
    }
    return {
      model: createLanguageModel(APPLE_FM_PROVIDER_ID, APPLE_FM_MODEL_ID, "afm", baseUrl),
      providerId: APPLE_FM_PROVIDER_ID,
      modelId: APPLE_FM_MODEL_ID,
      tier,
      maxInputChars: APPLE_FM_MAX_INPUT_CHARS,
    };
  }

  if (tier === "local" && isLocalOpenAIProvider(settings.provider)) {
    const loadError = await ensureLocalModelLoaded(
      settings.modelId,
      settings.baseUrl ?? undefined,
      settings.apiKey,
    );
    if (loadError) {
      const fallback = await tryByokFallback(allowFallback);
      if (fallback) return fallback;
      throw new AIRoutingError("local_server_unavailable", loadError);
    }
  }

  return {
    model: createLanguageModel(settings.provider, settings.modelId, settings.apiKey, settings.baseUrl ?? undefined),
    providerId: settings.provider,
    modelId: settings.modelId,
    tier,
  };
}

async function tryByokFallback(allowFallback: boolean): Promise<ResolvedTaskModel | null> {
  if (!allowFallback || !getRoutingFallbackEnabled()) return null;
  const byok = await getTierSettings("byok");
  return byok ? resolveTier("byok", false) : null;
}

export type AIErrorCategory = "auth" | "permission" | "model_not_found" | "rate_limit" | "unknown";

/** Classify an AI provider error by inspecting its message. */
export function classifyAIError(err: unknown): AIErrorCategory {
  const message = err instanceof Error ? err.message : String(err);
  if (/401|unauthorized|invalid.*key|invalid.*api|incorrect.*key|authentication/i.test(message)) {
    return "auth";
  }
  if (/403|forbidden|permission/i.test(message)) {
    return "permission";
  }
  if (/404|not.found|model/i.test(message)) {
    return "model_not_found";
  }
  if (/429|rate.limit|quota/i.test(message)) {
    return "rate_limit";
  }
  return "unknown";
}

const ERROR_MESSAGES: Record<AIErrorCategory, string | null> = {
  auth: "Invalid API key",
  permission: "API key lacks required permissions",
  model_not_found: "Model not found – check your provider and model selection",
  rate_limit: null, // Rate limited but key is valid
  unknown: null, // Handled separately with original message
};

/**
 * Validate an API key by making a minimal test call to the provider.
 * Returns null if valid, or an error message string if invalid.
 */
export async function validateApiKey(
  provider: string,
  modelId: string,
  apiKey: string,
  baseUrl?: string,
): Promise<string | null> {
  try {
    const model = createLanguageModel(provider, modelId, apiKey, baseUrl);
    await generateText({
      model,
      prompt: "Say hi",
      maxOutputTokens: 16,
    });
    return null;
  } catch (err) {
    const category = classifyAIError(err);
    if (category === "rate_limit") return null;
    const mapped = ERROR_MESSAGES[category];
    if (mapped) return mapped;
    if (isLocalOpenAIProvider(provider)) {
      return "Could not reach the local AI server. Ensure it is running and the URL/model are correct.";
    }
    const message = err instanceof Error ? err.message : String(err);
    return `API key validation failed: ${message}`;
  }
}
