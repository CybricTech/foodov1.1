import { requireAdmin } from "@/lib/api/require-admin";
import { runHealthChecks } from "@/lib/admin/health-checks";

export const dynamic = "force-dynamic";

// Push interval in ms. Kept deliberately slow: each run fires 5 DB queries +
// 3 external API probes, so a tight loop here meaningfully loads the database
// (see 2026-06-11 usage-exhaustion incident). 30s is plenty for a status page.
const PUSH_INTERVAL = 30_000;
// Close the stream after this long; EventSource auto-reconnects seamlessly.
// Keeps us well within Vercel's function timeout limits.
const MAX_DURATION = 55_000;

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      function send(data: object) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      }

      // Send first check immediately so the page isn't blank
      send(await runHealthChecks());

      const pushTimer = setInterval(async () => {
        if (closed) {
          clearInterval(pushTimer);
          return;
        }
        try {
          send(await runHealthChecks());
        } catch {
          clearInterval(pushTimer);
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      }, PUSH_INTERVAL);

      // Gracefully close after MAX_DURATION; client reconnects automatically
      setTimeout(() => {
        clearInterval(pushTimer);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }, MAX_DURATION);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
