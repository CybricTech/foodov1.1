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
  type LucideIcon,
} from "lucide-react";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; exact: boolean }[] = [
  { href: "/admin",              label: "Overview",    icon: LayoutDashboard, exact: true  },
  { href: "/admin/merchants",    label: "Merchants",   icon: Store,           exact: false },
  { href: "/admin/riders",       label: "Riders",      icon: Bike,            exact: false },
  { href: "/admin/analytics",    label: "Analytics",   icon: TrendingUp,      exact: false },
  { href: "/admin/settlements",  label: "Settlements", icon: Banknote,        exact: false },
  { href: "/admin/disputes",     label: "Disputes",    icon: Scale,           exact: false },
  { href: "/admin/logs/sms",     label: "SMS Logs",    icon: MessageSquare,   exact: false },
  { href: "/admin/settings",     label: "Settings",    icon: Settings,        exact: false },
];

export function AdminNav({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createBrowserClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  }

  return (
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
  );
}
