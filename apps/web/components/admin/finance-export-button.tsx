"use client";

import { useState } from "react";

interface FinanceExportButtonProps {
  type: "summary" | "orders";
  fromDate: string;
  toDate: string;
}

export function FinanceExportButton({ type, fromDate, toDate }: FinanceExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  async function exportCSV() {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/admin/finance/export?type=${type}&from=${fromDate}&to=${toDate}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.error ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kitchyn-finance-${type}-${fromDate}-${toDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={exportCSV}
      disabled={exporting}
      className="text-sm font-semibold border border-black-200 hover:border-black-400 text-black-700 px-4 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
    >
      {exporting ? "Exporting…" : "Export CSV"}
    </button>
  );
}
