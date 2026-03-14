import { createServiceClient } from "@/lib/supabase/server";
import { SmsLogsClient } from "@/components/admin/sms-logs-client";

export const dynamic = "force-dynamic";

export default async function SmsLogsPage() {
  const supabase = createServiceClient();

  const { data: logsData } = await supabase
    .from("sms_logs")
    .select(
      "id, phone, event_type, provider, status, created_at, sent_at, restaurant_id, restaurants(name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <SmsLogsClient initialLogs={(logsData as unknown as any[]) ?? []} />;
}
