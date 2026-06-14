"use client";

/**
 * Admin authoring for "What's New" changelog entries.
 *
 * Mutations go straight through the browser Supabase client — the
 * changelog_admin_all RLS policy restricts all writes to super_admins, and the
 * admin layout already gates the route, so no extra API surface is needed.
 * Publishing = stamping published_at (now to publish, null to revert to draft).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

type Entry = {
  id: string;
  title: string;
  body: string;
  tag: string;
  image_url: string | null;
  version_label: string | null;
  published_at: string | null;
  created_at: string;
};

type Draft = {
  id: string | null;
  title: string;
  body: string;
  tag: string;
  image_url: string;
  version_label: string;
};

const EMPTY: Draft = { id: null, title: "", body: "", tag: "new", image_url: "", version_label: "" };

const TAGS = ["new", "improved", "fixed"] as const;

export function ChangelogAdminClient({ initialEntries }: { initialEntries: Entry[] }) {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function refresh() {
    router.refresh();
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim() || !draft.body.trim()) {
      setError("Title and description are required.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      tag: draft.tag,
      image_url: draft.image_url.trim() || null,
      version_label: draft.version_label.trim() || null,
    };
    try {
      if (draft.id) {
        const { data, error: e } = await supabase
          .from("changelog_entries")
          .update(payload)
          .eq("id", draft.id)
          .select("id, title, body, tag, image_url, version_label, published_at, created_at")
          .single();
        if (e) throw e;
        setEntries((prev) => prev.map((x) => (x.id === data.id ? (data as Entry) : x)));
      } else {
        const { data, error: e } = await supabase
          .from("changelog_entries")
          .insert(payload)
          .select("id, title, body, tag, image_url, version_label, published_at, created_at")
          .single();
        if (e) throw e;
        setEntries((prev) => [data as Entry, ...prev]);
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(entry: Entry) {
    const next = entry.published_at ? null : new Date().toISOString();
    const { data, error: e } = await supabase
      .from("changelog_entries")
      .update({ published_at: next })
      .eq("id", entry.id)
      .select("id, title, body, tag, image_url, version_label, published_at, created_at")
      .single();
    if (e) {
      setError(e.message);
      return;
    }
    setEntries((prev) => prev.map((x) => (x.id === data.id ? (data as Entry) : x)));
    refresh();
  }

  async function remove(entry: Entry) {
    if (!confirm(`Delete "${entry.title}"? This can't be undone.`)) return;
    const { error: e } = await supabase.from("changelog_entries").delete().eq("id", entry.id);
    if (e) {
      setError(e.message);
      return;
    }
    setEntries((prev) => prev.filter((x) => x.id !== entry.id));
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Sparkles size={20} className="text-purple-500" />
          <h1 className="text-2xl font-bold text-black-900">What&rsquo;s New</h1>
        </div>
        <button
          onClick={() => { setDraft({ ...EMPTY }); setError(""); }}
          className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
        >
          <Plus size={16} /> New entry
        </button>
      </div>
      <p className="text-black-500 text-sm mb-6">
        Publish feature announcements to all merchants. Published entries appear in the
        in-app &ldquo;What&rsquo;s New&rdquo; popup on web and mobile.
      </p>

      {error && (
        <div className="mb-4 text-sm text-cinnabar-600 bg-cinnabar-50 border border-cinnabar-200 rounded-xl px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Editor */}
      {draft && (
        <div className="mb-6 bg-white border border-black-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <h2 className="font-bold text-black-900">{draft.id ? "Edit entry" : "New entry"}</h2>

          <div>
            <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">Title</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. Set prep time per item"
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">Description</label>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={4}
              placeholder="Short, friendly explanation of the feature…"
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">Tag</label>
              <select
                value={draft.tag}
                onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm bg-white focus:outline-none focus:border-purple-500 capitalize"
              >
                {TAGS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">Version label (optional)</label>
              <input
                value={draft.version_label}
                onChange={(e) => setDraft({ ...draft, version_label: e.target.value })}
                placeholder="e.g. June 2026"
                className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-black-500 uppercase tracking-wide mb-1.5">Image URL (optional)</label>
            <input
              value={draft.image_url}
              onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
              placeholder="https://…"
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setDraft(null); setError(""); }}
              className="text-black-500 border border-black-200 text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-black-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <span className="self-center text-xs text-black-400 ml-2">
              Saving keeps drafts hidden — use Publish on the list to make it live.
            </span>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2.5">
        {entries.length === 0 ? (
          <p className="text-black-400 text-sm text-center py-12 bg-white border border-black-100 rounded-2xl">
            No entries yet. Create your first announcement.
          </p>
        ) : (
          entries.map((entry) => {
            const published = !!entry.published_at;
            return (
              <div
                key={entry.id}
                className="bg-white border border-black-100 rounded-2xl px-4 py-3.5 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold text-black-900">{entry.title}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600 capitalize">
                      {entry.tag}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        published ? "bg-viridian-100 text-viridian-600" : "bg-black-100 text-black-500"
                      }`}
                    >
                      {published ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="text-xs text-black-500 line-clamp-2">{entry.body}</p>
                  {entry.version_label && (
                    <p className="text-[11px] text-black-400 mt-1">{entry.version_label}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => togglePublish(entry)}
                    title={published ? "Unpublish" : "Publish"}
                    className="p-2 rounded-lg text-black-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer"
                  >
                    {published ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    onClick={() =>
                      setDraft({
                        id: entry.id,
                        title: entry.title,
                        body: entry.body,
                        tag: entry.tag,
                        image_url: entry.image_url ?? "",
                        version_label: entry.version_label ?? "",
                      })
                    }
                    title="Edit"
                    className="p-2 rounded-lg text-black-400 hover:text-black-700 hover:bg-black-50 transition-colors cursor-pointer"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => remove(entry)}
                    title="Delete"
                    className="p-2 rounded-lg text-black-400 hover:text-cinnabar-500 hover:bg-cinnabar-50 transition-colors cursor-pointer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
