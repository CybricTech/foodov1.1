import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/require-admin";
import { runHealthChecks } from "@/lib/admin/health-checks";

export { type ServiceResult, type HealthResponse } from "@/lib/admin/health-checks";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const data = await runHealthChecks();
  return NextResponse.json(data);
}
