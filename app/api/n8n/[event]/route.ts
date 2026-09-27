import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

const EVENTS = new Set(["quote-request"]); // paths we accept callbacks on
const MAX_BODY_BYTES = 64 * 1024;
const MAX_SKEW_SECONDS = 300;

type CallbackBody = {
  version: 1;
  event: string;
  data: {
    jobId: string;
    status: "completed" | "failed";
    correlationId?: string;
    requestIdempotencyKey?: string;
    result?: { documentUrl?: string };
    error?: { code?: string };
    completedAt?: string;
  };
};

function isCallbackBody(value: unknown, pathEvent: string): value is CallbackBody {
  const v = value as CallbackBody;
  return (
    typeof v === "object" && v !== null && v.version === 1 &&
    (v.event === `${pathEvent}.completed` || v.event === `${pathEvent}.failed`) &&
    typeof v.data?.jobId === "string" && (v.data.status === "completed" || v.data.status === "failed")
  );
}

// The link ends up in an <a href> on a public page: http(s) only.
function safeDocumentUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function signatureMatches(secret: string, timestamp: string, raw: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex"), "utf8");
  const given = Buffer.from(header.slice("sha256=".length), "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected); // lengths first
}

export async function POST(request: Request, ctx: RouteContext<"/api/n8n/[event]">) {
  const { event } = await ctx.params;
  // 1. before reading the body
  if (!EVENTS.has(event)) return Response.json({ error: "unknown event" }, { status: 404 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "unsupported media type" }, { status: 415 });
  }
  // 2–3. raw text, size
  const raw = await request.text();
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes > MAX_BODY_BYTES) return Response.json({ error: "too large" }, { status: 413 });
  // 4. replay window
  const timestamp = request.headers.get("x-n8n-timestamp") ?? "";
  const ts = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  // 5. signature
  const secret = process.env.N8N_CALLBACK_SECRET;
  if (!secret || !signatureMatches(secret, timestamp, raw, request.headers.get("x-n8n-signature"))) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  // 6. claim the key
  const key = request.headers.get("idempotency-key") ?? "";
  if (!key) return Response.json({ error: "missing idempotency-key" }, { status: 400 });
  if (!(await db.claimIdempotencyKey(key))) return Response.json({ duplicate: true }, { status: 200 });

  try {
    // 7. only now JSON and shape; the key must equal fields of the signed body
    let body: unknown;
    try { body = JSON.parse(raw); } catch { body = null; }
    if (!isCallbackBody(body, event) || key !== `${body.data.jobId}:${body.event}`) {
      await db.releaseIdempotencyKey(key);
      return Response.json({ error: "bad request" }, { status: 400 });
    }
    const { data } = body;
    const documentUrl = safeDocumentUrl(data.result?.documentUrl);
    const completed = data.status === "completed" && documentUrl !== null;
    // 8. minimal state BEFORE the response
    const saved = await db.updateQuote(
      { idempotencyKey: data.requestIdempotencyKey, jobId: data.jobId },
      completed
        ? { status: "ready", jobId: data.jobId, documentUrl, errorCode: null }
        : { status: "failed", jobId: data.jobId, errorCode: data.error?.code?.slice(0, 64) ?? "no_document" },
    );
    if (!saved) {
      await db.releaseIdempotencyKey(key);
      return Response.json({ error: "bad request" }, { status: 400 });
    }
    console.info(
      `n8n.callback event=${body.event} quote=${saved.id} status=202 bytes=${bytes} correlation=${data.correlationId ?? "-"}`,
    );
    // 9.
    return Response.json({ ok: true }, { status: 202 });
  } catch {
    await db.releaseIdempotencyKey(key);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
