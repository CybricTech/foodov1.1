"use client";

import { useState } from "react";
import { formatKobo } from "@foodo/utils";
import { Clock, TrendingUp, ArrowDownCircle } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type WalletRow = {
  id: string;
  restaurant_id: string;
  pending_balance_kobo: number;
  total_earned_kobo: number;
  total_withdrawn_kobo: number;
  updated_at: string;
};

type TxnRow = {
  id: string;
  type: string;
  direction: string;
  amount_kobo: number;
  status: string;
  description: string | null;
  available_at: string | null;
  created_at: string;
  order_id: string | null;
};

type SettlementRow = {
  id: string;
  amount_kobo: number;
  status: string;
  paystack_transfer_code: string | null;
  paystack_transfer_ref: string | null;
  bank_reference: string | null;
  failure_reason: string | null;
  initiated_at: string;
  paid_at: string | null;
  created_at: string;
};

type ActiveTab = "activity" | "payouts";

interface WalletClientProps {
  restaurantId: string;
  wallet: WalletRow | null;
  transactions: TxnRow[];
  settlements: SettlementRow[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function groupByDate<T extends { created_at: string }>(items: T[]): Array<{ label: string; items: T[] }> {
  const groups: Map<string, T[]> = new Map();
  for (const item of items) {
    const label = formatDateGroup(item.created_at);
    const existing = groups.get(label);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(label, [item]);
    }
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

/** Extract order number from description like "Order #BY-1023 — net revenue..." */
function extractOrderNumber(description: string | null, fallback: string | null): string {
  if (description) {
    const match = description.match(/#([A-Z0-9-]+)/);
    if (match) return `Order #${match[1]}`;
  }
  if (fallback) return `Order #${fallback}`;
  return "Order";
}

/** Extract bank reference from settlement_debit description like "...· Ref: TRF-xxx" */
function extractBankRef(description: string | null, bankRef: string | null, paystackRef: string | null): string | null {
  if (bankRef) return bankRef;
  if (paystackRef) return paystackRef;
  if (description) {
    const match = description.match(/Ref:\s*(.+)$/);
    if (match) return match[1].trim();
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function WalletClient({
  restaurantId: _restaurantId,
  wallet,
  transactions,
  settlements,
}: WalletClientProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("activity");
  const [exporting, setExporting] = useState(false);

  const pendingBalance = wallet?.pending_balance_kobo ?? 0;
  const totalEarned = wallet?.total_earned_kobo ?? 0;
  const totalWithdrawn = wallet?.total_withdrawn_kobo ?? 0;

  // Activity tab: only order_credit transactions
  const activityItems = transactions.filter((t) => t.type === "order_credit");

  // Payouts tab: settlement_debit transactions as source of truth (post-bug-fix)
  // Fall back to showing settlements table rows if no settlement_debit txns exist yet
  const payoutTxns = transactions.filter((t) => t.type === "settlement_debit");

  const activityGroups = groupByDate(activityItems);
  const payoutGroups = groupByDate(payoutTxns);

  async function handleExport() {
    setExporting(true);
    try {
      const rows = [
        ["Date", "Order", "Amount", "Status"],
        ...activityItems.map((t) => [
          new Date(t.created_at).toLocaleDateString("en-NG"),
          extractOrderNumber(t.description, t.order_id),
          (t.amount_kobo / 100).toFixed(2),
          t.status,
        ]),
      ];
      const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wallet-activity-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="md:p-6 pb-24">
      {/* Header */}
      <div className="bg-white md:rounded-2xl border-b md:border border-black-100 px-4 py-4 mb-6">
        <h1 className="font-bold text-black-900 text-lg">Wallet</h1>
        <p className="text-xs text-black-400 mt-0.5">Earnings and settlement history</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 px-4 md:px-0 mb-6">
        <StatCard
          icon={<Clock className="w-4 h-4 text-dixie-500" />}
          label="Awaiting Payout"
          value={formatKobo(pendingBalance)}
          sub="Next settlement"
          color="bg-dixie-50 border-dixie-100"
        />
        <StatCard
          icon={<ArrowDownCircle className="w-4 h-4 text-purple-500" />}
          label="Total Paid Out"
          value={formatKobo(totalWithdrawn)}
          sub="Lifetime settlements"
          color="bg-purple-50 border-purple-100"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-black-400" />}
          label="Total Earned"
          value={formatKobo(totalEarned)}
          sub="Lifetime earnings"
          color="bg-black-50 border-black-100"
        />
      </div>

      {/* Tabs + content */}
      <div className="px-4 md:px-0">
        {/* Tab switcher */}
        <div className="flex gap-1 bg-black-100 rounded-xl p-1 w-fit mb-4">
          {(["activity", "payouts"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                activeTab === tab
                  ? "bg-white text-black-900 shadow-sm"
                  : "text-black-500 hover:text-black-700"
              }`}
            >
              {tab === "activity" ? "Activity" : "Payouts"}
            </button>
          ))}
        </div>

        {/* Activity tab */}
        {activeTab === "activity" && (
          <>
            <div className="flex items-center justify-end mb-3">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="text-sm text-purple-500 border border-purple-500 px-4 py-1.5 rounded-xl hover:bg-purple-50 disabled:opacity-60 transition-colors font-medium"
              >
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
              {activityItems.length === 0 ? (
                <p className="text-black-400 text-sm text-center py-10">No earnings yet</p>
              ) : (
                <div>
                  {activityGroups.map(({ label, items }) => (
                    <div key={label}>
                      <div className="px-4 py-2 bg-black-50 border-b border-black-100">
                        <p className="text-xs font-semibold text-black-400 uppercase tracking-wide">
                          {label}
                        </p>
                      </div>
                      <div className="divide-y divide-black-100">
                        {items.map((t) => (
                          <ActivityRow key={t.id} txn={t} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Payouts tab */}
        {activeTab === "payouts" && (
          <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
            {payoutTxns.length === 0 && settlements.length === 0 ? (
              <p className="text-black-400 text-sm text-center py-10">No payouts yet</p>
            ) : payoutTxns.length > 0 ? (
              <div>
                {payoutGroups.map(({ label, items }) => (
                  <div key={label}>
                    <div className="px-4 py-2 bg-black-50 border-b border-black-100">
                      <p className="text-xs font-semibold text-black-400 uppercase tracking-wide">
                        {label}
                      </p>
                    </div>
                    <div className="divide-y divide-black-100">
                      {items.map((t) => (
                        <PayoutRow key={t.id} txn={t} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Fallback: show settlements table rows for pre-bug-fix data */
              <div className="divide-y divide-black-100">
                {settlements.map((s) => (
                  <LegacySettlementRow key={s.id} settlement={s} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Row components                                                      */
/* ------------------------------------------------------------------ */

function ActivityRow({ txn }: { txn: TxnRow }) {
  const orderLabel = extractOrderNumber(txn.description, txn.order_id);
  const date = new Date(txn.created_at).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Icon */}
      <div className="w-9 h-9 rounded-full bg-viridian-50 flex items-center justify-center flex-shrink-0">
        <span className="text-viridian-600 text-sm font-bold">₦</span>
      </div>
      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-black-900">{orderLabel}</p>
        <p className="text-xs text-black-400 mt-0.5">{date}</p>
      </div>
      {/* Amount + status */}
      <div className="text-right flex-shrink-0 space-y-1">
        <p className="text-sm font-bold text-viridian-600">
          +{formatKobo(txn.amount_kobo)}
        </p>
        <TxnStatusBadge status={txn.status} />
      </div>
    </div>
  );
}

function PayoutRow({ txn }: { txn: TxnRow }) {
  const ref = extractBankRef(txn.description, null, null);
  const date = new Date(txn.created_at).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Icon */}
      <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
        <BankIcon />
      </div>
      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-black-900">Payout</p>
        <p className="text-xs text-black-400 mt-0.5">
          {date}
          {ref ? ` · ${ref}` : ""}
        </p>
      </div>
      {/* Amount + badge */}
      <div className="text-right flex-shrink-0 space-y-1">
        <p className="text-sm font-bold text-black-900">
          -{formatKobo(txn.amount_kobo)}
        </p>
        <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-viridian-100 text-viridian-600">
          Paid
        </span>
      </div>
    </div>
  );
}

function LegacySettlementRow({ settlement }: { settlement: SettlementRow }) {
  const ref = extractBankRef(null, settlement.bank_reference, settlement.paystack_transfer_ref);
  const date = new Date(settlement.initiated_at).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
        <BankIcon />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-black-900">Payout</p>
        <p className="text-xs text-black-400 mt-0.5">
          {date}
          {ref ? ` · ${ref}` : ""}
        </p>
        {settlement.failure_reason && (
          <p className="text-xs text-cinnabar-500 mt-0.5">{settlement.failure_reason}</p>
        )}
      </div>
      <div className="text-right flex-shrink-0 space-y-1">
        <p className="text-sm font-bold text-black-900">
          -{formatKobo(settlement.amount_kobo)}
        </p>
        <SettlementStatusBadge status={settlement.status} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${color}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-xs font-semibold text-black-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-lg font-extrabold text-black-900 leading-none">{value}</p>
      <p className="text-xs text-black-400 mt-1">{sub}</p>
    </div>
  );
}

function TxnStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-dixie-100 text-dixie-600",
    available: "bg-viridian-100 text-viridian-600",
    settled: "bg-black-100 text-black-400",
  };
  const labels: Record<string, string> = {
    pending: "Pending",
    available: "Available",
    settled: "Paid",
  };
  return (
    <span
      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
        styles[status] ?? "bg-black-100 text-black-400"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function SettlementStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-dixie-100 text-dixie-600",
    processing: "bg-purple-100 text-purple-600",
    paid: "bg-viridian-100 text-viridian-600",
    failed: "bg-cinnabar-100 text-cinnabar-500",
  };
  const labels: Record<string, string> = {
    pending: "Pending",
    processing: "Processing",
    paid: "Paid",
    failed: "Failed",
  };
  return (
    <span
      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
        styles[status] ?? "bg-black-100 text-black-400"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function BankIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-purple-500"
      aria-hidden="true"
    >
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </svg>
  );
}
