import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { createServiceClient } from "@/lib/supabase/server";
import { QrFlyerCustomizer } from "@/components/admin/qr-flyer-customizer";
import { sanitizeBrandColor, storefrontHost, storefrontQrUrl } from "@/lib/qr-flyer";

export const dynamic = "force-dynamic";
export const metadata = { title: "QR flyer" };

export default async function MerchantQrFlyerPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServiceClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, slug, logo_url, primary_color")
    .eq("id", params.id)
    .single();

  if (!restaurant) {
    redirect("/admin/merchants");
  }

  // Base QR with black modules — the customiser recolours it live to the brand
  // colour client-side. margin:0 — the white frame interior is the quiet zone.
  let baseQrSvg = await QRCode.toString(storefrontQrUrl(restaurant.slug), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#000000", light: "#ffffff" },
  });
  baseQrSvg = baseQrSvg.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, "");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="p-6 pb-24">
        <QrFlyerCustomizer
          merchantId={restaurant.id}
          merchantName={restaurant.name}
          defaultLogoUrl={restaurant.logo_url}
          defaultBrandColor={sanitizeBrandColor(restaurant.primary_color)}
          storefrontHost={storefrontHost(restaurant.slug)}
          baseQrSvg={baseQrSvg}
        />
      </div>
    </>
  );
}

const PRINT_CSS = `
@media screen {
  .qf-preview .qf-sheet {
    box-shadow: 0 4px 24px rgba(0,0,0,0.14);
    border: 1px solid #e5e5ea;
  }
}
@media print {
  @page { size: A4; margin: 0; }
  /* Clamp the document to one page so the hidden admin chrome/controls can't spill blank pages. */
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: 297mm !important; overflow: hidden !important; }
  body * { visibility: hidden !important; }
  .qf-sheet, .qf-sheet * { visibility: visible !important; }
  .qf-sheet {
    position: absolute !important;
    left: 0 !important; top: 0 !important;
    margin: 0 !important; box-shadow: none !important; border: 0 !important;
  }
  .qf-controls { display: none !important; }
}
`;
