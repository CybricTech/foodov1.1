import Link from "next/link";
import { AccordionSection } from "./_components/accordion-section";
import { ScrollReveal } from "./_components/scroll-reveal";

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { label: "Platform", href: "#" },
  { label: "Solutions", href: "#" },
  { label: "Resources", href: "#" },
  { label: "Pricing", href: "#" },
  { label: "Help Center", href: "#" },
];

const TABLE_COLUMNS = [
  { key: "kitchyn", label: "Kitchyn", highlight: true },
  { key: "gloria", label: "GloriaFood", highlight: false },
  { key: "square", label: "Square", highlight: false },
  { key: "toast", label: "Toast POS", highlight: false },
  { key: "lightspeed", label: "Lightspeed", highlight: false },
  { key: "orda", label: "Orda", highlight: false },
];

type CellValue = "check" | "partial" | "cross" | string;

const TABLE_ROWS: { label: string; values: Record<string, CellValue> }[] = [
  {
    label: "Overall rating",
    values: {
      kitchyn: "4.9 ★★★★★",
      gloria: "4.1 ★★★★",
      square: "4.2 ★★★★",
      toast: "4.0 ★★★★",
      lightspeed: "3.9 ★★★",
      orda: "4.3 ★★★★",
    },
  },
  {
    label: "Positioning",
    values: {
      kitchyn: "White-label food ordering",
      gloria: "Online ordering system",
      square: "POS + ordering",
      toast: "Restaurant POS",
      lightspeed: "Hospitality POS",
      orda: "Mobile ordering",
    },
  },
  {
    label: "Free product version",
    values: {
      kitchyn: "check",
      gloria: "check",
      square: "partial",
      toast: "cross",
      lightspeed: "cross",
      orda: "partial",
    },
  },
  {
    label: "Customer & Staff apps (iOS & Android)",
    values: {
      kitchyn: "check",
      gloria: "partial",
      square: "check",
      toast: "check",
      lightspeed: "partial",
      orda: "check",
    },
  },
  {
    label: "Delivery / Super App",
    values: {
      kitchyn: "check",
      gloria: "cross",
      square: "partial",
      toast: "partial",
      lightspeed: "cross",
      orda: "partial",
    },
  },
  {
    label: "Your branding",
    values: {
      kitchyn: "check",
      gloria: "partial",
      square: "partial",
      toast: "cross",
      lightspeed: "cross",
      orda: "check",
    },
  },
  {
    label: "Admin Dashboard",
    values: {
      kitchyn: "check",
      gloria: "check",
      square: "check",
      toast: "check",
      lightspeed: "check",
      orda: "partial",
    },
  },
  {
    label: "Analytics & Reporting",
    values: {
      kitchyn: "check",
      gloria: "partial",
      square: "check",
      toast: "check",
      lightspeed: "check",
      orda: "cross",
    },
  },
  {
    label: "High load capacity",
    values: {
      kitchyn: "10,000+ orders daily",
      gloria: "Not mentioned",
      square: "Scalable",
      toast: "Enterprise",
      lightspeed: "Not specified",
      orda: "Limited",
    },
  },
  {
    label: "Intuitive design",
    values: {
      kitchyn: "check",
      gloria: "check",
      square: "check",
      toast: "partial",
      lightspeed: "partial",
      orda: "check",
    },
  },
  {
    label: "Support",
    values: {
      kitchyn: "24/7 live + account manager",
      gloria: "Email, knowledge base",
      square: "Phone, email",
      toast: "Phone, email",
      lightspeed: "Chat, email",
      orda: "Helpdesk, email",
    },
  },
  {
    label: "Marketing Support",
    values: {
      kitchyn: "check",
      gloria: "cross",
      square: "partial",
      toast: "cross",
      lightspeed: "cross",
      orda: "partial",
    },
  },
  {
    label: "App Store Optimization",
    values: {
      kitchyn: "check",
      gloria: "cross",
      square: "cross",
      toast: "cross",
      lightspeed: "cross",
      orda: "cross",
    },
  },
  {
    label: "Localization, languages",
    values: {
      kitchyn: "50+ languages",
      gloria: "Limited",
      square: "10+",
      toast: "5+",
      lightspeed: "10+",
      orda: "Limited",
    },
  },
  {
    label: "Payment gateways",
    values: {
      kitchyn: "20+. Custom on request",
      gloria: "4",
      square: "Built-in",
      toast: "Built-in",
      lightspeed: "12",
      orda: "Limited",
    },
  },
  {
    label: "Stability",
    values: {
      kitchyn: "99.98%+",
      gloria: "99.9%+",
      square: "99.9%",
      toast: "99.9%",
      lightspeed: "99.9%",
      orda: "99.5%",
    },
  },
  {
    label: "APIs",
    values: {
      kitchyn: "check",
      gloria: "cross",
      square: "check",
      toast: "check",
      lightspeed: "check",
      orda: "cross",
    },
  },
  {
    label: "Business model",
    values: {
      kitchyn: "Monthly subscription, no per-order fees",
      gloria: "Free + premium plans",
      square: "Per transaction",
      toast: "Hardware + subscription",
      lightspeed: "Subscription",
      orda: "Subscription + setup",
    },
  },
  {
    label: "Updates",
    values: {
      kitchyn: "Free. Monthly updates",
      gloria: "Infrequent",
      square: "Regular",
      toast: "Regular",
      lightspeed: "On request",
      orda: "Limited",
    },
  },
];

const TESTIMONIALS = [
  {
    quote:
      "As a small startup, competing with giants like Uber Eats seemed daunting until I found Kitchyn, offering easy payment systems and essential features like custom branding and fixed delivery zones. Plus, they handle all updates and maintenance, letting me focus on my business.",
    author: "Sarah M.",
    role: "Founder, BiteBox",
  },
  {
    quote:
      "I love Kitchyn; It's been a game-changer for us, seamlessly handling fluctuating traffic and connecting drivers with customers, enabling our business to grow beyond expectations thanks to its efficient technology and order management capabilities.",
    author: "James O.",
    role: "COO, FreshRoute",
  },
  {
    quote:
      "Kitchyn helped me quickly launch an affordable, fully-functional food ordering app with easy brand customization and localization, getting us started in just a few days.",
    author: "Elena R.",
    role: "Owner, TasteLocal",
  },
  {
    quote:
      "Kitchyn perfectly matched our needs in the food delivery business, fueling our expansion with its capabilities. I'm very satisfied with its competitive admin dashboard and user experience for customers and drivers, alongside constant innovation and improvement.",
    author: "Michael T.",
    role: "Director, SwiftBite",
  },
  {
    quote:
      "I've been using Kitchyn's affordable and reliable software for 3 years, appreciating its comprehensive features for restaurants, platform stability, and 24/7 support, along with dedicated assistance in marketing and development.",
    author: "Priya K.",
    role: "CEO, SpiceLane",
  },
];

const STEPS = [
  "Tell us about your restaurant or food brand",
  "We configure your white-label app and dashboard",
  "You review, customise, and approve",
  "Go live — your customers order directly from you",
];

const STATS = [
  { value: "200+", label: "restaurants powered" },
  { value: "10,000+", label: "orders processed daily" },
  { value: "99.9%", label: "system uptime" },
  { value: "50+", label: "market leader partners" },
];

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-5 h-5 ${className}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function QuestionIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-5 h-5 ${className}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CrossIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-5 h-5 ${className}`}
      aria-hidden="true"
    >
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`w-3.5 h-3.5 ${className}`}
    >
      <path
        fillRule="evenodd"
        d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TableCell({ value, isKitchyn }: { value: CellValue; isKitchyn: boolean }) {
  if (value === "check") {
    return (
      <span className="flex justify-center">
        <CheckIcon className={isKitchyn ? "text-[#3C096C]" : "text-gray-400"} />
      </span>
    );
  }
  if (value === "partial") {
    return (
      <span className="flex justify-center">
        <QuestionIcon className="text-gray-300" />
      </span>
    );
  }
  if (value === "cross") {
    return (
      <span className="flex justify-center">
        <CrossIcon className="text-gray-200" />
      </span>
    );
  }
  return (
    <span
      className={`block text-center text-xs leading-snug ${
        isKitchyn ? "font-semibold text-[#3C096C]" : "text-gray-500"
      }`}
    >
      {value}
    </span>
  );
}

function WinnerPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#FFC629] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#231F20]">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ------------------------------------------------------------------ */}
      {/* NAV  —  white, sticky, bordered                                   */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <nav
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between"
          aria-label="Main navigation"
        >
          <Link
            href="/"
            className="text-2xl font-black text-[#3C096C] hover:text-[#5A189A] transition-colors tracking-tight"
            style={{ fontFamily: "Epilogue, system-ui, sans-serif" }}
          >
            kitchyn
          </Link>

          <ul className="hidden md:flex items-center gap-8" role="list">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm font-medium text-[#1e1b1c]/80 hover:text-[#3C096C] transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="hidden md:flex items-center gap-1 text-sm font-medium text-[#1e1b1c]/80 hover:text-[#3C096C] transition-colors border border-gray-200 hover:border-[#3C096C]/30 rounded-lg px-3 py-1.5"
              aria-haspopup="listbox"
            >
              Go to
              <ChevronDownIcon className="text-[#1e1b1c]/40" />
            </button>

            <Link
              href="/dashboard/login"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-[#3C096C] hover:bg-[#240046] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3C096C] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              Try for free
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* ---------------------------------------------------------------- */}
        {/* SECTION 1 — HERO  (onde.app style, brand colours)                */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden bg-white pt-20 pb-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollReveal delay={0}>
              <h1
                className="text-5xl md:text-7xl font-black text-[#3C096C] leading-[1.05] tracking-tight mb-6"
                style={{ fontFamily: "Epilogue, system-ui, sans-serif" }}
              >
                <span className="text-[#1e1b1c]">Launch</span>{" "}
                your own
                <br />
                restaurant from home
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={150}>
              <p className="max-w-2xl mx-auto text-sm md:text-base text-[#1e1b1c] leading-relaxed mb-12">
                Look through the list of the top food platforms and white-label
                restaurant apps to launch or scale your business. Choose the one
                that meets your needs best.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
                <Link
                  href="/dashboard/login"
                  className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold text-white bg-[#3C096C] hover:bg-[#240046] rounded-xl transition-colors shadow-lg shadow-[#3C096C]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3C096C] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  Try for free
                </Link>
              </div>
            </ScrollReveal>
          </div>

          {/* Hero mockup image */}
          <ScrollReveal delay={450} className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="relative flex justify-center overflow-hidden">
              <img
                src="/hero-mockup.png"
                alt="Kitchyn restaurant app mockup showing Drizzy's food ordering interface"
                className="w-full max-w-4xl h-auto drop-shadow-2xl"
                draggable={false}
              />
              {/* Bottom fade to white */}
              <div
                className="absolute inset-x-0 bottom-0 h-[40%]"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 40%, #ffffff 100%)",
                }}
              />
            </div>
          </ScrollReveal>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 2 — COMPARISON TABLE                                     */}
        {/* ---------------------------------------------------------------- */}
        <section className="py-24 bg-[#3C096C]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2
                className="text-4xl font-bold text-white mb-4"
                style={{ fontFamily: "Epilogue, system-ui, sans-serif" }}
              >
                Think twice,{" "}
                <span className="text-[#FFC629]">choose</span>{" "}
                <span className="text-[#FF4900]">wisely</span>
              </h2>
              <p className="max-w-2xl mx-auto text-white/60 text-lg">
                We did the research so you don&apos;t have to. Kitchyn
                consistently outperforms every alternative on the features that
                matter most to food businesses.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10 shadow-2xl bg-white">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-4 px-5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-56">
                      Feature
                    </th>
                    {TABLE_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`py-4 px-3 text-center text-xs font-bold uppercase tracking-wider ${
                          col.highlight
                            ? "bg-[#3C096C]/5 text-[#3C096C]"
                            : "text-gray-500"
                        }`}
                      >
                        {col.highlight && (
                          <span className="block text-[10px] font-black bg-[#FFC629] text-[#231F20] rounded px-1.5 py-0.5 mb-1 mx-auto w-fit">
                            TOP PICK
                          </span>
                        )}
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {TABLE_ROWS.map((row) => (
                    <tr
                      key={row.label}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="py-3.5 px-5 text-gray-700 font-medium text-xs">
                        {row.label}
                      </td>
                      {TABLE_COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={`py-3.5 px-3 ${
                            col.highlight ? "bg-[#3C096C]/[0.03]" : ""
                          }`}
                        >
                          <TableCell
                            value={row.values[col.key]}
                            isKitchyn={col.highlight}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-center mt-8 text-white/50 text-sm">
              All data based on publicly available information as of 2024.{" "}
              <Link
                href="/dashboard/login"
                className="text-[#FFC629] font-semibold hover:underline"
              >
                Start with kitchyn free today →
              </Link>
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 3 — WHAT SETS KITCHYN APART                             */}
        {/* ---------------------------------------------------------------- */}
        <AccordionSection />

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 4 — AI / WINNER                                          */}
        {/* ---------------------------------------------------------------- */}
        <section className="py-24 bg-[#240046]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <p className="text-white/60 text-sm mb-3">
                Let AI explain why restaurants choose Kitchyn
              </p>
              <p className="text-white/40 text-xs max-w-lg mx-auto">
                Ask an independent AI to compare Kitchyn with other food
                ordering platforms: pricing, features, scalability
              </p>
            </div>

            <div className="max-w-3xl mx-auto bg-white rounded-3xl p-8 md:p-12">
              <div className="flex items-center justify-center gap-3 mb-6">
                <WinnerPill>Winner: Kitchyn</WinnerPill>
              </div>

              <h3
                className="text-2xl md:text-3xl font-bold text-[#231F20] text-center mb-8"
                style={{ fontFamily: "Epilogue, system-ui, sans-serif" }}
              >
                Kitchyn wins for ambitious restaurant operators who need
                rock-solid uptime, advanced automation, and marketing tools that
                actually drive growth
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Rock-solid uptime", color: "#3C096C" },
                  { label: "Advanced automation", color: "#FFC629" },
                  { label: "Marketing tools", color: "#FF4900" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 rounded-xl px-5 py-4"
                    style={{ backgroundColor: `${item.color}10` }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span
                      className="text-sm font-semibold"
                      style={{ color: item.color }}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 5 — TESTIMONIALS                                         */}
        {/* ---------------------------------------------------------------- */}
        <section className="py-24 bg-[#3C096C]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2
              className="text-3xl md:text-4xl font-bold text-white text-center mb-16"
              style={{ fontFamily: "Epilogue, system-ui, sans-serif" }}
            >
              Here&apos;s what our partners say about why they{" "}
              <span className="text-[#FFC629]">chose Kitchyn</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {TESTIMONIALS.slice(0, 3).map((t, i) => (
                <div
                  key={i}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 md:p-8 flex flex-col border border-white/10"
                >
                  <p className="text-white/80 text-sm leading-relaxed mb-6 flex-1">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div>
                    <p className="font-semibold text-white text-sm">
                      {t.author}
                    </p>
                    <p className="text-white/50 text-xs">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 max-w-3xl mx-auto">
              {TESTIMONIALS.slice(3, 5).map((t, i) => (
                <div
                  key={i}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 md:p-8 flex flex-col border border-white/10"
                >
                  <p className="text-white/80 text-sm leading-relaxed mb-6 flex-1">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div>
                    <p className="font-semibold text-white text-sm">
                      {t.author}
                    </p>
                    <p className="text-white/50 text-xs">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 6 — CTA BANNER                                           */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-[#FFC629] py-20 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2
                  className="text-4xl font-bold text-[#231F20] mb-8 leading-tight"
                  style={{ fontFamily: "Epilogue, system-ui, sans-serif" }}
                >
                  Find a food ordering solution that is right for your business
                </h2>

                <ol className="space-y-4 mb-10" aria-label="How it works">
                  {STEPS.map((step, idx) => (
                    <li key={step} className="flex items-start gap-4">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#3C096C] text-white font-bold text-sm flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="text-[#231F20]/80 text-base leading-snug pt-1">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>

                <Link
                  href="/dashboard/login"
                  className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold text-white bg-[#3C096C] hover:bg-[#240046] rounded-xl transition-colors shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3C096C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFC629]"
                >
                  Request a free demo
                </Link>
              </div>

              <div className="flex justify-center lg:justify-end">
                <div className="relative w-64 md:w-72">
                  <div
                    id="cta-mockup"
                    className="w-full aspect-[9/19] rounded-[2.5rem] bg-[#3C096C]/10 border-2 border-dashed border-[#3C096C]/30 flex items-center justify-center"
                  >
                    <span className="text-[#3C096C]/40 text-xs font-medium select-none text-center px-4">
                      Phone app screenshot
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 7 — STATS                                                */}
        {/* ---------------------------------------------------------------- */}
        <section className="py-24 bg-[#3C096C]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2
                  className="text-4xl font-bold text-white mb-6 leading-tight"
                  style={{ fontFamily: "Epilogue, system-ui, sans-serif" }}
                >
                  Kitchyn{" "}
                  <span className="text-[#FFC629]">
                    helps your business scale and become a market leader
                  </span>
                </h2>
                <p className="text-white/60 text-lg mb-10 leading-relaxed">
                  Hundreds of restaurants have switched to Kitchyn and seen
                  measurable growth in direct orders, customer retention, and
                  average order value within the first 90 days.
                </p>
                <Link
                  href="/dashboard/login"
                  className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold text-[#3C096C] bg-[#FFC629] hover:bg-[#e6b225] rounded-xl transition-colors shadow-lg shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC629] focus-visible:ring-offset-2 focus-visible:ring-offset-[#3C096C]"
                >
                  Try Kitchyn for free
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-4" aria-label="Platform statistics">
                {STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-white flex flex-col justify-between min-h-[140px] border border-white/10"
                  >
                    <span
                      className="text-3xl font-black tracking-tight leading-none text-[#FFC629]"
                      style={{ fontFamily: "Epilogue, system-ui, sans-serif" }}
                    >
                      {stat.value}
                    </span>
                    <span className="text-white/60 text-sm font-medium mt-3 leading-snug">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* FOOTER                                                            */}
        {/* ---------------------------------------------------------------- */}
        <footer className="bg-[#240046] text-white/50 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <span
                className="text-white font-black text-2xl tracking-tight"
                style={{ fontFamily: "Epilogue, system-ui, sans-serif" }}
              >
                kitchyn
              </span>
              <p className="text-sm text-center md:text-left">
                &copy; {new Date().getFullYear()} kitchyn.app — White-label food
                ordering for restaurants
              </p>
              <nav
                className="flex items-center gap-6"
                aria-label="Footer navigation"
              >
                {["Privacy", "Terms", "Contact"].map((item) => (
                  <Link
                    key={item}
                    href="#"
                    className="text-sm text-white/40 hover:text-white transition-colors"
                  >
                    {item}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
