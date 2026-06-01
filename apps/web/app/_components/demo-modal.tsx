"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import posthog from "posthog-js";

type FormData = {
  name: string;
  email: string;
  phone: string;
  restaurantName: string;
  restaurantAddress: string;
  restaurantType: string;
  dailyOrders: string;
};

const INITIAL: FormData = {
  name: "",
  email: "",
  phone: "",
  restaurantName: "",
  restaurantAddress: "",
  restaurantType: "",
  dailyOrders: "",
};

export function DemoModal() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/landing/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          restaurantName: form.restaurantName,
          email: form.email,
          phone: form.phone,
          message: [form.restaurantAddress, form.restaurantType, form.dailyOrders]
            .filter(Boolean)
            .join(" | ") || null,
        }),
      });
    } catch {
      // Non-blocking — still show success to user
    }
    posthog.capture("demo_request_submitted", {
      restaurant_type: form.restaurantType || null,
      daily_orders_range: form.dailyOrders || null,
    });
    setLoading(false);
    setSubmitted(true);
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setForm(INITIAL);
      setSubmitted(false);
    }, 300);
  };

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold text-white bg-[#3C096C] hover:bg-[#240046] rounded-xl transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3C096C] focus-visible:ring-offset-2 min-w-[160px] cursor-pointer shadow-lg shadow-[#3C096C]/20"
      >
        Book a demo
      </button>

      {/* Backdrop — rendered in document.body via portal to escape stacking contexts */}
      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          {/* Modal */}
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-[#3C096C] px-6 py-5">
              <h2
                className="text-xl font-semibold text-white"
                style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
              >
                Book a free demo
              </h2>
              <p className="text-white/60 text-sm mt-1">
                We&apos;ll reach out within 24 hours to schedule your session.
              </p>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-6 max-h-[70vh] overflow-y-auto">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#3C096C]/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7 text-[#3C096C]">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-[#1e1b1c]" style={{ fontFamily: "Poppins, system-ui, sans-serif" }}>
                      Request received!
                    </p>
                    <p className="text-sm text-[#1e1b1c]/50 mt-1">
                      We&apos;ll be in touch within 24 hours.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="mt-2 px-6 py-2.5 text-sm font-semibold text-white bg-[#3C096C] hover:bg-[#240046] rounded-xl transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Row: Name + Phone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#1e1b1c]/70 mb-1.5" htmlFor="name">
                        Full name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="name"
                        type="text"
                        required
                        placeholder="e.g. John Doe"
                        value={form.name}
                        onChange={set("name")}
                        className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-[#1e1b1c] placeholder:text-gray-400 focus:outline-none focus:border-[#3C096C] focus:ring-1 focus:ring-[#3C096C] transition-colors min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#1e1b1c]/70 mb-1.5" htmlFor="phone">
                        Phone number <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="phone"
                        type="tel"
                        required
                        placeholder="e.g. 08012345678"
                        value={form.phone}
                        onChange={set("phone")}
                        className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-[#1e1b1c] placeholder:text-gray-400 focus:outline-none focus:border-[#3C096C] focus:ring-1 focus:ring-[#3C096C] transition-colors min-h-[44px]"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold text-[#1e1b1c]/70 mb-1.5" htmlFor="email">
                      Email address <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      placeholder="you@restaurant.com"
                      value={form.email}
                      onChange={set("email")}
                      className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-[#1e1b1c] placeholder:text-gray-400 focus:outline-none focus:border-[#3C096C] focus:ring-1 focus:ring-[#3C096C] transition-colors min-h-[44px]"
                    />
                  </div>

                  {/* Restaurant name */}
                  <div>
                    <label className="block text-xs font-semibold text-[#1e1b1c]/70 mb-1.5" htmlFor="restaurantName">
                      Restaurant name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="restaurantName"
                      type="text"
                      required
                      placeholder="e.g. Drizzy's Kitchen"
                      value={form.restaurantName}
                      onChange={set("restaurantName")}
                      className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-[#1e1b1c] placeholder:text-gray-400 focus:outline-none focus:border-[#3C096C] focus:ring-1 focus:ring-[#3C096C] transition-colors min-h-[44px]"
                    />
                  </div>

                  {/* Restaurant address */}
                  <div>
                    <label className="block text-xs font-semibold text-[#1e1b1c]/70 mb-1.5" htmlFor="restaurantAddress">
                      Restaurant address <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="restaurantAddress"
                      type="text"
                      required
                      placeholder="e.g. 5 Gana St, Maitama, Abuja"
                      value={form.restaurantAddress}
                      onChange={set("restaurantAddress")}
                      className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-[#1e1b1c] placeholder:text-gray-400 focus:outline-none focus:border-[#3C096C] focus:ring-1 focus:ring-[#3C096C] transition-colors min-h-[44px]"
                    />
                  </div>

                  {/* Row: Restaurant type + Daily orders */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#1e1b1c]/70 mb-1.5" htmlFor="restaurantType">
                        Restaurant type
                      </label>
                      <div className="relative">
                        <select
                          id="restaurantType"
                          value={form.restaurantType}
                          onChange={set("restaurantType")}
                          className="w-full appearance-none rounded-lg border border-gray-200 pl-3.5 pr-9 py-2.5 text-sm text-[#1e1b1c] focus:outline-none focus:border-[#3C096C] focus:ring-1 focus:ring-[#3C096C] transition-colors min-h-[44px] bg-white cursor-pointer"
                        >
                          <option value="">Select type</option>
                          <option>Quick service (QSR)</option>
                          <option>Casual dining</option>
                          <option>Fine dining</option>
                          <option>Cloud kitchen</option>
                          <option>Food truck</option>
                          <option>Bakery / Café</option>
                          <option>Other</option>
                        </select>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true">
                          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#1e1b1c]/70 mb-1.5" htmlFor="dailyOrders">
                        Est. daily orders
                      </label>
                      <div className="relative">
                        <select
                          id="dailyOrders"
                          value={form.dailyOrders}
                          onChange={set("dailyOrders")}
                          className="w-full appearance-none rounded-lg border border-gray-200 pl-3.5 pr-9 py-2.5 text-sm text-[#1e1b1c] focus:outline-none focus:border-[#3C096C] focus:ring-1 focus:ring-[#3C096C] transition-colors min-h-[44px] bg-white cursor-pointer"
                        >
                          <option value="">Select range</option>
                          <option>1 – 20</option>
                          <option>21 – 50</option>
                          <option>51 – 100</option>
                          <option>101 – 300</option>
                          <option>300+</option>
                        </select>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true">
                          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-[#3C096C] hover:bg-[#240046] disabled:opacity-60 rounded-xl transition-colors duration-200 cursor-pointer min-h-[48px]"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Sending...
                      </>
                    ) : (
                      "Request a demo"
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
