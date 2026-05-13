"use client";

import Link from "next/link";
import { useState } from "react";

const NAV_LINKS = [
  { label: "Platform", href: "#" },
  { label: "Solutions", href: "#" },
  { label: "Resources", href: "#" },
  { label: "Pricing", href: "#" },
  { label: "Help Center", href: "#" },
];

export function NavBar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <nav
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between"
        aria-label="Main navigation"
      >
        <Link href="/" className="flex items-center flex-shrink-0">
          <img
            src="/logo.png"
            alt="Kitchyn"
            className="h-8 w-auto object-contain"
            draggable={false}
          />
        </Link>

        <ul className="hidden md:flex items-center gap-8" role="list">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                className="text-sm font-medium text-[#1e1b1c]/70 hover:text-[#3C096C] transition-colors duration-200 cursor-pointer"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/dashboard/login"
            className="text-sm font-medium text-[#1e1b1c]/70 hover:text-[#3C096C] transition-colors duration-200 border border-gray-200 hover:border-[#3C096C]/30 rounded-lg px-3 py-1.5 cursor-pointer"
          >
            Login
          </Link>
          <Link
            href="/dashboard/login"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-[#3C096C] hover:bg-[#240046] rounded-lg transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3C096C] focus-visible:ring-offset-2 cursor-pointer"
          >
            Try for free
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden flex items-center justify-center w-11 h-11 rounded-lg text-[#1e1b1c] hover:bg-gray-100 transition-colors duration-200 cursor-pointer"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          {menuOpen ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>
      </nav>

      <div
        id="mobile-menu"
        className={`md:hidden border-t border-gray-100 bg-white overflow-hidden transition-all duration-300 ease-in-out ${
          menuOpen ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-0.5">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="flex items-center py-3 px-3 text-sm font-medium text-[#1e1b1c]/80 hover:text-[#3C096C] hover:bg-gray-50 rounded-lg transition-colors duration-200 cursor-pointer min-h-[44px]"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-3 pb-1 flex flex-col gap-2 border-t border-gray-100 mt-2">
            <Link
              href="/dashboard/login"
              className="flex items-center justify-center py-2.5 px-3 text-sm font-medium text-[#3C096C] border border-[#3C096C]/30 rounded-lg hover:bg-[#3C096C]/5 transition-colors duration-200 cursor-pointer min-h-[44px]"
              onClick={() => setMenuOpen(false)}
            >
              Login
            </Link>
            <Link
              href="/dashboard/login"
              className="flex items-center justify-center py-2.5 px-3 text-sm font-semibold text-white bg-[#3C096C] hover:bg-[#240046] rounded-lg transition-colors duration-200 cursor-pointer min-h-[44px]"
              onClick={() => setMenuOpen(false)}
            >
              Try for free
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
