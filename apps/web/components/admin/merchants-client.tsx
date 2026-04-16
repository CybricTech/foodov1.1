"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@foodo/ui";
import { Store, ExternalLink, MapPin } from "lucide-react";
import type { Restaurant } from "@foodo/database";

type RestaurantWithLocation = Restaurant & {
  latitude?: number | null;
  longitude?: number | null;
  whatsapp_number?: string | null;
};

interface MerchantsClientProps {
  initialRestaurants: RestaurantWithLocation[];
}

export function MerchantsClient({ initialRestaurants }: MerchantsClientProps) {
  const [restaurants, setRestaurants] = useState<RestaurantWithLocation[]>(initialRestaurants);
  const [showOnboard, setShowOnboard] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Restaurant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function toggleActive(id: string, current: boolean) {
    setToggling(id);
    const res = await fetch("/api/admin/merchants/toggle-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: id, isActive: !current }),
    });
    if (res.ok) {
      setRestaurants((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_active: !current } : r))
      );
    }
    setToggling(null);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError("");
    const res = await fetch("/api/admin/merchants/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: confirmDelete.id }),
    });
    if (res.ok) {
      setRestaurants((prev) => prev.filter((r) => r.id !== confirmDelete.id));
      setConfirmDelete(null);
    } else {
      const data = await res.json();
      setDeleteError(data.error ?? "Delete failed");
    }
    setDeleting(false);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-black-900">
          Merchants ({restaurants.length})
        </h1>
        <button
          onClick={() => setShowOnboard(true)}
          className="bg-purple-500 hover:bg-purple-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          + Onboard merchant
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        {restaurants.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-4 px-4 py-4 border-b border-black-200 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-black-900 text-sm">{r.name}</p>
              <p className="text-xs text-black-500 mt-0.5">
                /{r.slug} · {r.city ?? ""}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span
                title={r.latitude && r.longitude ? `Location set: ${r.latitude}, ${r.longitude}` : "No location set — delivery fees will use base rate"}
                className={cn(
                  "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium",
                  r.latitude && r.longitude
                    ? "bg-viridian-100 text-viridian-600"
                    : "bg-dixie-100 text-dixie-600"
                )}
              >
                <MapPin size={11} />
                {r.latitude && r.longitude ? "Located" : "No location"}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium",
                  r.whatsapp_number
                    ? "bg-viridian-100 text-viridian-600"
                    : "bg-black-100 text-black-400"
                )}
              >
                {r.whatsapp_number ? "💬 WhatsApp" : "SMS only"}
              </span>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  r.is_active
                    ? "bg-viridian-100 text-viridian-500"
                    : "bg-cinnabar-100 text-cinnabar-500"
                )}
              >
                {r.is_active ? "Active" : "Inactive"}
              </span>
              <a
                href={`/${r.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                title="View storefront"
                className="text-black-400 hover:text-black-900 transition-colors"
              >
                <ExternalLink size={15} />
              </a>
              <button
                onClick={() => toggleActive(r.id, r.is_active)}
                disabled={toggling === r.id}
                className="text-xs text-black-500 hover:text-black-900 px-3 py-1.5 rounded-lg border border-black-200 hover:border-black-400 transition-colors disabled:opacity-50"
              >
                {toggling === r.id ? "…" : r.is_active ? "Pause" : "Activate"}
              </button>
              <Link
                href={`/admin/merchants/${r.id}`}
                className="text-xs text-purple-500 hover:text-purple-400 px-3 py-1.5 rounded-lg border border-purple-200 hover:border-purple-400 transition-colors"
              >
                Details
              </Link>
              <button
                onClick={() => { setDeleteError(""); setConfirmDelete(r); }}
                className="text-xs text-cinnabar-500 hover:text-cinnabar-500/80 px-3 py-1.5 rounded-lg border border-cinnabar-500/30 hover:border-cinnabar-500/60 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {restaurants.length === 0 && (
          <div className="py-12 text-center text-black-400">
            <div className="flex justify-center mb-2"><Store size={28} /></div>
            <p className="text-sm">No merchants yet</p>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black-900/40 px-4">
          <div className="bg-white rounded-2xl border border-black-200 w-full max-w-sm">
            <div className="px-5 py-5 space-y-3">
              <h2 className="font-bold text-black-900">Delete merchant?</h2>
              <p className="text-sm text-black-500">
                This will permanently delete{" "}
                <span className="text-black-900 font-medium">{confirmDelete.name}</span>{" "}
                and all associated data. This cannot be undone.
              </p>
              {deleteError && (
                <p className="text-sm text-cinnabar-500">{deleteError}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl border border-black-200 text-sm text-black-500 hover:text-black-900 hover:border-black-400 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-cinnabar-500 hover:bg-cinnabar-500/90 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOnboard && (
        <OnboardModal
          onClose={() => setShowOnboard(false)}
          onSuccess={(restaurant) => {
            setRestaurants((prev) => [restaurant, ...prev]);
            setShowOnboard(false);
          }}
        />
      )}
    </div>
  );
}

function OnboardModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (restaurant: RestaurantWithLocation) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ email: string; password: string } | null>(null);

  function deriveSlug(n: string) {
    return n
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/admin/merchants/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, email, password, city }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Onboarding failed");
      return;
    }

    onSuccess(data.restaurant);
    setSuccess({ email, password: data.password });
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black-900/40 px-4">
        <div className="bg-white rounded-2xl border border-black-200 w-full max-w-md">
          <div className="flex items-center justify-between px-4 py-4 border-b border-black-200">
            <h2 className="font-bold text-black-900">Merchant created</h2>
          </div>
          <div className="px-4 py-5 space-y-4">
            <p className="text-sm text-black-500">
              Share these credentials with the merchant. They can change their password after logging in.
            </p>
            <div className="bg-black-50 rounded-xl border border-black-200 p-4 space-y-3">
              <div>
                <p className="text-xs text-black-500 mb-1">Email</p>
                <p className="text-sm font-mono text-black-900">{success.email}</p>
              </div>
              <div>
                <p className="text-xs text-black-500 mb-1">Password</p>
                <p className="text-sm font-mono text-black-900">{success.password}</p>
              </div>
              <div>
                <p className="text-xs text-black-500 mb-1">Dashboard URL</p>
                <p className="text-sm font-mono text-black-500">/dashboard</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black-900/40 px-4">
      <div className="bg-white rounded-2xl border border-black-200 w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-4 border-b border-black-200">
          <h2 className="font-bold text-black-900">Onboard new merchant</h2>
          <button onClick={onClose} className="text-black-400 hover:text-black-900">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
          <AdminField label="Restaurant name">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(deriveSlug(e.target.value));
              }}
              required
              className={adminInputCls}
              placeholder="The Copper Pot"
            />
          </AdminField>
          <AdminField label="Slug (URL)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              className={adminInputCls}
              placeholder="the-copper-pot"
            />
          </AdminField>
          <AdminField label="Owner email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={adminInputCls}
              placeholder="owner@restaurant.com"
            />
          </AdminField>
          <AdminField label="Default password">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={cn(adminInputCls, "pr-16")}
                placeholder="Min. 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-black-400 hover:text-black-900"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </AdminField>
          <AdminField label="City">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={adminInputCls}
              placeholder="Lagos"
            />
          </AdminField>

          {error && (
            <p className="text-sm text-cinnabar-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? "Creating…" : "Onboard merchant"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-black-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

const adminInputCls =
  "w-full px-4 py-2.5 rounded-xl bg-black-50 border border-black-200 text-black-900 text-sm focus:outline-none focus:border-purple-500";
