"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatKobo } from "@foodo/utils";
import {
  DISCOUNT_TYPE_LABELS,
  type DiscountType,
  type DiscountTrigger,
  type DeliveryZone,
} from "@foodo/utils";
import { cn } from "@foodo/ui";
import {
  Megaphone,
  Plus,
  Tag,
  Clock,
  Pencil,
  Trash2,
  Power,
  Sparkles,
  X,
  Ticket,
  Percent,
  BadgePercent,
  Truck,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Send,
  MapPin,
  Loader2,
  Search,
} from "lucide-react";
import type { Discount, Json } from "@foodo/database";

interface MarketingClientProps {
  restaurantId: string;
  initialDiscounts: Discount[];
  senderStatus: "pending" | "approved" | "rejected" | null;
  senderName: string | null;
  customerCounts: {
    all: number;
    inactive30: number;
    vip: number;
  };
}

const INPUT_CLS =
  "w-full px-3.5 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 bg-white";

/* ------------------------------------------------------------------ */
/*  Status derivation                                                   */
/* ------------------------------------------------------------------ */

type DiscountStatus = "active" | "paused" | "scheduled" | "expired" | "used_up" | "archived";

function deriveStatus(d: Discount, now = new Date()): DiscountStatus {
  if (d.archived_at) return "archived";
  if (!d.is_active) return "paused";
  if (d.ends_at && now > new Date(d.ends_at)) return "expired";
  if (d.starts_at && now < new Date(d.starts_at)) return "scheduled";
  if (d.usage_limit_total !== null && d.times_redeemed >= d.usage_limit_total) {
    return "used_up";
  }
  return "active";
}

const STATUS_STYLES: Record<DiscountStatus, string> = {
  active: "bg-viridian-100 text-viridian-700",
  paused: "bg-black-100 text-black-500",
  scheduled: "bg-purple-50 text-purple-700",
  expired: "bg-cinnabar-100 text-cinnabar-600",
  used_up: "bg-orange-100 text-orange-700",
  archived: "bg-black-100 text-black-400",
};

const STATUS_LABELS: Record<DiscountStatus, string> = {
  active: "Active",
  paused: "Paused",
  scheduled: "Scheduled",
  expired: "Expired",
  used_up: "Used up",
  archived: "Archived",
};

const TYPE_ICONS: Record<DiscountType, typeof Percent> = {
  percentage: Percent,
  fixed: BadgePercent,
  free_delivery: Truck,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function describeValue(d: Discount): string {
  switch (d.type as DiscountType) {
    case "percentage":
      return `${d.value ?? 0}% off${
        d.max_discount_kobo ? ` (max ${formatKobo(d.max_discount_kobo)})` : ""
      }`;
    case "fixed":
      return `${formatKobo(d.value ?? 0)} off`;
    case "free_delivery":
      return "Free delivery";
    default:
      return "";
  }
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function MarketingClient({
  restaurantId,
  initialDiscounts,
  senderStatus,
  senderName,
  customerCounts,
}: MarketingClientProps) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [discounts, setDiscounts] = useState<Discount[]>(initialDiscounts);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"offers" | "sms">("offers");

  // ── Realtime: keep the list in sync across staff/devices ──────────
  useEffect(() => {
    const channel = supabase
      .channel(`discounts-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "discounts",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setDiscounts((prev) => {
              const row = payload.new as Discount;
              if (prev.some((d) => d.id === row.id)) return prev;
              return [row, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            setDiscounts((prev) =>
              prev.map((d) =>
                d.id === (payload.new as Discount).id
                  ? (payload.new as Discount)
                  : d
              )
            );
          } else if (payload.eventType === "DELETE") {
            setDiscounts((prev) =>
              prev.filter((d) => d.id !== (payload.old as Discount).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [restaurantId, supabase]);

  async function toggleActive(d: Discount) {
    setBusyId(d.id);
    setDiscounts((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, is_active: !x.is_active } : x))
    );
    const { error } = await supabase
      .from("discounts")
      .update({ is_active: !d.is_active })
      .eq("id", d.id);
    if (error) {
      setDiscounts((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, is_active: d.is_active } : x))
      );
    }
    setBusyId(null);
  }

  // Archive (soft-delete) rather than hard-delete: the promo can no longer be
  // used, but it stays — along with its redemptions and the orders that used it —
  // so the history is never lost.
  async function archive(d: Discount) {
    if (
      !window.confirm(
        `Archive "${d.name}"? Customers can no longer use it, but its history and the orders that used it stay on record.`
      )
    ) {
      return;
    }
    setBusyId(d.id);
    const archivedAt = new Date().toISOString();
    setDiscounts((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, archived_at: archivedAt, is_active: false } : x))
    );
    const { error } = await supabase
      .from("discounts")
      .update({ archived_at: archivedAt, is_active: false })
      .eq("id", d.id);
    if (error) {
      setDiscounts((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, archived_at: null, is_active: d.is_active } : x))
      );
    }
    setBusyId(null);
  }

  const activeCount = discounts.filter(
    (d) => deriveStatus(d) === "active"
  ).length;

  return (
    <div className="md:p-6 pb-24">
      {/* Header */}
      <div className="bg-white md:rounded-2xl border-b md:border border-black-100">
        <div className="px-4 py-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
              <Megaphone size={18} className="text-purple-600" />
            </span>
            <div>
              <h1 className="font-bold text-black-900 text-lg leading-tight">
                Marketing
              </h1>
              {activeTab === "offers" && (
                <p className="text-xs text-black-400">
                  {discounts.length} offer{discounts.length === 1 ? "" : "s"} ·{" "}
                  {activeCount} active
                </p>
              )}
              {activeTab === "sms" && (
                <p className="text-xs text-black-400">
                  {customerCounts.all} customer{customerCounts.all === 1 ? "" : "s"} reachable
                </p>
              )}
            </div>
          </div>
          {activeTab === "offers" && (
            <button
              onClick={() => setCreating(true)}
              className="text-sm text-white bg-purple-600 px-4 py-2.5 rounded-xl hover:bg-purple-700 transition-colors font-medium flex items-center gap-1.5"
            >
              <Plus size={16} /> New offer
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-t border-black-100 px-4">
          <button
            onClick={() => setActiveTab("offers")}
            className={cn(
              "py-2.5 px-1 mr-5 text-sm font-medium border-b-2 transition-colors",
              activeTab === "offers"
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-black-400 hover:text-black-700"
            )}
          >
            Offers
          </button>
          <button
            onClick={() => setActiveTab("sms")}
            className={cn(
              "py-2.5 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
              activeTab === "sms"
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-black-400 hover:text-black-700"
            )}
          >
            <MessageSquare size={14} />
            SMS Campaigns
          </button>
        </div>
      </div>

      {/* Offers tab */}
      {activeTab === "offers" && (
        <>
          {discounts.length === 0 ? (
            <div className="mt-10 flex flex-col items-center text-center px-6">
              <span className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mb-4">
                <Sparkles size={24} className="text-purple-600" />
              </span>
              <h2 className="font-bold text-black-900">No offers yet</h2>
              <p className="text-sm text-black-400 mt-1 max-w-xs">
                Create a promo code or a time-based discount to bring customers back
                and grow orders.
              </p>
              <button
                onClick={() => setCreating(true)}
                className="mt-5 text-sm text-white bg-purple-600 px-5 py-2.5 rounded-xl hover:bg-purple-700 transition-colors font-medium flex items-center gap-1.5"
              >
                <Plus size={16} /> Create your first offer
              </button>
            </div>
          ) : (
            <div className="px-4 md:px-0 mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {discounts.map((d) => {
                const status = deriveStatus(d);
                const TypeIcon = TYPE_ICONS[d.type as DiscountType] ?? Tag;
                return (
                  <div
                    key={d.id}
                    className="bg-white rounded-2xl border border-black-100 p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-xl bg-black-50 flex items-center justify-center flex-shrink-0">
                          <TypeIcon size={17} className="text-black-600" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-black-900 text-sm truncate">
                            {d.name}
                          </p>
                          <p className="text-xs text-black-400">
                            {describeValue(d)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
                          STATUS_STYLES[status]
                        )}
                      >
                        {STATUS_LABELS[status]}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div className="flex flex-wrap gap-1.5">
                      {d.trigger === "code" && d.code ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md font-mono">
                          <Ticket size={12} /> {d.code}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-black-500 bg-black-50 px-2 py-0.5 rounded-md">
                          <Clock size={12} /> Automatic
                        </span>
                      )}
                      {d.min_order_kobo > 0 && (
                        <span className="text-[11px] font-medium text-black-500 bg-black-50 px-2 py-0.5 rounded-md">
                          Min {formatKobo(d.min_order_kobo)}
                        </span>
                      )}
                      {d.fulfillment_type && (
                        <span className="text-[11px] font-medium text-black-500 bg-black-50 px-2 py-0.5 rounded-md capitalize">
                          {d.fulfillment_type} only
                        </span>
                      )}
                      {d.type === "free_delivery" && Array.isArray(d.delivery_zones) && d.delivery_zones.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-black-500 bg-black-50 px-2 py-0.5 rounded-md">
                          <MapPin size={12} /> {d.delivery_zones.length} area{d.delivery_zones.length > 1 ? "s" : ""}
                        </span>
                      )}
                      {d.type === "free_delivery" && d.free_delivery_dispatch && (
                        <span className={cn(
                          "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md",
                          d.free_delivery_dispatch === "own_rider"
                            ? "text-emerald-700 bg-emerald-50"
                            : "text-purple-700 bg-purple-50"
                        )}>
                          {d.free_delivery_dispatch === "own_rider" ? <Truck size={12} /> : <Sparkles size={12} />}
                          {d.free_delivery_dispatch === "own_rider" ? "Own rider" : "Platform-funded"}
                        </span>
                      )}
                    </div>

                    {/* Usage */}
                    <div className="text-[11px] text-black-400">
                      {d.times_redeemed} used
                      {d.usage_limit_total !== null &&
                        ` of ${d.usage_limit_total}`}
                      {d.ends_at &&
                        ` · ends ${new Date(d.ends_at).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                        })}`}
                    </div>

                    {/* Actions — archived promos are read-only history */}
                    {status === "archived" ? (
                      <div className="pt-1 border-t border-black-50 text-[11px] text-black-400">
                        Archived
                        {d.archived_at
                          ? ` ${new Date(d.archived_at).toLocaleDateString("en-NG", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}`
                          : ""}{" "}
                        · kept for history
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 pt-1 border-t border-black-50">
                        <button
                          onClick={() => toggleActive(d)}
                          disabled={busyId === d.id}
                          className={cn(
                            "flex-1 text-xs font-medium px-2.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
                            d.is_active
                              ? "text-black-600 hover:bg-black-50"
                              : "text-viridian-700 hover:bg-viridian-100"
                          )}
                        >
                          <Power size={13} />
                          {d.is_active ? "Pause" : "Resume"}
                        </button>
                        <button
                          onClick={() => setEditing(d)}
                          disabled={busyId === d.id}
                          className="flex-1 text-xs font-medium px-2.5 py-2 rounded-lg text-black-600 hover:bg-black-50 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          onClick={() => archive(d)}
                          disabled={busyId === d.id}
                          className="text-xs font-medium px-2.5 py-2 rounded-lg text-cinnabar-600 hover:bg-cinnabar-100 flex items-center justify-center transition-colors disabled:opacity-50"
                          aria-label="Archive offer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* SMS Campaigns tab — gated "coming soon": the composer is previewed but
          non-interactive until the discount/targeting work it depends on ships. */}
      {activeTab === "sms" && (
        <div className="relative">
          <div className="pointer-events-none select-none opacity-40" aria-hidden="true">
            <SmsComposer
              senderStatus={senderStatus}
              senderName={senderName}
              customerCounts={customerCounts}
            />
          </div>
          <div className="absolute inset-0 flex items-start justify-center px-4 pt-12 md:pt-16">
            <div className="bg-white border border-black-200 rounded-2xl shadow-lg px-6 py-6 text-center max-w-sm">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">
                <Clock size={12} /> Coming soon
              </span>
              <h3 className="font-bold text-black-900 mt-3">SMS Campaigns are almost here</h3>
              <p className="text-sm text-black-500 mt-1.5">
                We&rsquo;re finishing the discount integration that powers targeted campaigns.
                You&rsquo;ll be able to message your customers shortly.
              </p>
            </div>
          </div>
        </div>
      )}

      {(creating || editing) && (
        <DiscountForm
          restaurantId={restaurantId}
          discount={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            setDiscounts((prev) => {
              const exists = prev.some((d) => d.id === saved.id);
              return exists
                ? prev.map((d) => (d.id === saved.id ? saved : d))
                : [saved, ...prev];
            });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SMS Campaign Composer                                               */
/* ------------------------------------------------------------------ */

type SmsAudience = "all" | "inactive_30" | "vip";

interface SmsResult {
  total: number;
  sent: number;
  failed: number;
}

function SmsComposer({
  senderStatus,
  senderName,
  customerCounts,
}: {
  senderStatus: "pending" | "approved" | "rejected" | null;
  senderName: string | null;
  customerCounts: { all: number; inactive30: number; vip: number };
}) {
  const [audience, setAudience] = useState<SmsAudience>("all");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SmsResult | null>(null);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const MAX_CHARS = 612;

  const audienceCounts: Record<SmsAudience, number> = {
    all: customerCounts.all,
    inactive_30: customerCounts.inactive30,
    vip: customerCounts.vip,
  };
  const recipientCount = audienceCounts[audience];

  const charCount = message.length;
  const smsCount = charCount === 0 ? 1 : Math.ceil(charCount / 160);

  // Replace {name} with a sample for preview
  const previewText = message.replace(/\{name\}/gi, "Ahmed");

  async function handleSend() {
    setShowConfirm(false);
    setSending(true);
    setError("");
    setResult(null);

    const res = await fetch("/api/dashboard/marketing/sms-campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience, message }),
    });

    const data = await res.json().catch(() => ({}));
    setSending(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to send campaign. Please try again.");
      return;
    }

    setResult(data);
    setMessage("");
  }

  return (
    <div className="px-4 md:px-0 mt-4 space-y-4">
      {/* Sender status banner */}
      {senderStatus === "approved" && senderName ? (
        <div className="flex items-center gap-3 bg-viridian-50 border border-viridian-200 rounded-xl px-4 py-2.5">
          <CheckCircle2 size={14} className="text-viridian-600 flex-shrink-0" />
          <p className="text-xs text-viridian-700">
            Sending as{" "}
            <span className="font-semibold text-viridian-900">{senderName}</span>
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-jasmine-50 border border-jasmine-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-jasmine-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-jasmine-800">Sender ID not yet approved</p>
            <p className="text-xs text-jasmine-700 mt-0.5">
              Messages will arrive from our platform sender name. Contact support to register your own branded Sender ID.
            </p>
          </div>
        </div>
      )}

      {/* Success result */}
      {result && (
        <div className="flex items-start gap-3 bg-viridian-50 border border-viridian-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} className="text-viridian-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-viridian-800">Campaign sent</p>
            <p className="text-xs text-viridian-700 mt-0.5">
              {result.sent} delivered · {result.failed > 0 ? `${result.failed} failed · ` : ""}{result.total} total recipients
            </p>
          </div>
        </div>
      )}

      {/* Audience picker */}
      <div className="bg-white rounded-2xl border border-black-100 p-4">
        <p className="text-xs font-medium text-black-500 mb-3">Who receives this?</p>
        <div className="space-y-2">
          {(
            [
              { value: "all", label: "All customers", hint: "Everyone who has ordered from you" },
              { value: "inactive_30", label: "Inactive 30+ days", hint: "Haven't placed an order in over a month" },
              { value: "vip", label: "VIP customers", hint: "Loyal customers with 3 or more orders" },
            ] as { value: SmsAudience; label: string; hint: string }[]
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAudience(opt.value)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left",
                audience === opt.value
                  ? "border-purple-500 bg-purple-50"
                  : "border-black-100 hover:bg-black-50"
              )}
            >
              {/* Radio dot */}
              <div
                className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                  audience === opt.value ? "border-purple-500" : "border-black-300"
                )}
              >
                {audience === opt.value && (
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    audience === opt.value ? "text-purple-700" : "text-black-900"
                  )}
                >
                  {opt.label}
                </p>
                <p className="text-[11px] text-black-400">{opt.hint}</p>
              </div>
              <span
                className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
                  audience === opt.value
                    ? "bg-purple-100 text-purple-700"
                    : "bg-black-100 text-black-500"
                )}
              >
                {audienceCounts[opt.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Message composer */}
      <div className="bg-white rounded-2xl border border-black-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-black-500">Message</p>
          <span
            className={cn(
              "text-[11px] tabular-nums",
              charCount > MAX_CHARS ? "text-cinnabar-600 font-semibold" : "text-black-400"
            )}
          >
            {charCount} / {MAX_CHARS} chars · {smsCount} SMS
          </span>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Hi {name}! We have a special offer just for you — use code SAVE20 for 20% off your next order. Valid today only!`}
          rows={5}
          maxLength={MAX_CHARS}
          className="w-full px-3.5 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 bg-white resize-none leading-relaxed"
        />
        <p className="text-[11px] text-black-400 mt-2">
          Use{" "}
          <span className="font-mono bg-black-50 px-1 rounded text-black-700">
            {"{name}"}
          </span>{" "}
          to personalize with the customer&rsquo;s first name. Each SMS is 160 characters.
        </p>
      </div>

      {/* Live preview */}
      {message && (
        <div className="bg-black-50 rounded-xl px-4 py-3">
          <p className="text-[11px] font-medium text-black-500 mb-1.5">
            Preview · as seen by Ahmed
          </p>
          <p className="text-sm text-black-700 leading-relaxed whitespace-pre-wrap">
            {previewText}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-cinnabar-600 bg-cinnabar-100 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}

      {/* Send button */}
      <button
        disabled={!message.trim() || charCount > MAX_CHARS || recipientCount === 0 || sending}
        onClick={() => setShowConfirm(true)}
        className="w-full py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-sm"
      >
        {sending ? (
          <>Sending…</>
        ) : (
          <>
            <Send size={15} />
            Send to {recipientCount} customer{recipientCount === 1 ? "" : "s"}
          </>
        )}
      </button>

      {recipientCount === 0 && (
        <p className="text-xs text-center text-black-400">
          No customers in this segment yet.
        </p>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black-900/40 backdrop-blur-sm px-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-4">
              <MessageSquare size={20} className="text-purple-600" />
            </div>
            <h3 className="font-bold text-black-900 text-base">Send this campaign?</h3>
            <p className="text-sm text-black-500 mt-2 leading-relaxed">
              This will send an SMS to{" "}
              <span className="font-semibold text-black-900">
                {recipientCount} customer{recipientCount === 1 ? "" : "s"}
              </span>
              . This action cannot be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-black-200 text-black-600 font-medium text-sm hover:bg-black-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white font-semibold text-sm hover:bg-purple-700 transition-colors"
              >
                Send now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Create / edit form (drawer-style modal)                             */
/* ------------------------------------------------------------------ */

interface DiscountFormProps {
  restaurantId: string;
  discount: Discount | null;
  onClose: () => void;
  onSaved: (d: Discount) => void;
}

function DiscountForm({
  restaurantId,
  discount,
  onClose,
  onSaved,
}: DiscountFormProps) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const isEdit = !!discount;

  const [name, setName] = useState(discount?.name ?? "");
  const [trigger, setTrigger] = useState<DiscountTrigger>(
    (discount?.trigger as DiscountTrigger) ?? "code"
  );
  const [code, setCode] = useState(discount?.code ?? "");
  const [type, setType] = useState<DiscountType>(
    (discount?.type as DiscountType) ?? "percentage"
  );
  const [percentValue, setPercentValue] = useState(
    type === "percentage" && discount?.value ? String(discount.value) : ""
  );
  const [fixedNaira, setFixedNaira] = useState(
    discount?.type === "fixed" && discount?.value
      ? String(discount.value / 100)
      : ""
  );
  const [maxDiscountNaira, setMaxDiscountNaira] = useState(
    discount?.max_discount_kobo ? String(discount.max_discount_kobo / 100) : ""
  );
  const [minOrderNaira, setMinOrderNaira] = useState(
    discount?.min_order_kobo ? String(discount.min_order_kobo / 100) : ""
  );
  const [fulfillment, setFulfillment] = useState<"" | "delivery" | "pickup">(
    (discount?.fulfillment_type as "delivery" | "pickup" | null) ?? ""
  );
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(discount?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(discount?.ends_at ?? null));
  const [usageTotal, setUsageTotal] = useState(
    discount?.usage_limit_total ? String(discount.usage_limit_total) : ""
  );
  const [perCustomer, setPerCustomer] = useState(
    discount?.usage_limit_per_customer
      ? String(discount.usage_limit_per_customer)
      : ""
  );

  // Geo-fenced free delivery: target specific areas (campuses, estates). Empty
  // = free delivery everywhere (the original behaviour).
  const [zones, setZones] = useState<DeliveryZone[]>(
    Array.isArray(discount?.delivery_zones)
      ? (discount!.delivery_zones as unknown as DeliveryZone[])
      : []
  );
  // Who fulfils/funds a free-delivery order. Reuses orders.dispatch_type
  // vocabulary so it stamps straight onto the order and settles correctly:
  // 'platform_rider' => merchant-funded (debited the full fee at settlement);
  // 'own_rider' => merchant delivers, Foodo takes only the 10% commission.
  const [dispatch, setDispatch] = useState<"own_rider" | "platform_rider">(
    (discount?.free_delivery_dispatch as "own_rider" | "platform_rider" | null) ??
      "own_rider"
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function validate(): string | null {
    if (name.trim().length < 2) return "Give this offer a name.";
    if (trigger === "code" && code.trim().length < 3)
      return "Enter a promo code of at least 3 characters.";
    if (type === "percentage") {
      const v = Number(percentValue);
      if (!v || v <= 0 || v > 100) return "Enter a percentage between 1 and 100.";
    }
    if (type === "fixed") {
      const v = Number(fixedNaira);
      if (!v || v <= 0) return "Enter a discount amount greater than ₦0.";
    }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt))
      return "End time must be after the start time.";
    return null;
  }

  async function handleSubmit() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError("");
    setSaving(true);

    const naira = (s: string) => (s ? Math.round(Number(s) * 100) : null);

    const payload = {
      restaurant_id: restaurantId,
      name: name.trim(),
      trigger,
      code: trigger === "code" ? code.trim().toUpperCase() : null,
      type,
      value:
        type === "percentage"
          ? Number(percentValue)
          : type === "fixed"
            ? naira(fixedNaira)
            : null,
      max_discount_kobo:
        type === "percentage" ? naira(maxDiscountNaira) : null,
      min_order_kobo: naira(minOrderNaira) ?? 0,
      fulfillment_type: fulfillment || null,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      usage_limit_total: usageTotal ? Number(usageTotal) : null,
      usage_limit_per_customer: perCustomer ? Number(perCustomer) : null,
      // Geo-fencing + dispatch attribution only apply to free-delivery offers.
      delivery_zones:
        type === "free_delivery" && zones.length > 0
          ? (zones as unknown as Json)
          : null,
      free_delivery_dispatch: type === "free_delivery" ? dispatch : null,
    };

    let result;
    if (isEdit && discount) {
      result = await supabase
        .from("discounts")
        .update(payload)
        .eq("id", discount.id)
        .select("*")
        .single();
    } else {
      result = await supabase
        .from("discounts")
        .insert(payload)
        .select("*")
        .single();
    }

    setSaving(false);

    if (result.error || !result.data) {
      const msg = result.error?.message ?? "";
      if (msg.includes("discounts_restaurant_code_unique")) {
        setError("That promo code is already in use. Pick another.");
      } else {
        setError(msg || "Could not save this offer. Please try again.");
      }
      return;
    }

    onSaved(result.data as Discount);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-black-100 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="font-bold text-black-900">
            {isEdit ? "Edit offer" : "New offer"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-black-50 flex items-center justify-center text-black-400"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Name */}
          <Field label="Offer name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekend 20% off"
              className={INPUT_CLS}
            />
          </Field>

          {/* Trigger */}
          <Field label="How customers get it">
            <div className="grid grid-cols-2 gap-2">
              <SegBtn
                active={trigger === "code"}
                onClick={() => setTrigger("code")}
                icon={<Ticket size={15} />}
                label="Promo code"
              />
              <SegBtn
                active={trigger === "automatic"}
                onClick={() => setTrigger("automatic")}
                icon={<Clock size={15} />}
                label="Automatic"
              />
            </div>
          </Field>

          {/* Code */}
          {trigger === "code" && (
            <Field label="Promo code">
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                  className={cn(INPUT_CLS, "font-mono uppercase flex-1")}
                />
                <button
                  type="button"
                  onClick={() => setCode(generateCode())}
                  className="px-3 rounded-xl border border-purple-500 text-purple-600 text-sm font-medium hover:bg-purple-50 transition-colors whitespace-nowrap"
                >
                  Generate
                </button>
              </div>
            </Field>
          )}

          {/* Type */}
          <Field label="Discount type">
            <div className="grid grid-cols-3 gap-2">
              {(["percentage", "fixed", "free_delivery"] as DiscountType[]).map(
                (t) => {
                  const Icon = TYPE_ICONS[t];
                  return (
                    <SegBtn
                      key={t}
                      active={type === t}
                      onClick={() => setType(t)}
                      icon={<Icon size={15} />}
                      label={DISCOUNT_TYPE_LABELS[t]}
                      small
                    />
                  );
                }
              )}
            </div>
          </Field>

          {/* Value (type-specific) */}
          {type === "percentage" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Percent off">
                <div className="relative">
                  <input
                    value={percentValue}
                    onChange={(e) =>
                      setPercentValue(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    inputMode="decimal"
                    placeholder="20"
                    className={cn(INPUT_CLS, "pr-8")}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-black-400 text-sm">
                    %
                  </span>
                </div>
              </Field>
              <Field label="Max discount (optional)">
                <NairaInput value={maxDiscountNaira} onChange={setMaxDiscountNaira} placeholder="2,000" />
              </Field>
            </div>
          )}

          {type === "fixed" && (
            <Field label="Amount off">
              <NairaInput value={fixedNaira} onChange={setFixedNaira} placeholder="500" />
            </Field>
          )}

          {type === "free_delivery" && (
            <>
              <p className="text-xs text-black-400 bg-black-50 rounded-xl px-3 py-2.5">
                Waives the delivery fee on qualifying delivery orders. Tip: set a
                minimum order below so it stays profitable.
              </p>

              {/* Who delivers / who pays */}
              <Field label="Who delivers these orders?">
                <div className="grid grid-cols-2 gap-2">
                  <SegBtn
                    active={dispatch === "own_rider"}
                    onClick={() => setDispatch("own_rider")}
                    icon={<Truck size={15} />}
                    label="My own rider"
                  />
                  <SegBtn
                    active={dispatch === "platform_rider"}
                    onClick={() => setDispatch("platform_rider")}
                    icon={<Sparkles size={15} />}
                    label="Platform rider"
                  />
                </div>
                <p className="text-[11px] text-black-400 mt-1.5">
                  {dispatch === "own_rider"
                    ? "You deliver with your own rider — the platform isn't dispatched and only takes its standard delivery commission."
                    : "The platform dispatches a rider, and you fund the delivery — the full delivery fee is deducted from your settlement. A free-delivery promo never bills the platform."}
                </p>
              </Field>

              {/* Geo-fenced areas (optional) */}
              <Field label="Free delivery to specific areas (optional)">
                <ZoneEditor zones={zones} onChange={setZones} />
              </Field>
            </>
          )}

          {/* Conditions */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min order (optional)">
              <NairaInput value={minOrderNaira} onChange={setMinOrderNaira} placeholder="0" />
            </Field>
            <Field label="Order type">
              <select
                value={fulfillment}
                onChange={(e) =>
                  setFulfillment(e.target.value as "" | "delivery" | "pickup")
                }
                className={INPUT_CLS}
              >
                <option value="">Delivery &amp; pickup</option>
                <option value="delivery">Delivery only</option>
                <option value="pickup">Pickup only</option>
              </select>
            </Field>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts (optional)">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Ends (optional)">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>

          {/* Limits */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total uses (optional)">
              <input
                value={usageTotal}
                onChange={(e) =>
                  setUsageTotal(e.target.value.replace(/[^0-9]/g, ""))
                }
                inputMode="numeric"
                placeholder="Unlimited"
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Per customer (optional)">
              <input
                value={perCustomer}
                onChange={(e) =>
                  setPerCustomer(e.target.value.replace(/[^0-9]/g, ""))
                }
                inputMode="numeric"
                placeholder="Unlimited"
                className={INPUT_CLS}
              />
            </Field>
          </div>

          {error && (
            <p className="text-sm text-cinnabar-600 bg-cinnabar-100 rounded-xl px-3 py-2.5">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-black-100 px-5 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-black-200 text-black-600 font-medium text-sm hover:bg-black-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 disabled:opacity-60 transition-colors"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create offer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-black-500 mb-1.5 block">
        {label}
      </span>
      {children}
    </label>
  );
}

function SegBtn({
  active,
  onClick,
  icon,
  label,
  small,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 px-2 transition-colors text-center",
        small ? "text-[11px]" : "text-xs",
        active
          ? "border-purple-500 bg-purple-50 text-purple-700 font-semibold"
          : "border-black-200 text-black-500 hover:bg-black-50"
      )}
    >
      {icon}
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function NairaInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black-400 text-sm">
        ₦
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        inputMode="decimal"
        placeholder={placeholder}
        className={cn(INPUT_CLS, "pl-7")}
      />
    </div>
  );
}

/** Radius presets shown per zone, in metres. */
const ZONE_RADIUS_OPTIONS = [
  { m: 500, label: "0.5 km" },
  { m: 1000, label: "1 km" },
  { m: 2000, label: "2 km" },
  { m: 3000, label: "3 km" },
];

/**
 * Places-powered editor for a discount's delivery zones. Searches addresses
 * via our server proxy (/api/places/*), resolves the pick to exact
 * coordinates, and stores each as a { name, lat, lng, radius_m } zone. The
 * customer's destination is matched against these at checkout — no string
 * matching, so "Baze University" means the campus, not a same-named street.
 */
function ZoneEditor({
  zones,
  onChange,
}: {
  zones: DeliveryZone[];
  onChange: (zones: DeliveryZone[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<
    Array<{ description: string; placeId: string }>
  >([]);
  const [showPred, setShowPred] = useState(false);
  const [resolving, setResolving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function onQueryChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 3) {
      setPredictions([]);
      setShowPred(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(val)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          setPredictions([]);
          setShowPred(false);
          return;
        }
        const data = await res.json();
        const mapped = (data.suggestions ?? []) as Array<{
          description: string;
          placeId: string;
        }>;
        setPredictions(mapped);
        setShowPred(mapped.length > 0);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPredictions([]);
        setShowPred(false);
      }
    }, 300);
  }

  async function addZone(p: { description: string; placeId: string }) {
    setShowPred(false);
    setQuery("");
    setPredictions([]);
    setResolving(true);
    try {
      const res = await fetch(
        `/api/places/resolve?placeId=${encodeURIComponent(p.placeId)}`
      );
      if (res.ok) {
        const d = await res.json();
        if (typeof d.lat === "number" && typeof d.lng === "number") {
          const dup = zones.some(
            (z) =>
              Math.abs(z.lat - d.lat) < 1e-5 && Math.abs(z.lng - d.lng) < 1e-5
          );
          if (!dup) {
            const name = (p.description.split(",")[0] || p.description).trim();
            onChange([...zones, { name, lat: d.lat, lng: d.lng, radius_m: 1000 }]);
          }
        }
      }
    } catch {
      // ignore — merchant can retry
    } finally {
      setResolving(false);
    }
  }

  function setRadius(i: number, radius_m: number) {
    onChange(zones.map((z, idx) => (idx === i ? { ...z, radius_m } : z)));
  }
  function remove(i: number) {
    onChange(zones.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black-400">
          {resolving ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        </span>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => predictions.length > 0 && setShowPred(true)}
          onBlur={() => setTimeout(() => setShowPred(false), 150)}
          placeholder="Search a place, e.g. Baze University"
          className={cn(INPUT_CLS, "pl-9")}
          autoComplete="off"
        />
        {showPred && predictions.length > 0 && (
          <div className="absolute z-50 w-full bg-white border border-black-200 rounded-xl shadow-lg mt-1 overflow-hidden">
            {predictions.map((p) => (
              <button
                key={p.placeId}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void addZone(p);
                }}
                className="w-full text-left px-3 py-2.5 text-sm text-black-900 hover:bg-black-50 border-b border-black-50 last:border-0 flex items-start gap-2"
              >
                <MapPin size={13} className="text-black-400 mt-0.5 flex-shrink-0" />
                <span>{p.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {zones.length === 0 ? (
        <p className="text-[11px] text-black-400">
          Leave empty to waive delivery everywhere. Add areas to limit the offer
          (e.g. campuses, estates).
        </p>
      ) : (
        <div className="space-y-1.5">
          {zones.map((z, i) => (
            <div
              key={`${z.lat},${z.lng}`}
              className="flex items-center gap-2 bg-black-50 rounded-xl px-3 py-2"
            >
              <MapPin size={14} className="text-purple-600 flex-shrink-0" />
              <span className="text-sm text-black-800 truncate flex-1">{z.name}</span>
              <select
                value={z.radius_m}
                onChange={(e) => setRadius(i, Number(e.target.value))}
                className="text-xs bg-white border border-black-200 rounded-lg px-1.5 py-1 text-black-600"
                aria-label="Coverage radius"
              >
                {ZONE_RADIUS_OPTIONS.map((o) => (
                  <option key={o.m} value={o.m}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => remove(i)}
                className="w-6 h-6 rounded-lg hover:bg-black-100 flex items-center justify-center text-black-400 flex-shrink-0"
                aria-label={`Remove ${z.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
