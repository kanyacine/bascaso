import { Output, generateText, type LanguageModel } from "ai";
import { z } from "zod";
import { LOCAL_OPENAI_PROVIDER_ID } from "./local-provider";

type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;

interface RepairGeneratedObjectTextOptions<T extends Record<string, unknown>> {
  text: string;
  schema: z.ZodType<T>;
  model?: LanguageModel;
  system?: string;
  providerId?: string;
  providerOptions?: ProviderOptions;
  maxOutputTokens?: number;
  sectionAliases?: Record<string, string[]>;
}

interface GenerateObjectWithRepairOptions<T extends Record<string, unknown>> {
  model: LanguageModel;
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  providerId?: string;
  providerOptions?: ProviderOptions;
  sectionAliases?: Record<string, string[]>;
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

function extractErrorText(err: unknown): string | null {
  if (err && typeof err === "object" && "text" in err && typeof err.text === "string") {
    return err.text;
  }
  return null;
}

export async function repairGeneratedObjectText<T extends Record<string, unknown>>({
  text,
  schema,
  model,
  system,
  providerId,
  providerOptions,
  maxOutputTokens,
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
      maxOutputTokens,
      providerOptions,
    });

    const repairedJson = validateJsonCandidate(extractBalancedJson(repaired.text), schema);
    if (repairedJson) {
      return JSON.stringify(repairedJson);
    }

    const repairedSections = parseSectionedBulletLists(repaired.text, schema, sectionAliases);
    return repairedSections ? JSON.stringify(repairedSections) : null;
  } catch (err) {
    console.warn("[ai] Structured output repair call failed:", err);
    return null;
  }
}

export async function generateObjectWithRepair<T extends Record<string, unknown>>({
  model,
  schema,
  prompt,
  system,
  temperature,
  maxOutputTokens,
  providerId,
  providerOptions,
  sectionAliases,
}: GenerateObjectWithRepairOptions<T>) {
  try {
    const result = await generateText({
      model,
      system,
      prompt,
      temperature,
      maxOutputTokens,
      providerOptions,
      output: Output.object({
        schema,
        name: "structured_output",
      }),
    });

    return { object: result.output };
  } catch (err) {
    const text = extractErrorText(err);
    if (!text) {
      throw err;
    }

    console.warn(
      `[ai] Structured output parse failed${providerId ? ` for ${providerId}` : ""}; attempting repair.`,
      err,
    );

    const repaired = await repairGeneratedObjectText({
      text,
      schema,
      model,
      system,
      providerId,
      providerOptions,
      maxOutputTokens,
      sectionAliases,
    });

    const repairedObject = validateJsonCandidate(repaired, schema);
    if (repairedObject) {
      console.warn(
        `[ai] Structured output repaired${providerId ? ` for ${providerId}` : ""}.`,
      );
      return { object: repairedObject };
    }

    console.warn(
      `[ai] Structured output repair failed${providerId ? ` for ${providerId}` : ""}.`,
    );
    throw err;
  }
}
