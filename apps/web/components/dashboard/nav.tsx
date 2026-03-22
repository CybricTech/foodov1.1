"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@foodo/ui";
import {
  ClipboardList,
  UtensilsCrossed,
  Users,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

interface DashboardNavProps {
  restaurantId: string;
  userName: string;
  role: "merchant_owner" | "merchant_staff";
}

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; exact: boolean }[] = [
  { href: "/dashboard", label: "Orders", icon: ClipboardList, exact: true },
  { href: "/dashboard/menu", label: "Menu", icon: UtensilsCrossed, exact: false },
  { href: "/dashboard/customers", label: "Customers", icon: Users, exact: false },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: false },
];

export function DashboardNav({ restaurantId: _restaurantId, userName, role: _role }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/dashboard/login");
  }

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-white border-r border-black-100 z-30">
        <div className="px-4 py-5 border-b border-black-100">
          <p className="font-bold text-black-900 text-sm">Foodo Dashboard</p>
          <p className="text-xs text-black-400 mt-0.5 truncate">{userName}</p>
        </div>

        <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-viridian-500/10 text-viridian-500"
                    : "text-black-500 hover:bg-black-50 hover:text-black-900"
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="px-3 py-4 border-t border-black-100">
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-black-400 hover:bg-black-50 hover:text-black-900 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black-100 z-30 flex">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center py-2 gap-0.5",
                isActive ? "text-viridian-500" : "text-black-400"
              )}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
