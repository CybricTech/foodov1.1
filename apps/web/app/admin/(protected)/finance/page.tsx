import { Suspense } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveFinanceRange } from "@/lib/finance/date-range";
import { FinanceTabs } from "@/components/admin/finance-tabs";
import { FinanceFilters } from "@/components/admin/finance-filters";
import { FinanceExportButton } from "@/components/admin/finance-export-button";
import { FinanceOverviewClient } from "@/components/admin/finance-overview-client";

export const dynamic = "force-dynamic";

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string };
}) {
  const supabase = createServiceClient();
  const range = resolveFinanceRange(searchParams);

  const [summaryRes, dailyRes, perMerchantRes] = await Promise.all([
    supabase.rpc("finance_summary", { p_from: range.fromISO, p_to: range.toISO }),
    supabase.rpc("finance_daily", { p_from: range.fromISO, p_to: range.toISO }),
    supabase.rpc("finance_per_merchant", { p_from: range.fromISO, p_to: range.toISO }),
  ]);

  if (summaryRes.error) console.error("finance_summary failed:", summaryRes.error);
  if (dailyRes.error) console.error("finance_daily failed:", dailyRes.error);
  if (perMerchantRes.error) console.error("finance_per_merchant failed:", perMerchantRes.error);

  // finance_summary is a single-row set-returning function
  const summary = summaryRes.data?.[0] ?? null;

  const topMerchants = (perMerchantRes.data ?? [])
    .slice()
    .sort((a, b) => b.net_revenue_kobo - a.net_revenue_kobo)
    .slice(0, 10);

  return (
    <div className="p-6 pb-24 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-black-900">Finance</h1>
        <p className="text-black-500 text-sm mt-1">
          Platform P&amp;L · {range.label}
        </p>
      </div>

      <FinanceTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Suspense>
          <FinanceFilters />
        </Suspense>
        <FinanceExportButton type="summary" fromDate={range.fromDate} toDate={range.toDate} />
      </div>

      <FinanceOverviewClient
        summary={summary}
        daily={dailyRes.data ?? []}
        topMerchants={topMerchants}
        rangeLabel={range.label}
      />
    </div>
  );
}
