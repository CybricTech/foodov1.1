import { createServiceClient } from "@/lib/supabase/server";
import { LandingBlogListClient } from "@/components/admin/landing-blog-list-client";

export const dynamic = "force-dynamic";

export default async function AdminLandingBlogPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, cover_image_url, author_name, is_published, published_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  return <LandingBlogListClient initialPosts={data ?? []} />;
}
