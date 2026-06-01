# Load Tests

Run these against staging before any marketing push or major launch.

## Setup

```bash
brew install k6
```

## Tests

### 1. Smoke test — is it alive?
```bash
k6 run scripts/load-test/smoke.js
```
5 users, 1 minute. Just confirms the storefront responds and images load.

### 2. Realistic load — typical busy period
```bash
BASE_URL=https://staging.kitchyn.app SLUG=get-drizzys k6 run scripts/load-test/realistic.js
```
Ramps to 50 concurrent users over 5 minutes, holds for 5, ramps down.
Simulates a normal busy lunch rush.

### 3. Stress test — find the cliff
```bash
BASE_URL=https://staging.kitchyn.app SLUG=get-drizzys k6 run scripts/load-test/stress.js
```
Ramps hard to 200 users. Finds where response times degrade.

## What to watch

- `http_req_duration p(95)` — 95th-percentile response time. Under 2s is good.
- `http_req_failed` — should stay at 0%.
- `checks` — should stay at 100%.

Run against **staging**, not production.
