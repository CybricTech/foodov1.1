"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@foodo/ui";
import { formatKobo } from "@foodo/utils";
import { useScrollLock } from "@/lib/hooks/use-scroll-lock";
import type { OpsOrderDetail } from "@/lib/admin/ops-types";

// STATUS_LABELS / STATUS_BADGE mirror the (non-exported) maps in
// live-ops-client.tsx exactly — same palette, same classes. A later wave may
// dedupe them; the class strings are the design language, so copy-only.
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready",
  assigned_to_rider: "Assigned",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gold-100 text-gold-600",
  confirmed: "bg-purple-50 text-purple-700",
  preparing: "bg-dixie-100 text-orange-700",
  ready_for_pickup: "bg-orange-100 text-orange-700",
  assigned_to_rider: "bg-purple-100 text-purple-700",
  in_transit: "bg-purple-100 text-purple-800",
  delivered: "bg-viridian-100 text-emerald-700",
  cancelled: "bg-cinnabar-100 text-cinnabar-500",
};

interface OrderDetailDrawerProps {
  /**
   * Trigger contract (§7.1): LiveOpsClient keeps `selected` as
   * `{ id; order_number; status } | null` — board rows and feed rows both call
   * setSelected with (at least) that shape; extra fields are ignored.
   */
  order: { id: string; order_number: string; status: string } | null;
  /** Sets `selected` back to null. Focus returns to the trigger on close. */
  onClose: () => void;
}

/**
 * Right slide-over order detail drawer (docs/live-ops-v2-ux.md §7).
 *
 * The detail body comes ONLY from GET /api/admin/order-detail?orderId=…
 * (requireAdmin; returns OpsOrderDetail | null — 400 missing param, 404
 * null) — never from the realtime payload (migration 103 whitelists the
 * orders publication's columns, so delivery_address / special_instructions /
 * item lines can never arrive via realtime). Fetch is aborted on close or
 * order switch; failures render the Retry state.
 */
export function OrderDetailDrawer({ order, onClose }: OrderDetailDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // The element focused when the drawer opened (the order row that triggered
  // it) — restored on close so keyboard users land exactly where they left.
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const [detail, setDetail] = useState<OpsOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Latest fetch closure, re-bound on order change — the Retry button invokes
  // it directly (a retry nonce in deps would be flagged as unnecessary).
  const fetchDetail = useRef<() => void>(() => {});

  useScrollLock(order != null);

  const orderId = order?.id ?? null;

  useEffect(() => {
    if (!orderId) {
      setDetail(null);
      setError(false);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(
          `/api/admin/order-detail?orderId=${encodeURIComponent(orderId)}`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        if (res.status === 404) {
          // Contract: 404 = no such order → null; render normally, every
          // section shows "—" (no dedicated empty state).
          setDetail(null);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError(true);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as OpsOrderDetail | null;
        if (controller.signal.aborted) return;
        setDetail(data ?? null);
        setLoading(false);
      } catch {
        if (!controller.signal.aborted) {
          setError(true);
          setLoading(false);
        }
      }
    };
    fetchDetail.current = load;
    void load();
    return () => controller.abort();
  }, [orderId]);

  // A11y: Esc closes; focus moves to the close button on open; Tab cycles
  // among the panel's focusables; focus returns to the trigger on close.
  useEffect(() => {
    if (!order) {
      if (triggerRef.current) {
        triggerRef.current.focus();
        triggerRef.current = null;
      }
      return;
    }
    triggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [order]);

  if (!order) return null;

  const money = (value: number | null | undefined): string =>
    value == null ? "—" : formatKobo(value);

  return (
    <>
      {/* Backdrop — cart-sheet pattern */}
      <div
        className="fixed inset-0 bg-black-900/50 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Panel — right slide-over */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${order.order_number} details`}
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-xl flex flex-col animate-fade-in"
      >
        {/* Header — order number + status badge always render from the trigger,
            even while the RPC is pending */}
        <div className="flex items-center justify-between border-b border-black-100 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-bold text-black-900">
              #{order.order_number}
            </p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                STATUS_BADGE[order.status] ?? "bg-black-100 text-black-500"
              )}
            >
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-black-100 text-black-500 hover:bg-black-200 flex items-center justify-center transition-colors shrink-0"
            aria-label="Close order details"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-black-100">
          {loading ? (
            <DrawerSkeleton />
          ) : error ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-black-500 mb-3">
                Couldn&apos;t load order details.
              </p>
              <button
                type="button"
                onClick={() => fetchDetail.current()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-black-200 bg-white min-h-10 px-3 text-xs font-semibold text-purple-600 hover:bg-black-50 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <DrawerSection title="Customer">
                {detail?.customer_name ? (
                  <p className="text-sm font-semibold text-black-900">
                    {detail.customer_name}
                  </p>
                ) : (
                  <p className="text-sm text-black-400">—</p>
                )}
                {detail?.customer_phone ? (
                  <a
                    href={`tel:${detail.customer_phone}`}
                    aria-label={`Call ${detail.customer_phone}`}
                    className="min-h-10 inline-flex items-center text-sm text-purple-600 hover:text-purple-700 transition-colors"
                  >
                    {detail.customer_phone}
                  </a>
                ) : (
                  <p className="text-sm text-black-400">—</p>
                )}
                {detail?.delivery_address ? (
                  <p className="text-sm text-black-500">
                    {detail.delivery_address}
                  </p>
                ) : (
                  <p className="text-sm text-black-400">—</p>
                )}
                {detail?.special_instructions && (
                  <p className="text-xs text-gold-600 italic mt-1.5">
                    &quot;{detail.special_instructions}&quot;
                  </p>
                )}
              </DrawerSection>

              <DrawerSection title="Items">
                {detail && detail.items.length > 0 ? (
                  <div>
                    {detail.items.map((item, i) => (
                      <div
                        key={`${item.name}-${i}`}
                        className="flex items-baseline justify-between gap-3 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-black-900">
                            {item.name} × {item.quantity}
                          </p>
                          <p className="text-xs text-black-400">
                            unit {formatKobo(item.unit_price_kobo)}
                          </p>
                        </div>
                        {/* Line total is total_kobo — not line_total_kobo */}
                        <p className="text-sm font-semibold text-black-900 tabular-nums shrink-0">
                          {formatKobo(item.total_kobo)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-black-400">—</p>
                )}
              </DrawerSection>

              <DrawerSection title="Payment">
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-black-500">Subtotal</span>
                  <span className="text-black-900 tabular-nums">
                    {money(detail?.subtotal_kobo)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-black-500">Delivery fee</span>
                  <span className="text-black-900 tabular-nums">
                    {money(detail?.delivery_fee_kobo)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-black-500">Service fee</span>
                  <span className="text-black-900 tabular-nums">
                    {money(detail?.service_fee_kobo)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-black-500">VAT</span>
                  <span className="text-black-900 tabular-nums">
                    {money(detail?.vat_kobo)}
                  </span>
                </div>
                <div className="border-t border-black-100 mt-2 pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-black-900">
                    Total
                  </span>
                  <span className="text-base font-extrabold text-purple-600 tabular-nums">
                    {detail ? formatKobo(detail.total_kobo) : "—"}
                  </span>
                </div>
                {detail && detail.payment_status !== "paid" && (
                  <p className="text-xs font-semibold text-gold-600 mt-2">
                    unpaid
                  </p>
                )}
              </DrawerSection>

              <DrawerSection title="Assignment">
                {detail?.assignment ? (
                  <div>
                    <p className="text-sm font-semibold text-black-900">
                      {detail.assignment.rider_name ?? "—"}
                    </p>
                    {detail.assignment.rider_phone ? (
                      <a
                        href={`tel:${detail.assignment.rider_phone}`}
                        aria-label={`Call ${detail.assignment.rider_phone}`}
                        className="min-h-10 inline-flex items-center text-sm text-purple-600 hover:text-purple-700 transition-colors"
                      >
                        {detail.assignment.rider_phone}
                      </a>
                    ) : (
                      <p className="text-sm text-black-400">—</p>
                    )}
                    {detail.assignment.assigned_at && (
                      <p className="text-xs text-black-400">
                        Assigned{" "}
                        {new Date(
                          detail.assignment.assigned_at
                        ).toLocaleString("en-NG")}
                      </p>
                    )}
                    {detail.assignment.picked_up_at && (
                      <p className="text-xs text-black-400">
                        Picked up{" "}
                        {new Date(
                          detail.assignment.picked_up_at
                        ).toLocaleString("en-NG")}
                      </p>
                    )}
                    {detail.assignment.delivered_at && (
                      <p className="text-xs text-black-400">
                        Delivered{" "}
                        {new Date(
                          detail.assignment.delivered_at
                        ).toLocaleString("en-NG")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-black-400">—</p>
                )}
              </DrawerSection>

              <DrawerSection title="Timeline">
                <DrawerTimeline
                  timeline={detail?.timeline ?? []}
                  status={order.status}
                />
              </DrawerSection>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Internal subcomponents
// ────────────────────────────────────────────────────────────────────────────

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="px-5 py-4">
      <h3 className="text-[11px] font-semibold text-black-500 uppercase tracking-widest mb-2.5">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DrawerSkeleton() {
  return (
    <div className="px-5 py-4 space-y-3 animate-pulse" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((section) => (
        <div key={section} className="space-y-2">
          <div className="h-4 bg-black-100 rounded-lg w-full" />
          <div className="h-4 bg-black-100 rounded-lg w-3/4" />
          <div className="h-4 bg-black-100 rounded-lg w-1/2" />
        </div>
      ))}
    </div>
  );
}

function TimelineRow({
  step,
  terminal,
  status,
}: {
  step: { label: string; at: string };
  terminal: boolean;
  status: string;
}) {
  const dotClass =
    terminal && status === "delivered"
      ? "bg-viridian-500"
      : terminal && status === "cancelled"
        ? "bg-cinnabar-500"
        : "bg-purple-500";
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotClass)}
      />
      <p className="text-sm text-black-900">{step.label}</p>
      <span className="ml-auto text-xs text-black-400 tabular-nums">
        {new Date(step.at).toLocaleString("en-NG")}
      </span>
    </div>
  );
}

/**
 * Timeline — labels arrive pre-resolved from the RPC (no status keys), so the
 * dot rule is: purple for every step, with a terminal override for
 * delivered (viridian) / cancelled (cinnabar) orders.
 */
function DrawerTimeline({
  timeline,
  status,
}: {
  timeline: { label: string; at: string }[];
  status: string;
}) {
  if (timeline.length === 0) {
    return <p className="text-sm text-black-400">—</p>;
  }
  return (
    <div className="space-y-2.5">
      {timeline.map((step, i) => (
        <TimelineRow
          key={`${step.label}-${i}`}
          step={step}
          terminal={i === timeline.length - 1}
          status={status}
        />
      ))}
    </div>
  );
}