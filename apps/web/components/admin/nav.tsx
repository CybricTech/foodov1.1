"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@foodo/ui";
import {
  LayoutDashboard,
  Store,
  Bike,
  TrendingUp,
  Scale,
  MessageSquare,
  Banknote,
  Settings,
  AlertTriangle,
  Globe,
  Activity,
  LayoutGrid,
  Sparkles,
  Stamp,
  type LucideIcon,
} from "lucide-react";

/* ── Shared nav item shape ─────────────────────────────────────────────────── */
export type AdminNavItem = { href: string; label: string; icon: LucideIcon; exact: boolean };

export const NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin",              label: "Overview",      icon: LayoutDashboard, exact: true  },
  { href: "/admin/merchants",    label: "Merchants",     icon: Store,           exact: false },
  { href: "/admin/riders",       label: "Riders",        icon: Bike,            exact: false },
  { href: "/admin/analytics",    label: "Analytics",     icon: TrendingUp,      exact: false },
  { href: "/admin/settlements",  label: "Settlements",   icon: Banknote,        exact: false },
  { href: "/admin/disputes",     label: "Disputes",      icon: Scale,           exact: false },
  { href: "/admin/late-orders",  label: "Late Orders",   icon: AlertTriangle,   exact: false },
  { href: "/admin/landing",      label: "Landing",       icon: Globe,           exact: false },
  { href: "/admin/changelog",    label: "What's New",    icon: Sparkles,        exact: false },
  { href: "/admin/loyalty",      label: "Loyalty Test",  icon: Stamp,           exact: false },
  { href: "/admin/logs/sms",     label: "SMS Logs",      icon: MessageSquare,   exact: false },
  { href: "/admin/system-health",label: "System Health",  icon: Activity,       exact: false },
  { href: "/admin/settings",     label: "Settings",      icon: Settings,        exact: false },
];

/* The 4 pinned bottom-bar tabs (mobile) */
const MOBILE_PINNED: AdminNavItem[] = NAV_ITEMS.filter((i) =>
  ["/admin", "/admin/merchants", "/admin/riders", "/admin/settlements"].includes(i.href)
);

/* Routes surfaced under the "More" screen */
export const MOBILE_MORE_ITEMS: AdminNavItem[] = NAV_ITEMS.filter((i) =>
  [
    "/admin/analytics",
    "/admin/disputes",
    "/admin/late-orders",
    "/admin/landing",
    "/admin/changelog",
    "/admin/loyalty",
    "/admin/logs/sms",
    "/admin/system-health",
    "/admin/settings",
  ].includes(i.href)
);

/* Helpers */
function isMoreActive(pathname: string) {
  return (
    pathname === "/admin/more" ||
    MOBILE_MORE_ITEMS.some((i) =>
      i.exact ? pathname === i.href : pathname.startsWith(i.href)
    )
  );
}

export function AdminNav({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createBrowserClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  }

  return (
    <>
      {/* ── Desktop sidebar (untouched) ──────────────────────────────────── */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-white border-r border-black-200 z-30">
        <div className="px-4 py-5 border-b border-black-200">
          <p className="font-bold text-black-900 text-sm">Kitchyn Admin</p>
          <p className="text-xs text-black-500 mt-0.5 truncate">{userName}</p>
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
                prefetch={false}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-purple-500 text-white"
                    : "text-black-500 hover:bg-black-100 hover:text-black-900"
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="px-3 py-4 border-t border-black-200">
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-black-500 hover:bg-black-100 hover:text-black-900 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black-100 z-30 flex">
        {MOBILE_PINNED.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-3 gap-0.5 cursor-pointer transition-colors duration-150 relative",
                isActive ? "text-purple-600" : "text-black-400"
              )}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-purple-500" />
              )}
              <Icon size={19} strokeWidth={isActive ? 2.5 : 1.75} />
              <span className="text-[9px] font-semibold">{item.label}</span>
            </Link>
          );
        })}

        {/* More tab */}
        <Link
          href="/admin/more"
          prefetch={false}
          className={cn(
            "flex-1 flex flex-col items-center justify-center py-3 gap-0.5 cursor-pointer transition-colors duration-150 relative",
            isMoreActive(pathname) ? "text-purple-600" : "text-black-400"
          )}
        >
          {isMoreActive(pathname) && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-purple-500" />
          )}
          <LayoutGrid size={19} strokeWidth={isMoreActive(pathname) ? 2.5 : 1.75} />
          <span className="text-[9px] font-semibold">More</span>
        </Link>
      </nav>
    </>
  );
}
