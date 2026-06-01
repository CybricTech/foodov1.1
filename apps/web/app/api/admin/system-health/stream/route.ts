import { requireAdmin } from "@/lib/api/require-admin";
import { runHealthChecks } from "@/lib/admin/health-checks";

export const dynamic = "force-dynamic";

// Push interval in ms — external API calls need ~2-5s headroom
const PUSH_INTERVAL = 10_000;
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
