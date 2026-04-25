"use client";

import { useState } from "react";
import { cn } from "@foodo/ui";
import { FrontlineNav } from "./frontline-nav";

interface FrontlineShellProps {
  children: React.ReactNode;
  restaurantId: string;
  userName: string;
}

export function FrontlineShell({
  children,
  restaurantId,
  userName,
}: FrontlineShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-black-50">
      <FrontlineNav
        restaurantId={restaurantId}
        userName={userName}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
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
  );
}
