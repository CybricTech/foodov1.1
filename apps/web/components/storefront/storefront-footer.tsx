import Image from "next/image";

/**
 * Shared storefront footer: "© {year} {restaurant}. All rights reserved."
 * plus the "Powered by Kitchyn" mark. Rendered at the bottom of both the
 * landing page (via the location section) and the menu page.
 */
export function StorefrontFooter({ restaurantName }: { restaurantName: string }) {
  return (
    <footer className="mt-10 pb-7 flex flex-col items-center gap-2 text-center">
      <p className="px-4 text-[11px] font-medium text-black-400">
        © {new Date().getFullYear()} {restaurantName}. All rights reserved.
      </p>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-black-400">
        <span>Powered by</span>
        <div className="relative h-[18px] w-[68px]">
          <Image
            src="/logo.png"
            alt="Kitchyn"
            fill
            className="object-contain object-center"
          />
        </div>
      </div>
    </footer>
  );
}
