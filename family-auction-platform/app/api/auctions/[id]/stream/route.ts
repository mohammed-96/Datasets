import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { subscribeAuction, type AuctionEvent } from "@/lib/events";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: AuctionEvent | { type: "connected" }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      send({ type: "connected" });
      unsubscribe = subscribeAuction(id, send);
      heartbeat = setInterval(() => send({ type: "heartbeat" }), 20000);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  req.signal.addEventListener("abort", () => {
    if (unsubscribe) unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
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
