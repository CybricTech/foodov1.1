import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogClient, type AuditRow } from "@/components/admin/audit-log-client";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("audit_trail")
    .select(
      "id, source, created_at, table_name, operation, restaurant_id, restaurant_name, actor_id, actor_email, actor_name, actor_role_label, detail"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-black-900">Audit Log</h1>
        <p className="text-sm text-black-500 mt-0.5">
          Sign-ins and changes to sensitive data platform-wide, recorded by database
          triggers so browser-direct writes are covered too.
        </p>
      </div>
      <AuditLogClient initialRows={(data as AuditRow[]) ?? []} />
    </div>
  );
}
