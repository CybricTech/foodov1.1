"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@foodo/ui";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: "📊", exact: true },
  { href: "/admin/merchants", label: "Merchants", icon: "🏪", exact: false },
  { href: "/admin/riders", label: "Riders", icon: "🛵", exact: false },
  { href: "/admin/analytics", label: "Analytics", icon: "📈", exact: false },
  { href: "/admin/disputes", label: "Disputes", icon: "⚖️", exact: false },
  { href: "/admin/logs/sms", label: "SMS Logs", icon: "📱", exact: false },
];

export function AdminNav({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  }

  return (
    <nav className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-black-900 border-r border-black-500 z-30">
      <div className="px-4 py-5 border-b border-black-500">
        <p className="font-bold text-white text-sm">Foodo Admin</p>
        <p className="text-xs text-black-400 mt-0.5 truncate">{userName}</p>
      </div>

      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                isActive
                  ? "bg-viridian-500/20 text-viridian-500"
                  : "text-black-400 hover:bg-black-500/30 hover:text-white"
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="px-3 py-4 border-t border-black-500">
        <button
          onClick={handleSignOut}
          className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-black-400 hover:text-white hover:bg-black-500/30 transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
