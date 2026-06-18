"use client";

import { useState } from "react";
import { cn } from "@foodo/ui";
import { FrontlineNav } from "./frontline-nav";
import { ConnectionProvider } from "@/lib/connection-context";
import { ConnectionBanner } from "./connection-banner";
import { FrontlinePrinterRunner } from "./frontline-printer-runner";
import { PrinterIndicator } from "./printer-indicator";

interface FrontlineShellProps {
  children: React.ReactNode;
  restaurantId: string;
  restaurantName: string;
  logoUrl: string | null;
  userName: string;
  role: string;
}

export function FrontlineShell({
  children,
  restaurantId,
  restaurantName,
  logoUrl,
  userName,
  role,
}: FrontlineShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ConnectionProvider>
      {/* Always-on receipt printing for the frontline, on every page. */}
      <FrontlinePrinterRunner
        restaurantId={restaurantId}
        restaurantName={restaurantName}
        logoUrl={logoUrl}
      />
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
          {/* Printer connection signifier — visible on every frontline page. */}
          <div className="flex justify-end px-4 pt-3">
            <PrinterIndicator />
          </div>
          {children}
        </main>
      </div>
    </ConnectionProvider>
  );
}
