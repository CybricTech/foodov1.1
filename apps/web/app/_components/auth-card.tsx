import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Centered card shell for the public account-recovery pages
 * (/forgot-password, /reset-password). Matches /dashboard/login so the flow
 * feels like one place, and is narrow enough to read comfortably when opened
 * from a phone's mail app.
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" aria-label="Kitchyn home" className="inline-block">
            <Image src="/logo.png" alt="Kitchyn" width={120} height={40} className="h-10 w-auto mx-auto mb-6" />
          </Link>
          <h1 className="text-2xl font-bold text-black-900">{title}</h1>
          {subtitle && <p className="text-sm text-black-400 mt-2">{subtitle}</p>}
        </div>

        <div className="bg-white rounded-2xl border border-black-100 p-6">{children}</div>

        <p className="mt-6 text-center text-xs text-black-400">
          Need help?{" "}
          <Link href="/support" className="font-semibold text-purple-500 hover:underline">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
