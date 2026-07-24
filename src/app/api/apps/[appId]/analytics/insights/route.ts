import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyAIError, getLanguageModelForTask } from "@/lib/ai/provider-factory";
import { isLocalOpenAIProvider } from "@/lib/ai/local-provider";
import { buildAnalyticsInsightsPrompt } from "@/lib/ai/prompts";
import { generateObjectWithRepair } from "@/lib/ai/structured-output";
import { noThinkingOptions, samplingTemperature } from "@/lib/ai/provider-options";
import { hasCredentials } from "@/lib/asc/client";
import { isDemoMode, getDemoAnalytics } from "@/lib/demo";
import type { AnalyticsData } from "@/lib/asc/analytics";
import { cacheGet, cacheSet } from "@/lib/cache";
import { errorJson, routingErrorResponse } from "@/lib/api-helpers";
import { appleFmInputTooLarge } from "@/lib/ai/apple-fm";

const INSIGHTS_TTL = 24 * 60 * 60 * 1000; // 24 hours

const analyticsInsightSchema = z.object({
  highlights: z.array(z.string()),
  opportunities: z.array(z.string()),
});

export type AnalyticsInsights = z.infer<typeof analyticsInsightSchema>;

interface CachedAnalyticsInsights {
  insights: AnalyticsInsights;
  dataHash: string;
}

/** Simple hash of key metrics to detect data changes. */
function computeDataHash(data: AnalyticsData): string {
  const downloads = data.dailyDownloads.length;
  const lastDate = data.dailyDownloads[downloads - 1]?.date ?? "";
  const totalFirstTime = data.dailyDownloads.reduce((s, d) => s + d.firstTime, 0);
  const totalProceeds = data.dailyRevenue.reduce((s, d) => s + d.proceeds, 0);
  return `${downloads}:${lastDate}:${totalFirstTime}:${totalProceeds}`;
}

function cacheKey(appId: string): string {
  return `analytics-insights:${appId}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  const cached = cacheGet<CachedAnalyticsInsights>(cacheKey(appId));
  if (cached) {
    return NextResponse.json({
      insights: cached.insights,
      dataHash: cached.dataHash,
      cached: true,
    });
  }

  return NextResponse.json({ insights: null, cached: false });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";

  // 1. Get analytics data
  let data: AnalyticsData | null;
  try {
    if (isDemoMode()) {
      data = getDemoAnalytics(appId);
    } else if (hasCredentials()) {
      data = cacheGet<AnalyticsData>(`analytics:${appId}`, true);
    } else {
      return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
    }
  } catch (err) {
    return errorJson(err);
  }

  if (!data || data.dailyDownloads.length === 0) {
    return NextResponse.json({ error: "No analytics data available" }, { status: 400 });
  }

  // Check cache – if data hasn't changed and not forced, return cached
  const currentHash = computeDataHash(data);
  const cached = cacheGet<CachedAnalyticsInsights>(cacheKey(appId));
  if (!force && cached && cached.dataHash === currentHash) {
    return NextResponse.json({
      insights: cached.insights,
      dataHash: cached.dataHash,
      cached: true,
    });
  }

  // 2. Get AI model
  let model;
  let providerId = "";
  let modelId = "";
  let maxInputChars: number | undefined;
  try {
    const resolved = await getLanguageModelForTask("analytics-insights");
    ({ model, providerId, modelId, maxInputChars } = resolved);
  } catch (err) {
    return routingErrorResponse(err);
  }

  // 3. Build prompt
  const prompt = buildAnalyticsInsightsPrompt(data);
  const system =
    "You are an app analytics expert. Analyse App Store Connect metrics and extract structured insights. Be concise, data-driven, and actionable.";

  // Reject inputs the resolved model can't fit (the embedded Apple model caps
  // its context; other providers leave maxInputChars unset and skip this).
  // maxInputChars is only the "apply the apple-fm guard" marker – the real
  // check is a script-aware token estimate (CJK ≈ 1 token/char).
  if (maxInputChars !== undefined && appleFmInputTooLarge(system + prompt)) {
    return NextResponse.json({ error: "apple_fm_input_too_large" }, { status: 422 });
  }

  try {
    const { object: insights } = await generateObjectWithRepair({
      model,
      schema: analyticsInsightSchema,
      system,
      prompt,
      temperature: samplingTemperature(providerId, modelId, 0),
      providerId,
      providerOptions: noThinkingOptions(providerId, modelId),
      maxOutputTokens: isLocalOpenAIProvider(providerId) ? 400 : undefined,
      sectionAliases: {
        highlights: ["highlights"],
        opportunities: ["opportunities"],
      },
    });

    // Cache the result with data hash
    cacheSet(cacheKey(appId), { insights, dataHash: currentHash }, INSIGHTS_TTL);

    return NextResponse.json({
      insights,
      dataHash: currentHash,
      cached: false,
    });
  } catch (err) {
    console.warn(`[ai] Analytics insights generation failed for ${appId}:`, err);
    if (cached?.insights) {
      return NextResponse.json({
        insights: cached.insights,
        dataHash: cached.dataHash,
        cached: true,
        stale: true,
      });
    }
    const category = classifyAIError(err);
    if (category === "credits") {
      return NextResponse.json({ error: "ai_credits_exhausted" }, { status: 402 });
    }
    if (category === "auth" || category === "permission") {
      return NextResponse.json({ error: "ai_auth_error" }, { status: 401 });
    }
    return errorJson(err, 500, "AI request failed");
  }
}
