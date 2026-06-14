import { createServiceClient } from "@/lib/supabase/server";
import { ChangelogAdminClient } from "@/components/admin/changelog-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminChangelogPage() {
  // Layout already gates super_admin. Load all entries (incl. drafts) for editing.
  const supabase = createServiceClient();
  const { data: entries } = await supabase
    .from("changelog_entries")
    .select("id, title, body, tag, image_url, version_label, published_at, created_at")
    .order("created_at", { ascending: false });

  return <ChangelogAdminClient initialEntries={entries ?? []} />;
}
