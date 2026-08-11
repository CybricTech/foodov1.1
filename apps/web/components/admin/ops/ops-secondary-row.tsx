"use client";

import Link from "next/link";
import { Bike, Wallet } from "lucide-react";

/**
 * SECONDARY KPI row — 3 compact muted cards + 2 link chips.
 *
 * Contract (docs/live-ops-v2-ux.md §4.4):
 * - Grid `grid grid-cols-2 md:grid-cols-3 gap-3`; compact card shell
 *   `bg-white rounded-2xl border border-black-200 px-3.5 py-3` with an
 *   11px black-400 label, text-lg value, optional 11px sub.
 * - Riders Online + Settlements move out of card form into link chips
 *   (min-h-10 interactive targets) — they must not appear twice.
 */
export function OpsSecondaryRow({
  ordersToday,
  openCount,
  totalActiveMerchants,
  deliveredToday,
  cancelledToday,
  ridersOnline,
  pendingSettlements,
}: {
  /** derived.ordersToday — realtime. */
  ordersToday: number;
  /** merchantBoard.open.length. */
  openCount: number;
  /** merchants.length (total active merchants on the board). */
  totalActiveMerchants: number;
  /** derived.deliveredToday — realtime. */
  deliveredToday: number;
  /** derived.cancelledToday — realtime. */
  cancelledToday: number;
  /** ridersOnline — page prop. */
  ridersOnline: number;
  /** pendingSettlements — page prop. */
  pendingSettlements: number;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SecondaryCard
          label="Orders Today"
          value={ordersToday.toLocaleString()}
          sub="today"
        />
        <SecondaryCard
          label="Open Merchants"
          value={`${openCount}/${totalActiveMerchants}`}
          sub="accepting new orders"
        />
        <SecondaryCard
          label="Delivered / Cancelled"
          value={`${deliveredToday} · ${cancelledToday}`}
          sub="delivered · cancelled today"
        />
      </div>

      {/* Link chips — below the cards, wraps (mobile) */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link
          href="/admin/riders"
          className="inline-flex items-center gap-1.5 rounded-full border border-black-200 bg-white min-h-10 px-3 text-[11px] font-semibold text-black-500 hover:bg-black-50 hover:text-purple-600 transition-colors"
        >
          <Bike className="h-3.5 w-3.5" /> Riders Online · {ridersOnline}
        </Link>
        <Link
          href="/admin/settlements"
          className="inline-flex items-center gap-1.5 rounded-full border border-black-200 bg-white min-h-10 px-3 text-[11px] font-semibold text-black-500 hover:bg-black-50 hover:text-purple-600 transition-colors"
        >
          <Wallet className="h-3.5 w-3.5" /> Settlements · {pendingSettlements}
        </Link>
      </div>
    </div>
  );
}

function SecondaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-black-200 px-3.5 py-3">
      <p className="text-[11px] text-black-400 font-medium truncate">
        {label}
      </p>
      <p className="text-lg font-extrabold text-black-900 mt-1">{value}</p>
      {sub && (
        <p className="text-[11px] text-black-400 mt-0.5 truncate">{sub}</p>
      )}
    </div>
  );
}