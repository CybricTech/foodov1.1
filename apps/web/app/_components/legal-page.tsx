import Link from "next/link";
import type { ReactNode } from "react";
import { NavBar } from "./nav-bar";
import { SUPPORT_EMAIL } from "@/lib/site";

/**
 * Shared shell for the public legal / help pages (/privacy, /terms, /support,
 * /delete-account). These are opened from the Kitchyn Merchant app and from the
 * App Store / Google Play listings, so they must read well at phone widths.
 *
 * Server component, no data fetching — every page using it renders statically.
 */

export const LEGAL_EFFECTIVE_DATE = "14 September 2026";

export const KITCHYN_COMPANY = {
  legalName: "KITCHYN TECHNOLOGIES LIMITED",
  address: "No. 22, T.Y. Danjuma Street, Asokoro, FCT-Abuja, Nigeria",
} as const;

const POPPINS = { fontFamily: "Poppins, system-ui, sans-serif" };

// No @tailwindcss/typography in this app, so body copy is styled with
// descendant arbitrary variants scoped to the article body.
const PROSE =
  "text-[15px] leading-7 text-[#1e1b1c]/80 break-words " +
  "[&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:mb-1.5 [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[#1e1b1c] " +
  "[&_a]:text-[#3C096C] [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-[#240046] " +
  "[&_strong]:font-semibold [&_strong]:text-[#1e1b1c]";

export type TocItem = { id: string; label: string };

export function LegalPage({
  eyebrow,
  title,
  lastUpdated,
  intro,
  toc,
  children,
}: {
  eyebrow?: string;
  title: string;
  lastUpdated?: string;
  intro?: ReactNode;
  toc?: TocItem[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <NavBar />

      <main className="px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <article className="mx-auto max-w-3xl">
          <header className="mb-8 sm:mb-10 border-b border-gray-100 pb-8">
            {eyebrow && (
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#3C096C]/70">
                {eyebrow}
              </p>
            )}
            <h1
              className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#1e1b1c]"
              style={POPPINS}
            >
              {title}
            </h1>
            {lastUpdated && (
              <p className="mt-3 text-sm text-[#1e1b1c]/50">Last updated: {lastUpdated}</p>
            )}
            {intro && <div className={`mt-6 ${PROSE} [&_p:last-child]:mb-0`}>{intro}</div>}
          </header>

          {toc && toc.length > 0 && (
            <nav
              aria-label="Contents"
              className="mb-10 sm:mb-12 rounded-2xl border border-[#3C096C]/10 bg-[#3C096C]/[0.04] p-5 sm:p-6"
            >
              <h2 className="text-sm font-semibold text-[#1e1b1c]">Contents</h2>
              <ol className="mt-3 grid gap-x-8 gap-y-2 pl-5 text-sm list-decimal marker:text-[#3C096C]/50 sm:grid-cols-2">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-[#1e1b1c]/70 underline-offset-2 hover:text-[#3C096C] hover:underline"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <div className={PROSE}>{children}</div>
        </article>
      </main>

      <LegalFooter />
    </div>
  );
}

export function LegalSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 mb-10">
      <h2
        className="mb-4 text-xl sm:text-2xl font-semibold tracking-tight text-[#1e1b1c]"
        style={POPPINS}
      >
        {number !== undefined && <span className="mr-2 text-[#3C096C]/60">{number}.</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SupportEmailLink({ subject }: { subject?: string }) {
  const href = subject
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SUPPORT_EMAIL}`;
  return <a href={href}>{SUPPORT_EMAIL}</a>;
}

const FOOTER_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Support", href: "/support" },
  { label: "Delete account", href: "/delete-account" },
];

function LegalFooter() {
  return (
    <footer className="bg-[#240046] text-white px-4 sm:px-6 lg:px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <ul className="flex flex-wrap gap-x-6 gap-y-3" role="list">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm text-white/60 transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs leading-relaxed text-white/40">
          &copy; {new Date().getFullYear()} {KITCHYN_COMPANY.legalName}. {KITCHYN_COMPANY.address}.
        </p>
      </div>
    </footer>
  );
}
