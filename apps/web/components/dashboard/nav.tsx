"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@foodo/ui";
import {
  Home,
  ClipboardList,
  UtensilsCrossed,
  Users,
  BarChart3,
  Settings,
  Wallet,
  Megaphone,
  LogOut,
  type LucideIcon,
} from "lucide-react";

interface DashboardNavProps {
  restaurantId: string;
  userName: string;
  role: "merchant_owner" | "merchant_staff";
}

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; exact: boolean }[] = [
  { href: "/dashboard",           label: "Home",       icon: Home,            exact: true  },
  { href: "/dashboard/orders",    label: "Orders",     icon: ClipboardList,   exact: false },
  { href: "/dashboard/menu",      label: "Menu",       icon: UtensilsCrossed, exact: false },
  { href: "/dashboard/customers", label: "Customers",  icon: Users,           exact: false },
  { href: "/dashboard/marketing", label: "Marketing",  icon: Megaphone,       exact: false },
  { href: "/dashboard/analytics", label: "Analytics",  icon: BarChart3,       exact: false },
  { href: "/dashboard/wallet",    label: "Wallet",     icon: Wallet,          exact: false },
  { href: "/dashboard/settings",  label: "Settings",   icon: Settings,        exact: false },
];

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

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
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-white border-r border-black-100 z-30">

        {/* Brand header */}
        <div className="px-5 py-5 border-b border-black-100">
          <Image
            src="/logo.png"
            alt="Kitchyn"
            width={100}
            height={34}
            className="h-7 w-auto object-contain"
          />
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
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
                  "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 cursor-pointer",
                  isActive
                    ? "bg-purple-50 text-purple-600"
                    : "text-black-500 hover:bg-black-50 hover:text-black-900"
                )}
              >
                <Icon
                  size={17}
                  strokeWidth={isActive ? 2.5 : 2}
                  className="flex-shrink-0"
                />
                <span className="flex-1">{item.label}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                )}
              </Link>
            );
          })}
        </div>

        {/* User profile + sign out */}
        <div className="px-3 pt-3 pb-4 border-t border-black-100 space-y-0.5">
          {/* User row */}
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-bold text-purple-600 leading-none">
                {getInitials(userName)}
              </span>
            </div>
            <p className="text-sm font-medium text-black-700 truncate flex-1">{userName}</p>
          </div>
          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-black-400 hover:bg-cinnabar-100 hover:text-cinnabar-500 transition-colors duration-150 cursor-pointer"
          >
            <LogOut size={17} strokeWidth={2} className="flex-shrink-0" />
            Sign out
          </button>
        </div>
      </nav>

      {/* ── Mobile bottom nav — all items except Settings ───────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black-100 z-30 flex">
        {NAV_ITEMS.filter((item) => item.href !== "/dashboard/settings").map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
      </nav>

      {/* ── Floating settings gear — home page only, mobile only ─────────── */}
      {pathname === "/dashboard" && (
        <Link
          href="/dashboard/settings"
          className="md:hidden fixed bottom-[72px] right-4 z-40 w-11 h-11 bg-white rounded-full shadow-lg border border-black-100 flex items-center justify-center transition-transform active:scale-90"
          aria-label="Settings"
        >
          <Settings size={20} strokeWidth={1.75} className="text-black-500" />
        </Link>
      )}
    </>
  );
}
