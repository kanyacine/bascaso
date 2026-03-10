import { generateObject, generateText, type LanguageModel } from "ai";
import { z } from "zod";
import {
  LOCAL_OPENAI_PROVIDER_ID,
  resolveLocalOpenAIApiKey,
  resolveLocalOpenAIBaseUrl,
} from "./local-provider";

type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;

interface LocalOpenAIStructuredOptions {
  modelId: string;
  baseUrl?: string;
  apiKey?: string;
  maxOutputTokens?: number;
}

interface RepairGeneratedObjectTextOptions<T extends Record<string, unknown>> {
  text: string;
  schema: z.ZodType<T>;
  model?: LanguageModel;
  system?: string;
  providerId?: string;
  providerOptions?: ProviderOptions;
  sectionAliases?: Record<string, string[]>;
}

interface GenerateObjectWithRepairOptions<T extends Record<string, unknown>> {
  model: LanguageModel;
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  temperature?: number;
  providerId?: string;
  providerOptions?: ProviderOptions;
  sectionAliases?: Record<string, string[]>;
  localOpenAI?: LocalOpenAIStructuredOptions;
}

function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ?? text.trim();
}

function extractBalancedJson(text: string): string | null {
  const source = stripCodeFences(text);
  let start = -1;
  let opening = "";

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{" || char === "[") {
      start = i;
      opening = char;
      break;
    }
  }

  if (start === -1) return null;

  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === opening) depth += 1;
    if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1).trim();
      }
    }
  }

  return null;
}

function validateJsonCandidate<T extends Record<string, unknown>>(
  candidate: string | null,
  schema: z.ZodType<T>,
): T | null {
  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate);
    const validated = schema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function normalizeSectionLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[*_`#>:]/g, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/:$/, "");
}

function buildSectionAliasMap<T extends Record<string, unknown>>(
  schema: z.ZodType<T>,
  sectionAliases: Record<string, string[]>,
): Map<string, string> {
  const aliases = new Map<string, string>();
  const jsonSchema = z.toJSONSchema(schema);
  const properties = (jsonSchema as { properties?: Record<string, unknown> }).properties ?? {};

  for (const key of Object.keys(properties)) {
    aliases.set(normalizeSectionLabel(key), key);
    aliases.set(normalizeSectionLabel(key.replace(/([a-z])([A-Z])/g, "$1 $2")), key);

    for (const alias of sectionAliases[key] ?? []) {
      aliases.set(normalizeSectionLabel(alias), key);
    }
  }

  return aliases;
}

function parseSectionedBulletLists<T extends Record<string, unknown>>(
  text: string,
  schema: z.ZodType<T>,
  sectionAliases: Record<string, string[]>,
): T | null {
  const sectionByAlias = buildSectionAliasMap(schema, sectionAliases);
  if (sectionByAlias.size === 0) return null;

  const sections: Record<string, string[]> = {};
  let currentKey: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const normalizedLine = normalizeSectionLabel(line);
    const headingKey = sectionByAlias.get(normalizedLine);
    if (headingKey) {
      currentKey = headingKey;
      sections[currentKey] ??= [];
      continue;
    }

    if (!currentKey) continue;

    const bullet = line.match(/^[-*•]\s+(.+)$/) ?? line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet) {
      sections[currentKey].push(bullet[1].trim());
      continue;
    }

    if (sections[currentKey].length > 0) {
      const last = sections[currentKey].length - 1;
      sections[currentKey][last] = `${sections[currentKey][last]} ${line}`.trim();
    }
  }

  const validated = schema.safeParse(sections);
  return validated.success ? validated.data : null;
}

function buildJsonRepairPrompt<T extends Record<string, unknown>>(
  text: string,
  schema: z.ZodType<T>,
): string {
  return [
    "Convert the following analysis into valid JSON that matches this schema exactly.",
    "Return ONLY JSON. No markdown, no explanation, no surrounding text.",
    "",
    "Schema:",
    JSON.stringify(z.toJSONSchema(schema), null, 2),
    "",
    "Analysis:",
    text,
  ].join("\n");
}

function chatCompletionsUrl(baseUrl: string | undefined): string {
  return `${resolveLocalOpenAIBaseUrl(baseUrl)}/chat/completions`;
}

function extractTextFromChatCompletion(payload: unknown): string {
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

async function generateLocalOpenAIStructuredObject<T extends Record<string, unknown>>({
  schema,
  prompt,
  system,
  temperature,
  localOpenAI,
  sectionAliases = {},
}: {
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  temperature?: number;
  localOpenAI: LocalOpenAIStructuredOptions;
  sectionAliases?: Record<string, string[]>;
}): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${resolveLocalOpenAIApiKey(localOpenAI.apiKey)}`,
  };

  const response = await fetch(chatCompletionsUrl(localOpenAI.baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: localOpenAI.modelId,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      temperature: temperature ?? 0,
      max_tokens: localOpenAI.maxOutputTokens ?? 400,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          strict: true,
          schema: z.toJSONSchema(schema),
        },
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(raw || `Local structured output failed with status ${response.status}`);
  }

  const payload = await response.json();
  const text = extractTextFromChatCompletion(payload);
  const directJson = validateJsonCandidate(extractBalancedJson(text), schema);
  if (directJson) return directJson;

  const sectioned = parseSectionedBulletLists(text, schema, sectionAliases);
  if (sectioned) return sectioned;

  throw new Error("Local structured output did not return valid schema-matching JSON");
}

export async function repairGeneratedObjectText<T extends Record<string, unknown>>({
  text,
  schema,
  model,
  system,
  providerId,
  providerOptions,
  sectionAliases = {},
}: RepairGeneratedObjectTextOptions<T>): Promise<string | null> {
  const directJson = validateJsonCandidate(extractBalancedJson(text), schema);
  if (directJson) {
    return JSON.stringify(directJson);
  }

  const sectioned = parseSectionedBulletLists(text, schema, sectionAliases);
  if (sectioned) {
    return JSON.stringify(sectioned);
  }

  if (providerId !== LOCAL_OPENAI_PROVIDER_ID || !model) {
    return null;
  }

  try {
    const repaired = await generateText({
      model,
      system,
      prompt: buildJsonRepairPrompt(text, schema),
      temperature: 0,
      providerOptions,
    });

    const repairedJson = validateJsonCandidate(extractBalancedJson(repaired.text), schema);
    if (repairedJson) {
      return JSON.stringify(repairedJson);
    }

    const repairedSections = parseSectionedBulletLists(repaired.text, schema, sectionAliases);
    return repairedSections ? JSON.stringify(repairedSections) : null;
  } catch {
    return null;
  }
}

export async function generateObjectWithRepair<T extends Record<string, unknown>>({
  model,
  schema,
  prompt,
  system,
  temperature,
  providerId,
  providerOptions,
  sectionAliases,
  localOpenAI,
}: GenerateObjectWithRepairOptions<T>) {
  if (providerId === LOCAL_OPENAI_PROVIDER_ID && localOpenAI) {
    try {
      const object = await generateLocalOpenAIStructuredObject({
        schema,
        prompt,
        system,
        temperature,
        localOpenAI,
        sectionAliases,
      });
      return { object };
    } catch {
      // Fall back to generic structured generation plus repair for
      // OpenAI-compatible servers that do not fully support json_schema.
    }
  }

  return generateObject({
    model,
    schema,
    prompt,
    system,
    temperature,
    output: "object",
    providerOptions,
    experimental_repairText: ({ text }) => repairGeneratedObjectText({
      text,
      schema,
      model,
      system,
      providerId,
      providerOptions,
      sectionAliases,
    }),
  });
}
