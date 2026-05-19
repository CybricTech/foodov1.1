import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { FileText, Inbox, Globe } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminLandingOverviewPage() {
  const supabase = createServiceClient();

  const [{ count: publishedCount }, { count: draftCount }, { count: newRequestCount }] =
    await Promise.all([
      supabase
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true),
      supabase
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .eq("is_published", false),
      supabase
        .from("demo_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "new"),
    ]);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-1">
        <Globe size={20} className="text-purple-500" />
        <h1 className="text-2xl font-bold text-black-900">Landing Page</h1>
      </div>
      <p className="text-black-500 text-sm mb-8">
        Manage the public Kitchyn landing page: blog posts and demo requests.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <Link
          href="/admin/landing/blog"
          className="bg-white rounded-2xl border border-black-200 p-6 hover:border-purple-500 transition-colors"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <FileText size={20} className="text-purple-500" />
            </div>
            <div>
              <h2 className="font-semibold text-black-900">Blog</h2>
              <p className="text-xs text-black-500">Posts and articles</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <p className="text-2xl font-bold text-black-900">
                {publishedCount ?? 0}
              </p>
              <p className="text-xs text-black-500">Published</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-black-500">{draftCount ?? 0}</p>
              <p className="text-xs text-black-500">Drafts</p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/landing/demo-requests"
          className="bg-white rounded-2xl border border-black-200 p-6 hover:border-purple-500 transition-colors"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Inbox size={20} className="text-purple-500" />
            </div>
            <div>
              <h2 className="font-semibold text-black-900">Demo Requests</h2>
              <p className="text-xs text-black-500">Leads from the landing page</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <p className="text-2xl font-bold text-black-900">
                {newRequestCount ?? 0}
              </p>
              <p className="text-xs text-black-500">New (unread)</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
