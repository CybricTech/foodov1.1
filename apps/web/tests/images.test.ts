import { describe, expect, it } from "vitest";
import { responsiveSrcSet } from "@/lib/images";

const ORIGINAL =
  "https://x.supabase.co/storage/v1/object/public/menu-images/store/banner-1.png";

describe("responsiveSrcSet", () => {
  it("serves uncropped CDN resizes per width, never the stored original", () => {
    const { src, srcSet } = responsiveSrcSet(ORIGINAL);
    expect(src).not.toContain("/object/public/");
    expect(src).toContain("/render/image/public/menu-images/store/banner-1.png?width=1200");
    const entries = srcSet!.split(", ");
    expect(entries.map((e) => e.split(" ")[1])).toEqual(["640w", "828w", "1200w", "1920w"]);
    // contain + a tall box keeps the photo's aspect ratio so object-position
    // (the merchant's focal point) still applies; cover would crop it first.
    for (const e of entries) expect(e).toContain("&height=2500&resize=contain&quality=75");
  });

  it("passes through anything that isn't a Supabase public URL", () => {
    expect(responsiveSrcSet("https://example.com/a.jpg")).toEqual({
      src: "https://example.com/a.jpg",
      srcSet: undefined,
    });
    expect(responsiveSrcSet(null)).toEqual({ src: "", srcSet: undefined });
  });
});
