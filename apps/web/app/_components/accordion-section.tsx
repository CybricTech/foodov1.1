"use client";

import { useState } from "react";

const ACCORDION_ITEMS = [
  {
    id: 1,
    title: "Scale your business indefinitely",
    body: "Kitchyn is built to grow with you — from a single-location cafe to a national restaurant chain. Add new branches, menus, and team members without hitting platform limits or paying per-seat fees.",
  },
  {
    id: 2,
    title: "Get your apps to the top of app stores",
    body: "Your branded iOS and Android apps are fully optimised for App Store and Google Play discoverability. Our ASO playbook and regular metadata refreshes keep you ranking above generic food apps.",
  },
  {
    id: 3,
    title: "Get updates every month for free",
    body: "We ship new features, performance improvements, and regulatory compliance updates every month — at no extra cost. Your platform stays modern without extra development spend.",
  },
  {
    id: 4,
    title: "Experience superior customer support",
    body: "A dedicated success manager is assigned to every Kitchyn partner. Reach us via live chat, email, or phone. Average first-response time is under 2 minutes during business hours.",
  },
  {
    id: 5,
    title: "Benefit from our expertise",
    body: "Our team has launched food ordering platforms across 30+ markets. We guide you through onboarding, marketing launch, menu optimisation, and retention campaigns so you hit revenue targets faster.",
  },
];

export function AccordionSection() {
  const [openId, setOpenId] = useState<number | null>(1);

  const toggle = (id: number) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <section className="py-24 bg-[#240046]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left — heading + device mockup */}
          <div className="lg:sticky lg:top-24">
            <h2
              className="text-4xl font-bold text-white mb-6 leading-tight"
              style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
            >
              What sets{" "}
              <span className="text-[#FFC629]">Kitchyn</span> apart
            </h2>
            <p className="text-white/60 text-lg mb-10">
              Every feature is purpose-built for food businesses. No bloated
              POS add-ons, no complicated integrations — just a complete
              ordering platform that works out of the box.
            </p>
            <div className="relative">
              <div className="absolute -inset-3 bg-white/5 rounded-3xl blur-xl" />
              <img
                src="/hero-mockup.png"
                alt="Kitchyn restaurant dashboard"
                className="relative w-full rounded-2xl shadow-2xl border border-white/10"
                draggable={false}
              />
            </div>
          </div>

          {/* Right — accordion */}
          <div className="space-y-0 divide-y divide-white/10 border-t border-white/10">
            {ACCORDION_ITEMS.map((item) => {
              const isOpen = openId === item.id;
              return (
                <div key={item.id} className="py-1">
                  <button
                    onClick={() => toggle(item.id)}
                    className="w-full flex items-center justify-between py-5 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC629] focus-visible:ring-offset-2 focus-visible:ring-offset-[#240046] rounded-sm"
                    aria-expanded={isOpen}
                    aria-controls={`accordion-body-${item.id}`}
                  >
                    <span className="flex items-center gap-4">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 text-[#FFC629] font-bold text-sm flex items-center justify-center group-hover:bg-white/20 transition-colors">
                        {item.id}
                      </span>
                      <span
                        className={`text-lg font-semibold transition-colors ${
                          isOpen
                            ? "text-[#FFC629]"
                            : "text-white group-hover:text-[#FFC629]"
                        }`}
                      >
                        {item.title}
                      </span>
                    </span>
                    <span
                      className={`flex-shrink-0 ml-4 w-6 h-6 flex items-center justify-center rounded-full border transition-all duration-200 ${
                        isOpen
                          ? "border-[#FFC629] bg-[#FFC629] text-[#231F20] rotate-180"
                          : "border-white/30 text-white/50 group-hover:border-[#FFC629] group-hover:text-[#FFC629]"
                      }`}
                      aria-hidden="true"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-3.5 h-3.5 transition-transform"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  </button>
                  <div
                    id={`accordion-body-${item.id}`}
                    role="region"
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isOpen ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <p className="pb-6 pl-12 text-white/60 leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
