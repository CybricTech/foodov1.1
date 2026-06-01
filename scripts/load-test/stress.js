/**
 * Stress test — finds where the app breaks down.
 * Ramps aggressively to 200 concurrent users.
 * Run this once before a major launch to find your cliff.
 *
 * What to watch:
 *   - At what VU count does p(95) latency cross 3s?
 *   - At what VU count does error rate climb above 1%?
 *   - That number is your current capacity ceiling.
 *
 * Usage:
 *   BASE_URL=https://staging.kitchyn.app SLUG=get-drizzys k6 run scripts/load-test/stress.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SLUG = __ENV.SLUG || "get-drizzys";

export const options = {
  stages: [
    { duration: "2m", target: 50 },    // warm up
    { duration: "3m", target: 100 },   // push harder
    { duration: "3m", target: 200 },   // find the cliff
    { duration: "2m", target: 0 },     // recovery
  ],
  // Intentionally no hard thresholds — we're observing, not gating.
  // Read the summary output to find the breaking point.
};

export default function () {
  // Hit the menu page — the single most DB-heavy customer page
  const res = http.get(`${BASE_URL}/${SLUG}/menu`);
  check(res, {
    "status 200": (r) => r.status === 200,
    "under 5s": (r) => r.timings.duration < 5000,
  });
  sleep(1);
}
