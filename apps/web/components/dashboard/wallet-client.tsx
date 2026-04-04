"use client";

import { useState } from "react";
import { formatKobo } from "@foodo/utils";
import { Wallet, TrendingUp, Clock, ArrowDownCircle } from "lucide-react";

type WalletRow = {
  id: string;
  restaurant_id: string;
  pending_balance_kobo: number;
  available_balance_kobo: number;
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
  failure_reason: string | null;
  initiated_at: string;
  paid_at: string | null;
  created_at: string;
};

type FilterType = "all" | "credits" | "debits" | "settlements";

interface WalletClientProps {
  restaurantId: string;
  wallet: WalletRow | null;
  transactions: TxnRow[];
  settlements: SettlementRow[];
}

export function WalletClient({
  restaurantId,
  wallet,
  transactions,
  settlements,
}: WalletClientProps) {
  const [activeTab, setActiveTab] = useState<"transactions" | "settlements">("transactions");
  const [txnFilter, setTxnFilter] = useState<FilterType>("all");
  const [exporting, setExporting] = useState(false);

  const filteredTxns = transactions.filter((t) => {
    if (txnFilter === "credits") return t.direction === "credit";
    if (txnFilter === "debits") return t.direction === "debit" && t.type !== "settlement_debit";
    if (txnFilter === "settlements") return t.type === "settlement_debit";
    return true;
  });

  async function handleExport() {
    setExporting(true);
    try {
      const rows = [
        ["Date", "Type", "Description", "Amount", "Direction", "Status"],
        ...transactions.map((t) => [
          new Date(t.created_at).toLocaleDateString(),
          t.type,
          t.description ?? "",
          (t.amount_kobo / 100).toFixed(2),
          t.direction,
          t.status,
        ]),
      ];
      const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wallet-transactions-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const pendingBalance = wallet?.pending_balance_kobo ?? 0;
  const availableBalance = wallet?.available_balance_kobo ?? 0;
  const totalEarned = wallet?.total_earned_kobo ?? 0;
  const totalWithdrawn = wallet?.total_withdrawn_kobo ?? 0;

  return (
    <div className="md:p-6 pb-24">
      {/* Header */}
      <div className="bg-white md:rounded-2xl border-b md:border border-black-100 px-4 py-4 mb-6">
        <h1 className="font-bold text-black-900 text-lg">Wallet</h1>
        <p className="text-xs text-black-400 mt-0.5">Earnings and settlement history</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 md:px-0 mb-6">
        <StatCard
          icon={<Clock className="w-4 h-4 text-dixie-500" />}
          label="Pending"
          value={formatKobo(pendingBalance)}
          sub="In hold period"
          color="bg-dixie-50 border-dixie-100"
        />
        <StatCard
          icon={<Wallet className="w-4 h-4 text-viridian-500" />}
          label="Available"
          value={formatKobo(availableBalance)}
          sub="Ready to settle"
          color="bg-viridian-50 border-viridian-100"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-purple-500" />}
          label="Total Earned"
          value={formatKobo(totalEarned)}
          sub="Lifetime"
          color="bg-purple-50 border-purple-100"
        />
        <StatCard
          icon={<ArrowDownCircle className="w-4 h-4 text-black-400" />}
          label="Withdrawn"
          value={formatKobo(totalWithdrawn)}
          sub="Lifetime"
          color="bg-black-50 border-black-100"
        />
      </div>

      {/* Tabs */}
      <div className="px-4 md:px-0">
        <div className="flex gap-1 bg-black-100 rounded-xl p-1 w-fit mb-4">
          {(["transactions", "settlements"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                activeTab === tab
                  ? "bg-white text-black-900 shadow-sm"
                  : "text-black-500 hover:text-black-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "transactions" && (
          <>
            <div className="flex flex-wrap gap-2 mb-3 items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                {(["all", "credits", "debits", "settlements"] as FilterType[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setTxnFilter(f)}
                    className={`px-3 py-1 text-xs rounded-lg font-medium border transition-colors capitalize ${
                      txnFilter === f
                        ? "bg-purple-500 text-white border-purple-500"
                        : "bg-white text-black-500 border-black-200 hover:bg-black-50"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="text-sm text-purple-500 border border-purple-500 px-4 py-1.5 rounded-xl hover:bg-purple-50 disabled:opacity-60 transition-colors font-medium"
              >
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
              {filteredTxns.length === 0 ? (
                <p className="text-black-400 text-sm text-center py-10">No transactions yet</p>
              ) : (
                <div className="divide-y divide-black-100">
                  {filteredTxns.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-black-900 truncate">
                          {t.description ?? t.type}
                        </p>
                        <p className="text-xs text-black-400 mt-0.5">
                          {new Date(t.created_at).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 space-y-1">
                        <p
                          className={`text-sm font-semibold ${
                            t.direction === "credit" ? "text-viridian-600" : "text-cinnabar-500"
                          }`}
                        >
                          {t.direction === "credit" ? "+" : "-"}
                          {formatKobo(t.amount_kobo)}
                        </p>
                        <StatusBadge status={t.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "settlements" && (
          <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
            {settlements.length === 0 ? (
              <p className="text-black-400 text-sm text-center py-10">No settlements yet</p>
            ) : (
              <div className="divide-y divide-black-100">
                {settlements.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-black-900">
                        {formatKobo(s.amount_kobo)}
                      </p>
                      <p className="text-xs text-black-400 mt-0.5">
                        {new Date(s.initiated_at).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {s.paystack_transfer_ref ? ` · Ref: ${s.paystack_transfer_ref}` : ""}
                      </p>
                      {s.failure_reason && (
                        <p className="text-xs text-cinnabar-500 mt-0.5">{s.failure_reason}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 space-y-1 text-right">
                      <SettlementStatusBadge status={s.status} />
                      {s.paid_at && (
                        <p className="text-xs text-black-400">
                          Paid {new Date(s.paid_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-dixie-100 text-dixie-600",
    available: "bg-viridian-100 text-viridian-600",
    settled: "bg-black-100 text-black-500",
  };
  return (
    <span
      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
        styles[status] ?? "bg-black-100 text-black-500"
      }`}
    >
      {status}
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
  return (
    <span
      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
        styles[status] ?? "bg-black-100 text-black-500"
      }`}
    >
      {status}
    </span>
  );
}
