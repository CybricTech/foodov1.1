import Link from "next/link";
import { AccordionSection } from "./_components/accordion-section";
import { ScrollReveal } from "./_components/scroll-reveal";
import { NavBar } from "./_components/nav-bar";
import { DemoModal } from "./_components/demo-modal";
import { FeaturesSection } from "./_components/features-section";

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------


const TESTIMONIALS = [
  {
    quote:
      "As a small startup, competing with giants like Uber Eats seemed daunting until I found Kitchyn, offering easy payment systems and essential features like custom branding and fixed delivery zones. Plus, they handle all updates and maintenance, letting me focus on my business.",
    author: "Sarah M.",
    role: "Founder, BiteBox",
    initials: "SM",
  },
  {
    quote:
      "I love Kitchyn; It's been a game-changer for us, seamlessly handling fluctuating traffic and connecting drivers with customers, enabling our business to grow beyond expectations thanks to its efficient technology and order management capabilities.",
    author: "James O.",
    role: "COO, FreshRoute",
    initials: "JO",
  },
  {
    quote:
      "Kitchyn helped me quickly launch an affordable, fully-functional food ordering app with easy brand customization and localization, getting us started in just a few days.",
    author: "Elena R.",
    role: "Owner, TasteLocal",
    initials: "ER",
  },
  {
    quote:
      "Kitchyn perfectly matched our needs in the food delivery business, fueling our expansion with its capabilities. I'm very satisfied with its competitive admin dashboard and user experience for customers and drivers, alongside constant innovation and improvement.",
    author: "Michael T.",
    role: "Director, SwiftBite",
    initials: "MT",
  },
  {
    quote:
      "I've been using Kitchyn's affordable and reliable software for 3 years, appreciating its comprehensive features for restaurants, platform stability, and 24/7 support, along with dedicated assistance in marketing and development.",
    author: "Priya K.",
    role: "CEO, SpiceLane",
    initials: "PK",
  },
];

const STEPS = [
  "Tell us about your restaurant or food brand",
  "We configure your white-label app and dashboard",
  "You review, customise, and approve",
  "Go live — your customers order directly from you",
];

const STATS = [
  { value: "35%", label: "Average increase in orders" },
  { value: "1%", label: "Commission per order" },
  { value: "98%", label: "Order accuracy" },
  { value: "15+", label: "Restaurants in Abuja using Kitchyn" },
];

const FOOTER_LINKS = {
  Product: ["Platform", "Features", "Pricing", "Integrations"],
  Company: ["About", "Blog", "Careers", "Press"],
  Legal: ["Privacy", "Terms", "Contact", "Security"],
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
      <NavBar />

      <main>
        {/* ---------------------------------------------------------------- */}
        {/* SECTION 1 — HERO                                                  */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden bg-white pt-20 pb-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollReveal delay={80}>
              <h1
                className="text-5xl md:text-7xl font-semibold text-[#3C096C] leading-[1.05] tracking-tight mb-6"
                style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
              >
                <span className="text-[#1e1b1c]">The easiest</span> way to grow your restaurant sales online.
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={160}>
              <p className="max-w-2xl mx-auto text-base md:text-lg text-[#1e1b1c]/60 leading-relaxed mb-10">
                Your own branded storefront. Direct ordering. Direct payments. Built for independent restaurants in Nigeria. Go live in 24 hours.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={240}>
              <div className="flex justify-center mb-20">
                <DemoModal />
              </div>
            </ScrollReveal>
          </div>

          {/* Hero mockup */}
          <ScrollReveal delay={360} className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="relative flex justify-center overflow-hidden">
              <img
                src="/phone-mockup.png"
                alt="Kitchyn restaurant app mockup showing a food ordering interface"
                className="w-full max-w-sm h-auto drop-shadow-2xl mx-auto"
                draggable={false}
              />
              <div
                className="absolute inset-x-0 bottom-0 h-[40%]"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 40%, #ffffff 100%)",
                }}
                aria-hidden="true"
              />
            </div>
          </ScrollReveal>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* STATS STRIP                                                        */}
        {/* ---------------------------------------------------------------- */}
        <section className="border-y border-gray-100 bg-white py-10" aria-label="Platform statistics">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 text-center">
              {STATS.map((stat) => (
                <div key={stat.label} className="flex flex-col items-center gap-1">
                  <span
                    className="text-3xl font-black text-[#3C096C] leading-none"
                    style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
                  >
                    {stat.value}
                  </span>
                  <span className="text-sm text-[#1e1b1c]/50 font-medium">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 2 — FEATURES TABS                                        */}
        {/* ---------------------------------------------------------------- */}
        <FeaturesSection />

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
                style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
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
                      aria-hidden="true"
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
            <div className="text-center mb-16">
              <h2
                className="text-3xl md:text-4xl font-bold text-white mb-4"
                style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
              >
                Here&apos;s what our partners say about why they{" "}
                <span className="text-[#FFC629]">chose Kitchyn</span>
              </h2>
              <p className="text-white/50 text-base max-w-xl mx-auto">
                Real restaurants. Real growth. Real results.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {TESTIMONIALS.slice(0, 3).map((t, i) => (
                <div
                  key={i}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 md:p-8 flex flex-col border border-white/10 hover:bg-white/15 transition-colors duration-200 cursor-default"
                >
                  {/* Stars */}
                  <div className="flex gap-0.5 mb-4" aria-label="5 stars">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <svg
                        key={s}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4 text-[#FFC629]"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ))}
                  </div>
                  <p className="text-white/80 text-sm leading-relaxed mb-6 flex-1">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#FFC629]/20 border border-[#FFC629]/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#FFC629] text-xs font-bold">{t.initials}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm leading-none mb-0.5">
                        {t.author}
                      </p>
                      <p className="text-white/50 text-xs">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5 max-w-3xl mx-auto">
              {TESTIMONIALS.slice(3, 5).map((t, i) => (
                <div
                  key={i}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 md:p-8 flex flex-col border border-white/10 hover:bg-white/15 transition-colors duration-200 cursor-default"
                >
                  <div className="flex gap-0.5 mb-4" aria-label="5 stars">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <svg
                        key={s}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4 text-[#FFC629]"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ))}
                  </div>
                  <p className="text-white/80 text-sm leading-relaxed mb-6 flex-1">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#FFC629]/20 border border-[#FFC629]/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#FFC629] text-xs font-bold">{t.initials}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm leading-none mb-0.5">
                        {t.author}
                      </p>
                      <p className="text-white/50 text-xs">{t.role}</p>
                    </div>
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
                  style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
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
                  className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold text-white bg-[#3C096C] hover:bg-[#240046] rounded-xl transition-colors duration-200 shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3C096C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFC629] cursor-pointer min-h-[52px]"
                >
                  Request a free demo
                </Link>
              </div>

              <div className="flex justify-center lg:justify-end">
                <div className="relative">
                  <div className="absolute -inset-6 bg-[#3C096C]/10 rounded-3xl blur-2xl" aria-hidden="true" />
                  <img
                    src="/hero-mockup.png"
                    alt="Kitchyn restaurant platform interface"
                    className="relative w-full max-w-sm rounded-2xl shadow-2xl border border-[#3C096C]/10"
                    draggable={false}
                  />
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
                  style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
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
                  className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold text-[#3C096C] bg-[#FFC629] hover:bg-[#e6b225] rounded-xl transition-colors duration-200 shadow-lg shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC629] focus-visible:ring-offset-2 focus-visible:ring-offset-[#3C096C] cursor-pointer min-h-[52px]"
                >
                  Try Kitchyn for free
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-4" aria-label="Platform statistics">
                {STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-white flex flex-col justify-between min-h-[140px] border border-white/10 hover:bg-white/15 transition-colors duration-200 cursor-default"
                  >
                    <span
                      className="text-3xl font-black tracking-tight leading-none text-[#FFC629]"
                      style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
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
        <footer className="bg-[#240046] text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
              {/* Brand column */}
              <div className="md:col-span-1">
                <Link href="/" className="inline-flex mb-4" aria-label="Kitchyn home">
                  <img
                    src="/logo.png"
                    alt="Kitchyn"
                    className="h-8 w-auto object-contain brightness-0 invert"
                    draggable={false}
                  />
                </Link>
                <p className="text-white/40 text-sm leading-relaxed mt-3">
                  White-label food ordering for ambitious restaurant brands.
                </p>
              </div>

              {/* Link columns */}
              {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
                <div key={heading}>
                  <h3 className="text-white/80 text-xs font-semibold uppercase tracking-widest mb-4">
                    {heading}
                  </h3>
                  <ul className="space-y-3" role="list">
                    {links.map((item) => (
                      <li key={item}>
                        <Link
                          href="#"
                          className="text-sm text-white/40 hover:text-white transition-colors duration-200 cursor-pointer"
                        >
                          {item}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-white/30 text-center sm:text-left">
                &copy; {new Date().getFullYear()} Kitchyn. All rights reserved.
              </p>
              <p className="text-xs text-white/30">
                White-label food ordering for restaurants
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
