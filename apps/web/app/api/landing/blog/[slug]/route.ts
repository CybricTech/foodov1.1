import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { corsHeaders, preflight } from "@/lib/api/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get("origin"));
}

// GET /api/landing/blog/[slug] — full post body. Only published posts.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const { slug } = await params;
  const serviceClient = createServiceClient();

  const { data, error } = await serviceClient
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, content, cover_image_url, author_name, read_minutes, published_at"
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }

  return NextResponse.json({ post: data }, { status: 200, headers });
}
