"use client";

import { useState } from "react";
import { cn } from "@foodo/ui";
import { FrontlineNav } from "./frontline-nav";
import { ConnectionProvider } from "@/lib/connection-context";
import { ConnectionBanner } from "./connection-banner";

interface FrontlineShellProps {
  children: React.ReactNode;
  restaurantId: string;
  userName: string;
  role: string;
}

export function FrontlineShell({
  children,
  restaurantId,
  userName,
  role,
}: FrontlineShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ConnectionProvider>
      <div className="min-h-screen bg-black-50">
        <ConnectionBanner />
        <FrontlineNav
          restaurantId={restaurantId}
          userName={userName}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          role={role}
        />
        <main
          className={cn(
            "min-h-screen pb-20 md:pb-0 transition-all duration-200 ease-in-out",
            collapsed ? "md:ml-16" : "md:ml-56"
          )}
        >
          {children}
        </main>
      </div>
    </ConnectionProvider>
  );
}
