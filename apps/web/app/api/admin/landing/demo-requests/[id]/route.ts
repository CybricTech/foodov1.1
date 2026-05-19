import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";
import type { Json } from "@foodo/database";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  status: z.enum(["new", "contacted", "closed_won", "closed_lost"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// PATCH /api/admin/landing/demo-requests/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("demo_requests")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await serviceClient.from("audit_logs").insert({
    actor_id: guard.userId,
    action: "update_demo_request",
    target_type: "demo_request",
    target_id: id,
    metadata: { changes: Object.keys(updates) } as Json,
  });

  return NextResponse.json({ request: data });
}
