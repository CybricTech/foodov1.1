"use client";

import { useState } from "react";
import { cn } from "@foodo/ui";
import type { Restaurant } from "@foodo/database";

interface MerchantsClientProps {
  initialRestaurants: Restaurant[];
}

export function MerchantsClient({ initialRestaurants }: MerchantsClientProps) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [showOnboard, setShowOnboard] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">
          Merchants ({restaurants.length})
        </h1>
        <button
          onClick={() => setShowOnboard(true)}
          className="bg-viridian-500 hover:bg-viridian-500/90 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          + Onboard merchant
        </button>
      </div>

      <div className="bg-black-900 rounded-2xl border border-black-500 overflow-hidden">
        {restaurants.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-4 px-4 py-4 border-b border-black-500 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white text-sm">{r.name}</p>
              <p className="text-xs text-black-400 mt-0.5">
                /{r.slug} · {r.city ?? ""}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  r.is_active
                    ? "bg-viridian-500/20 text-viridian-500"
                    : "bg-black-500/30 text-black-400"
                )}
              >
                {r.is_active ? "Active" : "Inactive"}
              </span>
              <button
                onClick={() => toggleActive(r.id, r.is_active)}
                disabled={toggling === r.id}
                className="text-xs text-black-400 hover:text-white px-3 py-1.5 rounded-lg border border-black-500 hover:border-black-400 transition-colors disabled:opacity-50"
              >
                {toggling === r.id ? "…" : r.is_active ? "Pause" : "Activate"}
              </button>
            </div>
          </div>
        ))}

        {restaurants.length === 0 && (
          <div className="py-12 text-center text-black-400">
            <p className="text-2xl mb-2">🏪</p>
            <p className="text-sm">No merchants yet</p>
          </div>
        )}
      </div>

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
  onSuccess: (restaurant: Restaurant) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      body: JSON.stringify({ name, slug, email, city }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Onboarding failed");
      return;
    }

    onSuccess(data.restaurant);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black-950/80 px-4">
      <div className="bg-black-900 rounded-2xl border border-black-500 w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-4 border-b border-black-500">
          <h2 className="font-bold text-white">Onboard new merchant</h2>
          <button onClick={onClose} className="text-black-400 hover:text-white">
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
            className="w-full bg-viridian-500 hover:bg-viridian-500/90 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
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
      <label className="block text-sm font-medium text-black-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

const adminInputCls =
  "w-full px-4 py-2.5 rounded-xl bg-black-950 border border-black-500 text-white text-sm focus:outline-none focus:border-viridian-500";
