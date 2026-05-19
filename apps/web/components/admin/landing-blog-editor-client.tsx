"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";

export type BlogPostFull = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  author_name: string;
  read_minutes: number | null;
  is_published: boolean;
};

interface Props {
  mode: "create" | "edit";
  initial?: BlogPostFull;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function LandingBlogEditorClient({ mode, initial }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.cover_image_url ?? "");
  const [authorName, setAuthorName] = useState(initial?.author_name ?? "Kitchyn Team");
  const [readMinutes, setReadMinutes] = useState<string>(
    initial?.read_minutes != null ? String(initial.read_minutes) : ""
  );
  const [isPublished, setIsPublished] = useState(initial?.is_published ?? false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleCoverUpload(file: File) {
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/landing/blog/upload", {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      const { url } = await res.json();
      setCoverImageUrl(url);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Upload failed");
    }
    setUploading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim() || null,
      content,
      coverImageUrl: coverImageUrl.trim() || null,
      authorName: authorName.trim() || "Kitchyn Team",
      readMinutes: readMinutes ? Number(readMinutes) : null,
      isPublished,
    };

    const url =
      mode === "create"
        ? "/api/admin/landing/blog"
        : `/api/admin/landing/blog/${initial!.id}`;

    const res = await fetch(url, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      router.push("/admin/landing/blog");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <Link
        href="/admin/landing/blog"
        className="inline-flex items-center gap-2 text-sm text-black-500 hover:text-black-900 mb-4"
      >
        <ArrowLeft size={16} />
        Back to posts
      </Link>

      <h1 className="text-2xl font-bold text-black-900 mb-6">
        {mode === "create" ? "New post" : "Edit post"}
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <Field label="Title" required>
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="How we 10x'd our orders in 60 days"
            className="w-full bg-white border border-black-200 rounded-xl px-4 py-2.5 text-black-900 focus:outline-none focus:border-purple-500"
          />
        </Field>

        <Field
          label="Slug"
          required
          hint="URL: /blog/[slug] — lowercase letters, numbers, hyphens"
        >
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            placeholder="how-we-10xed-our-orders"
            className="w-full bg-white border border-black-200 rounded-xl px-4 py-2.5 text-black-900 focus:outline-none focus:border-purple-500 font-mono text-sm"
          />
        </Field>

        <Field label="Excerpt" hint="One- or two-sentence summary shown on the blog index">
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={2}
            placeholder="A short hook readers see before they click through."
            className="w-full bg-white border border-black-200 rounded-xl px-4 py-2.5 text-black-900 focus:outline-none focus:border-purple-500"
          />
        </Field>

        <Field label="Cover image">
          {coverImageUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImageUrl}
                alt=""
                className="w-full aspect-[16/9] object-cover rounded-xl border border-black-200"
              />
              <button
                onClick={() => setCoverImageUrl("")}
                type="button"
                className="absolute top-2 right-2 bg-white/90 hover:bg-white text-black-900 p-2 rounded-lg shadow"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-black-200 rounded-xl py-10 cursor-pointer hover:border-purple-500 transition-colors">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCoverUpload(file);
                }}
                className="hidden"
              />
              {uploading ? (
                <Loader2 size={20} className="text-black-500 animate-spin" />
              ) : (
                <ImagePlus size={20} className="text-black-500" />
              )}
              <span className="text-sm text-black-500">
                {uploading ? "Uploading…" : "Click to upload (JPEG, PNG, or WebP, ≤5MB)"}
              </span>
            </label>
          )}
        </Field>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Author">
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="w-full bg-white border border-black-200 rounded-xl px-4 py-2.5 text-black-900 focus:outline-none focus:border-purple-500"
            />
          </Field>
          <Field label="Read time (minutes)">
            <input
              type="number"
              min={1}
              max={120}
              value={readMinutes}
              onChange={(e) => setReadMinutes(e.target.value)}
              placeholder="5"
              className="w-full bg-white border border-black-200 rounded-xl px-4 py-2.5 text-black-900 focus:outline-none focus:border-purple-500"
            />
          </Field>
        </div>

        <Field
          label="Content"
          required
          hint="Markdown supported. Use ## for headings, ** for bold, etc."
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={18}
            placeholder="Write your post in Markdown..."
            className="w-full bg-white border border-black-200 rounded-xl px-4 py-3 text-black-900 focus:outline-none focus:border-purple-500 font-mono text-sm leading-relaxed"
          />
        </Field>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="w-4 h-4 accent-purple-500"
          />
          <span className="text-sm font-medium text-black-900">
            Publish immediately
          </span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-black-200">
          <Link
            href="/admin/landing/blog"
            className="px-4 py-2 text-sm font-medium text-black-500 hover:bg-black-100 rounded-xl transition-colors"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim() || !slug.trim() || !content.trim()}
            className="flex items-center gap-2 bg-purple-500 hover:bg-purple-400 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {mode === "create" ? "Create post" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-black-900">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {hint && <span className="text-xs text-black-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
