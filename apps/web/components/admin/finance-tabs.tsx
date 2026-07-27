"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/finance", label: "Overview" },
  { href: "/admin/finance/unit-economics", label: "Unit economics" },
  { href: "/admin/finance/cash", label: "Cash" },
];

export function FinanceTabs() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b border-black-200">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? "border-purple-500 text-purple-600"
                : "border-transparent text-black-500 hover:text-black-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
