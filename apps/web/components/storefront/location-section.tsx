import Link from "next/link";
import type { Restaurant } from "@foodo/database";

type RestaurantExtended = Restaurant & {
  instagram_url?: string | null;
  facebook_url?: string | null;
  twitter_url?: string | null;
  youtube_url?: string | null;
  whatsapp_number?: string | null;
};

interface LocationSectionProps {
  restaurant: Restaurant;
  restaurantSlug: string;
}

export function LocationSection({ restaurant, restaurantSlug }: LocationSectionProps) {
  const r = restaurant as RestaurantExtended;
  const addressParts = [r.address, r.city, r.state].filter(Boolean);
  const socialLinks = [
    r.instagram_url && { href: r.instagram_url, label: "Instagram", icon: <InstagramIcon /> },
    r.facebook_url && { href: r.facebook_url, label: "Facebook", icon: <FacebookIcon /> },
    r.twitter_url && { href: r.twitter_url, label: "Twitter / X", icon: <XIcon /> },
    r.youtube_url && { href: r.youtube_url, label: "YouTube", icon: <YouTubeIcon /> },
    r.whatsapp_number && {
      href: `https://wa.me/${r.whatsapp_number.replace(/\D/g, "")}`,
      label: "WhatsApp",
      icon: <WhatsAppIcon />,
    },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];

  const hasAnyInfo = addressParts.length > 0 || r.phone;
  if (!hasAnyInfo) return null;

  const mapQuery = encodeURIComponent(addressParts.join(", "));

  return (
    <section className="mt-10 px-4 pb-8">
      <h2 className="text-2xl font-bold text-black-900 mb-5">Our location</h2>

      <div className="bg-black-50 rounded-2xl overflow-hidden border border-black-100">
        {/* Map embed */}
        {addressParts.length > 0 && (
          <div className="w-full h-44 bg-black-100">
            <iframe
              title={`${r.name} location`}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              src={`https://maps.google.com/maps?q=${mapQuery}&output=embed&z=15`}
            />
          </div>
        )}

        <div className="p-5 space-y-5">
          {/* Restaurant name + city headline */}
          <div>
            <p className="text-sm text-black-400">{r.name}</p>
            {(r.city || r.state) && (
              <p className="text-xl font-bold text-black-900 mt-0.5">
                {[r.city, r.state].filter(Boolean).join(", ")}
              </p>
            )}
          </div>

          {/* Address */}
          {r.address && (
            <div>
              <p className="text-xs text-black-400 mb-1.5">Address</p>
              <p className="text-sm font-medium text-black-900 leading-relaxed">{r.address}</p>
              {(r.city || r.state) && (
                <p className="text-sm font-medium text-black-900">
                  {[r.city, r.state].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Contacts + Social */}
          {(r.phone || socialLinks.length > 0) && (
            <div>
              <p className="text-xs text-black-400 mb-1.5">Contacts</p>
              {r.phone && (
                <a
                  href={`tel:${r.phone}`}
                  className="text-sm font-medium text-black-900 hover:text-primary transition-colors"
                >
                  {r.phone}
                </a>
              )}
              {socialLinks.length > 0 && (
                <div className="flex items-center gap-3 mt-3">
                  {socialLinks.map((s) => (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.label}
                      className="w-9 h-9 rounded-full bg-white border border-black-100 flex items-center justify-center text-black-500 hover:text-primary hover:border-primary transition-colors"
                    >
                      {s.icon}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Divider + CTA */}
          <div className="border-t border-black-200 pt-4">
            <Link
              href={`/${restaurantSlug}/menu`}
              className="block w-full bg-primary text-white text-center py-3.5 rounded-2xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Order online
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/>
      <path d="m10 15 5-3-5-3z"/>
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  );
}
