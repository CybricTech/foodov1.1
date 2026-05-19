"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";

type BlogPostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  author_name: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

interface Props {
  initialPosts: BlogPostRow[];
}

export function LandingBlogListClient({ initialPosts }: Props) {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPostRow[]>(initialPosts);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlogPostRow | null>(null);

  async function togglePublish(post: BlogPostRow) {
    setBusyId(post.id);
    const res = await fetch(`/api/admin/landing/blog/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !post.is_published }),
    });
    if (res.ok) {
      const { post: updated } = await res.json();
      setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
    }
    setBusyId(null);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    const res = await fetch(`/api/admin/landing/blog/${confirmDelete.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== confirmDelete.id));
      setConfirmDelete(null);
    }
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText size={20} className="text-purple-500" />
          <h1 className="text-2xl font-bold text-black-900">
            Blog ({posts.length})
          </h1>
        </div>
        <Link
          href="/admin/landing/blog/new"
          className="bg-purple-500 hover:bg-purple-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          New post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black-200 p-12 text-center">
          <FileText size={32} className="text-black-300 mx-auto mb-3" />
          <p className="text-black-500 text-sm mb-4">No posts yet.</p>
          <Link
            href="/admin/landing/blog/new"
            className="inline-flex items-center gap-2 bg-purple-500 hover:bg-purple-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={16} />
            Create your first post
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          {posts.map((post) => (
            <div
              key={post.id}
              className="flex items-center gap-4 px-4 py-4 border-b border-black-200 last:border-0"
            >
              {post.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.cover_image_url}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover bg-black-100 flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-black-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-black-300" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-black-900 truncate">
                    {post.title}
                  </p>
                  <span
                    className={
                      post.is_published
                        ? "text-xs px-2 py-0.5 rounded-full bg-viridian-100 text-viridian-700 font-medium"
                        : "text-xs px-2 py-0.5 rounded-full bg-black-100 text-black-500 font-medium"
                    }
                  >
                    {post.is_published ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="text-xs text-black-500 truncate">/{post.slug}</p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => togglePublish(post)}
                  disabled={busyId === post.id}
                  className="p-2 text-black-500 hover:text-black-900 hover:bg-black-100 rounded-lg transition-colors disabled:opacity-50"
                  title={post.is_published ? "Unpublish" : "Publish"}
                >
                  {post.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <Link
                  href={`/admin/landing/blog/${post.id}`}
                  className="p-2 text-black-500 hover:text-black-900 hover:bg-black-100 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Pencil size={16} />
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(post)}
                  className="p-2 text-black-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h2 className="font-bold text-black-900 mb-2">Delete post?</h2>
            <p className="text-sm text-black-500 mb-6">
              &ldquo;{confirmDelete.title}&rdquo; will be permanently removed. This
              cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-black-500 hover:bg-black-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={busyId === confirmDelete.id}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors disabled:opacity-50"
              >
                {busyId === confirmDelete.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
