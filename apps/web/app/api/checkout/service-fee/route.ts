import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("service_charge_pct, service_charge_fixed_kobo")
    .single();

  return NextResponse.json({
    pct: data?.service_charge_pct ?? 0,
    fixedKobo: data?.service_charge_fixed_kobo ?? 0,
  });
}
