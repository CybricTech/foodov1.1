"use client";

import { useState } from "react";

const TABS = [
  {
    id: "orders",
    label: "More Online Orders",
    badge: "Direct ordering",
    headline: "Get your own branded online storefront",
    body: "Your restaurant gets a custom ordering page no third-party platform needed. Customers order directly from you and you keep every naira of revenue.",
    image: "/phone-mockup.png",
  },
  {
    id: "sales",
    label: "More Direct Sales",
    badge: "Low commission",
    headline: "Just 1% per order. No hidden fees.",
    body: "Unlike Glovo or Jumia Food who take up to 30%, Kitchyn charges just 1% per order. No setup fees, no hidden charges. The more you sell, the more you earn.",
    image: "/Group 7.png",
  },
  {
    id: "repeat",
    label: "More Repeat Customers",
    badge: "Customer retention",
    headline: "Turn first-time buyers into loyal regulars",
    body: "Built-in customer profiles, order history, and re-engagement tools keep customers coming back without spending extra on ads or discounts.",
    image: "/Group 8.png",
  },
  {
    id: "delivery",
    label: "Access Our Delivery Network",
    badge: "Delivery network",
    headline: "Fast, reliable delivery at your fingertips",
    body: "Seamless coordination with local dispatch riders and tools to manage your own fleet. Faster deliveries, happier customers, repeat orders.",
    image: "/Group 9.png",
  },
];

export function FeaturesSection() {
  const [activeId, setActiveId] = useState(TABS[0].id);
  const active = TABS.find((t) => t.id === activeId)!;

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <h2
          className="text-4xl md:text-5xl font-semibold text-[#1e1b1c] leading-tight mb-12 max-w-3xl"
          style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
        >
          With Kitchyn, you get more traffic, more sales, more repeat customers.
        </h2>

        {/* Tab nav */}
        <div className="flex items-end gap-0 border-b border-gray-200 mb-8 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveId(tab.id)}
                className={`flex-shrink-0 pb-3 px-5 text-sm font-medium transition-colors duration-200 border-b-2 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "border-[#3C096C] text-[#3C096C]"
                    : "border-transparent text-[#1e1b1c]/40 hover:text-[#1e1b1c]/70"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Feature card */}
        <div className="rounded-3xl overflow-hidden bg-[#1a0033] flex flex-col md:flex-row" style={{ minHeight: "480px" }}>
          {/* Left — text content */}
          <div className="flex flex-col justify-center px-8 md:px-14 py-12 md:py-16 md:w-[55%] z-10">
            <span
              className="inline-block text-xs font-semibold text-[#FFC629] uppercase tracking-widest mb-4"
              style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
            >
              {active.badge}
            </span>
            <h3
              className="text-2xl md:text-3xl font-semibold text-white leading-snug mb-5"
              style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
            >
              {active.headline}
            </h3>
            <p className="text-white/60 text-base leading-relaxed max-w-sm">
              {active.body}
            </p>
          </div>

          {/* Right — phone mockup */}
          <div className="relative md:w-[45%] flex items-end justify-center overflow-hidden py-8">
            <div
              className="absolute inset-0 opacity-40"
              style={{
                background: "radial-gradient(ellipse at 50% 30%, #7B2CBF 0%, transparent 70%)",
              }}
              aria-hidden="true"
            />
            <img
              src={active.image}
              alt="Kitchyn restaurant app interface"
              className="relative w-[260px] md:w-[300px] h-auto drop-shadow-2xl flex-shrink-0"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
