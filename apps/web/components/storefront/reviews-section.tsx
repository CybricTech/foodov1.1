import { Star } from "lucide-react";
import type { Review } from "@foodo/database";

interface ReviewsSectionProps {
  reviews: Pick<Review, "id" | "reviewer_name" | "rating" | "comment" | "created_at">[];
  average: number;
  count: number;
}

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const iconSize = size === "lg" ? 20 : 13;
  return (
    <div
      className="flex gap-0.5"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={iconSize}
          className={star <= rating ? "text-dixie-500" : "text-black-100"}
          fill={star <= rating ? "currentColor" : "currentColor"}
        />
      ))}
    </div>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReviewsSection({ reviews, average, count }: ReviewsSectionProps) {
  if (count === 0) return null;

  return (
    <section className="mt-10 px-5">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-black-900">Reviews</h2>
        <p className="text-xs text-black-400 mt-0.5">What customers are saying</p>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-5 mb-6 p-4 bg-black-50 rounded-2xl border border-black-100">
        <div className="text-center flex-shrink-0">
          <p className="text-4xl font-extrabold text-black-900 leading-none">
            {average.toFixed(1)}
          </p>
          <div className="mt-1.5">
            <StarRating rating={Math.round(average)} size="lg" />
          </div>
          <p className="text-xs text-black-400 mt-1.5">
            {count} {count === 1 ? "review" : "reviews"}
          </p>
        </div>

        <div className="flex-1 space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const starCount = reviews.filter((r) => r.rating === star).length;
            const pct = count > 0 ? (starCount / count) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2">
                <span className="text-xs text-black-500 w-3 text-right font-medium">{star}</span>
                <Star size={10} className="text-dixie-500 flex-shrink-0" fill="currentColor" />
                <div className="flex-1 h-1.5 bg-black-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-dixie-500 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-black-400 w-4 text-right">{starCount}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual reviews */}
      <div className="space-y-3">
        {reviews.map((review) => (
          <div
            key={review.id}
            className="bg-white rounded-2xl border border-black-100 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="font-semibold text-sm text-black-900 leading-tight">
                  {review.reviewer_name}
                </p>
                <div className="mt-1">
                  <StarRating rating={review.rating} />
                </div>
              </div>
              <span className="text-xs text-black-400 flex-shrink-0 mt-0.5">
                {formatDate(review.created_at)}
              </span>
            </div>
            {review.comment && (
              <p className="text-sm text-black-500 leading-relaxed mt-2 border-t border-black-50 pt-2">
                {review.comment}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
