import Link from "next/link";
import type { Restaurant } from "@foodo/database";

interface LocationSectionProps {
  restaurant: Restaurant;
  restaurantSlug: string;
}

export function LocationSection({ restaurant, restaurantSlug }: LocationSectionProps) {
  const addressParts = [restaurant.address, restaurant.city, restaurant.state].filter(Boolean);
  const hasAnyInfo = addressParts.length > 0 || restaurant.phone;

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
              title={`${restaurant.name} location`}
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
            <p className="text-sm text-black-400">{restaurant.name}</p>
            {(restaurant.city || restaurant.state) && (
              <p className="text-xl font-bold text-black-900 mt-0.5">
                {[restaurant.city, restaurant.state].filter(Boolean).join(", ")}
              </p>
            )}
          </div>

          {/* Address */}
          {restaurant.address && (
            <div>
              <p className="text-xs text-black-400 mb-1.5">Address</p>
              <p className="text-sm font-medium text-black-900 leading-relaxed">
                {restaurant.address}
              </p>
              {(restaurant.city || restaurant.state) && (
                <p className="text-sm font-medium text-black-900">
                  {[restaurant.city, restaurant.state].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Contacts */}
          {restaurant.phone && (
            <div>
              <p className="text-xs text-black-400 mb-1.5">Contacts</p>
              <a
                href={`tel:${restaurant.phone}`}
                className="text-sm font-medium text-black-900 hover:text-primary transition-colors"
              >
                {restaurant.phone}
              </a>
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
