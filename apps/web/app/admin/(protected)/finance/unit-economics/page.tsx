import { Suspense } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveFinanceRange } from "@/lib/finance/date-range";
import { FinanceTabs } from "@/components/admin/finance-tabs";
import { FinanceFilters } from "@/components/admin/finance-filters";
import { FinanceExportButton } from "@/components/admin/finance-export-button";
import { FinanceUnitEconomicsClient } from "@/components/admin/finance-unit-economics-client";

export const dynamic = "force-dynamic";

export default async function AdminFinanceUnitEconomicsPage({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string };
}) {
  const supabase = createServiceClient();
  const range = resolveFinanceRange(searchParams);

  const [summaryRes, ordersRes] = await Promise.all([
    supabase.rpc("finance_summary", { p_from: range.fromISO, p_to: range.toISO }),
    supabase.rpc("finance_order_economics", { p_from: range.fromISO, p_to: range.toISO }),
  ]);

  if (summaryRes.error) console.error("finance_summary failed:", summaryRes.error);
  if (ordersRes.error) console.error("finance_order_economics failed:", ordersRes.error);

  return (
    <div className="p-6 pb-24 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-black-900">Finance</h1>
        <p className="text-black-500 text-sm mt-1">
          Unit economics per order · {range.label}
        </p>
      </div>

      <FinanceTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Suspense>
          <FinanceFilters />
        </Suspense>
        <FinanceExportButton type="orders" fromDate={range.fromDate} toDate={range.toDate} />
      </div>

      <FinanceUnitEconomicsClient
        summary={summaryRes.data?.[0] ?? null}
        orders={ordersRes.data ?? []}
        rangeLabel={range.label}
      />
    </div>
  );
}
