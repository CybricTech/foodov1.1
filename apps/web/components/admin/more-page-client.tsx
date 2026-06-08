"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@foodo/ui";
import { MOBILE_MORE_ITEMS } from "@/components/admin/nav";

/**
 * Full-screen "More" menu for admin mobile navigation.
 *
 * • Renders a WhatsApp-style list (icon + label + chevron).
 * • Only visible below the `md` breakpoint — on desktop it redirects to /admin.
 * • The bottom nav bar's "More" tab stays highlighted because isMoreActive()
 *   matches pathname === "/admin/more".
 */
export function MorePageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(true);

  // Redirect to /admin on desktop viewports
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    function check(e: MediaQueryList | MediaQueryListEvent) {
      if (e.matches) {
        router.replace("/admin");
      }
      setIsMobile(!e.matches);
    }
    check(mql);
    mql.addEventListener("change", check);
    return () => mql.removeEventListener("change", check);
  }, [router]);

  if (!isMobile) return null;

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-xl font-bold text-black-900 mb-1">More</h1>
      <p className="text-sm text-black-500 mb-6">Additional admin tools</p>

      <div className="bg-white rounded-2xl border border-black-100 overflow-hidden divide-y divide-black-100">
        {MOBILE_MORE_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-4 px-4 py-3.5 transition-colors duration-150 active:bg-black-50",
                isActive ? "text-purple-600" : "text-black-900"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0",
                  isActive ? "bg-purple-50" : "bg-black-50"
                )}
              >
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={isActive ? "text-purple-600" : "text-black-500"}
                />
              </span>
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              <ChevronRight
                size={16}
                strokeWidth={2}
                className="text-black-400 flex-shrink-0"
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
