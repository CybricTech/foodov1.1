import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// POST /api/admin/landing/blog/upload — multipart/form-data, field "file".
// Returns the public URL of the uploaded image in the blog-images bucket.
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, and WebP images allowed" },
      { status: 415 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 5MB" }, { status: 413 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `covers/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const serviceClient = createServiceClient();
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await serviceClient.storage
    .from("blog-images")
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: pub } = serviceClient.storage.from("blog-images").getPublicUrl(path);

  return NextResponse.json({ url: pub.publicUrl, path }, { status: 201 });
}
