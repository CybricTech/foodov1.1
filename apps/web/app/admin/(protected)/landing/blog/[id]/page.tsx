import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import {
  LandingBlogEditorClient,
  type BlogPostFull,
} from "@/components/admin/landing-blog-editor-client";

export const dynamic = "force-dynamic";

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, content, cover_image_url, author_name, read_minutes, is_published"
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  return <LandingBlogEditorClient mode="edit" initial={data as BlogPostFull} />;
}
