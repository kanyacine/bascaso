import { NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appMarkers } from "@/db/schema";
import { parseBody, errorJson } from "@/lib/api-helpers";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const createSchema = z.object({
  date: dateSchema,
  label: z.string().min(1).max(80),
  color: z.string().max(16).optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  date: dateSchema.optional(),
  label: z.string().min(1).max(80).optional(),
  color: z.string().max(16).optional().nullable(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  try {
    const rows = await db
      .select()
      .from(appMarkers)
      .where(eq(appMarkers.appId, appId))
      .orderBy(asc(appMarkers.date));
    return NextResponse.json({ markers: rows });
  } catch (err) {
    return errorJson(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const parsed = await parseBody(request, createSchema);
  if (parsed instanceof Response) return parsed;

  try {
    const [row] = await db
      .insert(appMarkers)
      .values({
        appId,
        date: parsed.date,
        label: parsed.label,
        color: parsed.color ?? null,
      })
      .returning();
    return NextResponse.json({ marker: row });
  } catch (err) {
    return errorJson(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const parsed = await parseBody(request, updateSchema);
  if (parsed instanceof Response) return parsed;

  const updates: Partial<typeof appMarkers.$inferInsert> = {};
  if (parsed.date !== undefined) updates.date = parsed.date;
  if (parsed.label !== undefined) updates.label = parsed.label;
  if (parsed.color !== undefined) updates.color = parsed.color ?? null;

  try {
    const [row] = await db
      .update(appMarkers)
      .set(updates)
      .where(and(eq(appMarkers.id, parsed.id), eq(appMarkers.appId, appId)))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "Marker not found" }, { status: 404 });
    }
    return NextResponse.json({ marker: row });
  } catch (err) {
    return errorJson(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    await db
      .delete(appMarkers)
      .where(and(eq(appMarkers.id, id), eq(appMarkers.appId, appId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
