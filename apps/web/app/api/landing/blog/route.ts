import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { corsHeaders, preflight } from "@/lib/api/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get("origin"));
}

// GET /api/landing/blog?limit=20&offset=0
// Returns published posts ordered by published_at DESC.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  const serviceClient = createServiceClient();

  const { data, error, count } = await serviceClient
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, cover_image_url, author_name, read_minutes, published_at",
      { count: "exact" }
    )
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers });
  }

  return NextResponse.json(
    { posts: data ?? [], total: count ?? 0, limit, offset },
    { status: 200, headers }
  );
}
