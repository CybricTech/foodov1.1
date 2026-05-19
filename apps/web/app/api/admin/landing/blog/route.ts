import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";
import type { Json } from "@foodo/database";

export const dynamic = "force-dynamic";

const SlugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CreatePostSchema = z.object({
  slug: z.string().min(2).max(120).regex(SlugRegex, "Slug must be lowercase, hyphen-separated"),
  title: z.string().min(2).max(200),
  excerpt: z.string().max(500).optional().nullable(),
  content: z.string().min(1),
  coverImageUrl: z.string().url().optional().nullable(),
  authorName: z.string().max(100).optional(),
  readMinutes: z.number().int().positive().max(120).optional().nullable(),
  isPublished: z.boolean().optional(),
});

// GET /api/admin/landing/blog — list all posts (published + drafts)
export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, cover_image_url, author_name, is_published, published_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ posts: data ?? [] });
}

// POST /api/admin/landing/blog — create new post
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreatePostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const input = parsed.data;
  const isPublished = input.isPublished ?? false;
  const serviceClient = createServiceClient();

  const { data, error } = await serviceClient
    .from("blog_posts")
    .insert({
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt ?? null,
      content: input.content,
      cover_image_url: input.coverImageUrl ?? null,
      author_name: input.authorName ?? "Kitchyn Team",
      read_minutes: input.readMinutes ?? null,
      is_published: isPublished,
      published_at: isPublished ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A post with this slug already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await serviceClient.from("audit_logs").insert({
    actor_id: guard.userId,
    action: "create_blog_post",
    target_type: "blog_post",
    target_id: data.id,
    metadata: { slug: data.slug, title: data.title } as Json,
  });

  return NextResponse.json({ post: data }, { status: 201 });
}
