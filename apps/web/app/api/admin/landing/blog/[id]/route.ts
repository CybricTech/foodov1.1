import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";
import type { Json } from "@foodo/database";

export const dynamic = "force-dynamic";

const SlugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const UpdatePostSchema = z.object({
  slug: z.string().min(2).max(120).regex(SlugRegex).optional(),
  title: z.string().min(2).max(200).optional(),
  excerpt: z.string().max(500).nullable().optional(),
  content: z.string().min(1).optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  authorName: z.string().max(100).optional(),
  readMinutes: z.number().int().positive().max(120).nullable().optional(),
  isPublished: z.boolean().optional(),
});

// GET /api/admin/landing/blog/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ post: data });
}

// PATCH /api/admin/landing/blog/[id] — partial update
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdatePostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const serviceClient = createServiceClient();

  // Look up current state to decide if published_at should be set
  const { data: current } = await serviceClient
    .from("blog_posts")
    .select("is_published, published_at")
    .eq("id", id)
    .maybeSingle();

  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const input = parsed.data;
  const updates: Record<string, unknown> = {};
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.title !== undefined) updates.title = input.title;
  if (input.excerpt !== undefined) updates.excerpt = input.excerpt;
  if (input.content !== undefined) updates.content = input.content;
  if (input.coverImageUrl !== undefined) updates.cover_image_url = input.coverImageUrl;
  if (input.authorName !== undefined) updates.author_name = input.authorName;
  if (input.readMinutes !== undefined) updates.read_minutes = input.readMinutes;

  if (input.isPublished !== undefined) {
    updates.is_published = input.isPublished;
    // Set published_at the first time we publish; clear if we unpublish.
    if (input.isPublished && !current.is_published) {
      updates.published_at = new Date().toISOString();
    } else if (!input.isPublished) {
      updates.published_at = null;
    }
  }

  const { data, error } = await serviceClient
    .from("blog_posts")
    .update(updates)
    .eq("id", id)
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
    action: "update_blog_post",
    target_type: "blog_post",
    target_id: id,
    metadata: { changes: Object.keys(updates) } as Json,
  });

  return NextResponse.json({ post: data });
}

// DELETE /api/admin/landing/blog/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  const serviceClient = createServiceClient();
  const { error } = await serviceClient.from("blog_posts").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await serviceClient.from("audit_logs").insert({
    actor_id: guard.userId,
    action: "delete_blog_post",
    target_type: "blog_post",
    target_id: id,
    metadata: {} as Json,
  });

  return NextResponse.json({ ok: true });
}
