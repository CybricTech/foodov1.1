"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@foodo/ui";
import {
  ClipboardList,
  UtensilsCrossed,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

interface FrontlineNavProps {
  restaurantId: string;
  userName: string;
  collapsed: boolean;
  onToggle: () => void;
  role: string;
}

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard/frontline/orders", label: "Orders", icon: ClipboardList },
  { href: "/dashboard/frontline/menu",   label: "Menu",   icon: UtensilsCrossed },
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

export function FrontlineNav({
  restaurantId: _restaurantId,
  userName,
  collapsed,
  onToggle,
  role,
}: FrontlineNavProps) {
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
      <nav
        className={cn(
          "hidden md:flex flex-col fixed left-0 top-0 bottom-0 bg-white border-r border-black-100 z-30 transition-all duration-200 ease-in-out",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Brand header + toggle */}
        <div
          className={cn(
            "flex items-center border-b border-black-100",
            collapsed ? "justify-center px-2 py-4" : "justify-between px-5 py-5"
          )}
        >
          {!collapsed && (
            <Image
              src="/logo.png"
              alt="Kitchyn"
              width={100}
              height={34}
              className="h-7 w-auto object-contain"
            />
          )}
          <button
            onClick={onToggle}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-black-50 text-black-400 hover:text-black-600 transition-colors duration-150 cursor-pointer"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Nav links */}
        <div className={cn("flex-1 overflow-y-auto py-3 space-y-0.5", collapsed ? "px-2" : "px-3")}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center rounded-xl text-sm font-medium transition-colors duration-150 cursor-pointer",
                  isActive
                    ? "bg-purple-50 text-purple-600"
                    : "text-black-500 hover:bg-black-50 hover:text-black-900",
                  collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  size={17}
                  strokeWidth={isActive ? 2.5 : 2}
                  className="flex-shrink-0"
                />
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {isActive && !collapsed && (
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                )}
              </Link>
            );
          })}

          {role === "merchant_owner" && (
            <>
              <div className={cn("my-2 border-t border-black-100", collapsed ? "mx-1" : "mx-0")} />
              <Link
                href="/dashboard"
                className={cn(
                  "group flex items-center rounded-xl text-sm font-medium transition-colors duration-150 cursor-pointer text-black-400 hover:bg-black-50 hover:text-black-700",
                  collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
                )}
                title={collapsed ? "Return to Dashboard" : undefined}
              >
                <LayoutDashboard size={17} strokeWidth={2} className="flex-shrink-0" />
                {!collapsed && <span className="flex-1">Return to Dashboard</span>}
              </Link>
            </>
          )}
        </div>

        {/* User profile + sign out */}
        <div className={cn("pt-3 pb-4 border-t border-black-100 space-y-0.5", collapsed ? "px-2" : "px-3")}>
          <div
            className={cn(
              "flex items-center py-2.5",
              collapsed ? "justify-center px-2" : "gap-3 px-3"
            )}
          >
            <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-bold text-purple-600 leading-none">
                {getInitials(userName)}
              </span>
            </div>
            {!collapsed && (
              <p className="text-sm font-medium text-black-700 truncate flex-1">{userName}</p>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className={cn(
              "flex items-center rounded-xl text-sm font-medium text-black-400 hover:bg-cinnabar-100 hover:text-cinnabar-500 transition-colors duration-150 cursor-pointer",
              collapsed ? "justify-center w-full px-2 py-2.5" : "w-full gap-3 px-3 py-2.5"
            )}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut size={17} strokeWidth={2} className="flex-shrink-0" />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black-100 z-30 flex">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-3 gap-1 cursor-pointer transition-colors duration-150 relative",
                isActive ? "text-purple-600" : "text-black-400"
              )}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-purple-500" />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.75} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
        {role === "merchant_owner" && (
          <Link
            href="/dashboard"
            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 cursor-pointer transition-colors duration-150 text-black-400"
          >
            <LayoutDashboard size={20} strokeWidth={1.75} />
            <span className="text-[10px] font-semibold">Dashboard</span>
          </Link>
        )}
      </nav>
    </>
  );
}
