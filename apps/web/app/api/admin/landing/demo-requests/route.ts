import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";

export const dynamic = "force-dynamic";

// GET /api/admin/landing/demo-requests?status=new
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const serviceClient = createServiceClient();
  let query = serviceClient
    .from("demo_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && ["new", "contacted", "closed_won", "closed_lost"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: data ?? [] });
}
