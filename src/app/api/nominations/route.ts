import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listNominations,
  createNomination,
  updateNomination,
  deleteNomination,
} from "@/lib/asc/nominations";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { errorJson } from "@/lib/api-helpers";
import { isDemoMode } from "@/lib/demo";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (isDemoMode()) {
    return NextResponse.json({ nominations: [], meta: null });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ nominations: [], meta: null });
  }

  try {
    const nominations = await listNominations(forceRefresh);
    const meta = cacheGetMeta("nominations");
    return NextResponse.json({ nominations, meta });
  } catch (err) {
    return errorJson(err);
  }
}

const createSchema = z.object({
  action: z.literal("create"),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(1000),
  notes: z.string().max(500).optional(),
  type: z.enum(["APP_LAUNCH", "APP_ENHANCEMENTS", "NEW_CONTENT"]),
  publishStartDate: z.string().min(1),
  publishEndDate: z.string().optional(),
  deviceFamilies: z.array(z.string()).optional(),
  locales: z.array(z.string()).optional(),
  hasInAppEvents: z.boolean().optional(),
  launchInSelectMarketsFirst: z.boolean().optional(),
  preOrderEnabled: z.boolean().optional(),
  supplementalMaterialsUris: z.array(z.string().url()).optional(),
  submitted: z.boolean(),
  relatedAppIds: z.array(z.string().min(1)).min(1),
});

const updateSchema = z.object({
  action: z.literal("update"),
  id: z.string().min(1),
  attributes: z.record(z.string(), z.unknown()),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  id: z.string().min(1),
});

const postSchema = z.discriminatedUnion("action", [
  createSchema,
  updateSchema,
  deleteSchema,
]);

export async function POST(request: Request) {
  if (isDemoMode()) {
    return NextResponse.json({ ok: true });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "create") {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { action, ...input } = parsed.data;
      const id = await createNomination(input);
      return NextResponse.json({ ok: true, id });
    }

    if (parsed.data.action === "update") {
      await updateNomination(parsed.data.id, parsed.data.attributes);
      return NextResponse.json({ ok: true });
    }

    // delete
    await deleteNomination(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
