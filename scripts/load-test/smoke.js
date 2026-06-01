/**
 * Smoke test — 5 users, 1 minute.
 * Confirms the storefront is alive and responding before running bigger tests.
 * Usage: k6 run scripts/load-test/smoke.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SLUG = __ENV.SLUG || "get-drizzys";

export const options = {
  vus: 5,
  duration: "1m",
  thresholds: {
    http_req_failed: ["rate<0.01"],          // <1% errors
    http_req_duration: ["p(95)<3000"],       // 95% under 3s
  },
};

export default function () {
  const pages = [
    `${BASE_URL}/${SLUG}`,
    `${BASE_URL}/${SLUG}/menu`,
  ];

  for (const url of pages) {
    const res = http.get(url);
    check(res, {
      "status 200": (r) => r.status === 200,
      "has content": (r) => r.body && r.body.length > 500,
    });
    sleep(1);
  }
}
