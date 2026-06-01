/**
 * Realistic load test — simulates a busy lunch rush.
 * Ramps to 50 concurrent users, holds for 5 minutes, ramps down.
 *
 * Models a real customer journey:
 *   1. Land on storefront home
 *   2. Browse the menu
 *   3. Some hit the order tracking page (returning customers)
 *
 * Usage:
 *   BASE_URL=https://staging.kitchyn.app SLUG=get-drizzys k6 run scripts/load-test/realistic.js
 */
import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SLUG = __ENV.SLUG || "get-drizzys";

export const options = {
  stages: [
    { duration: "2m", target: 20 },   // ramp up
    { duration: "5m", target: 50 },   // hold at peak
    { duration: "2m", target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],       // <1% errors
    http_req_duration: ["p(95)<2000"],    // 95% under 2s
    "http_req_duration{page:home}": ["p(95)<2500"],
    "http_req_duration{page:menu}": ["p(95)<2500"],
  },
};

export default function () {
  // 1. Home / storefront
  group("storefront home", () => {
    const res = http.get(`${BASE_URL}/${SLUG}`, {
      tags: { page: "home" },
    });
    check(res, {
      "home 200": (r) => r.status === 200,
      "home has restaurant name": (r) => r.body && r.body.includes(SLUG.replace(/-/g, "")),
    });
  });

  sleep(Math.random() * 3 + 1); // 1–4s reading the home page

  // 2. Menu page (the hot path — every order starts here)
  group("menu page", () => {
    const res = http.get(`${BASE_URL}/${SLUG}/menu`, {
      tags: { page: "menu" },
    });
    check(res, {
      "menu 200": (r) => r.status === 200,
    });
  });

  sleep(Math.random() * 5 + 3); // 3–8s browsing the menu

  // 3. ~20% of users check order tracking (returning customers)
  if (Math.random() < 0.2) {
    group("order tracking", () => {
      const res = http.get(`${BASE_URL}/${SLUG}/orders/track`, {
        tags: { page: "track" },
      });
      check(res, { "track 200": (r) => r.status === 200 });
    });
    sleep(2);
  }
}
