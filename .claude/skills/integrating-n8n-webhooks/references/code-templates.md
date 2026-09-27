# Шаблони коду (Next.js 16, TypeScript)

Перевірені шаблони: `tsc` без помилок, колбек-роут приймає підписаний колбек мока (`202`), відхиляє
підмінений підпис (`401`) і повтор (`200 {"duplicate":true}`). Імена сховища (`db.…`) — підставте свої.

## `lib/n8n/client.ts` — єдине місце, звідки йдуть виклики n8n

```ts
import "server-only";

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000]; // 2 повтори → разом 3 спроби

export type N8nEnvelope<T> = {
  version: 1;
  event: string; // kebab-case, = шлях вебхука
  data: T; // мінімум полів, зібраний явно
  callbackUrl?: string; // лише для асинхронних подій
};

export type N8nCallResult =
  | { ok: true; status: number; attempts: number; body: unknown }
  | { ok: false; status: number | null; attempts: number; reason: "http" | "network" | "timeout" };

function env(name: "N8N_WEBHOOK_BASE_URL" | "N8N_WEBHOOK_TOKEN" | "APP_BASE_URL") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function n8nCallbackUrl(event: string) {
  return `${env("APP_BASE_URL").replace(/\/$/, "")}/api/n8n/${event}`;
}

const retryable = (status: number) => status >= 500; // 5xx, зокрема 524

export async function callN8nWebhook<T>(
  envelope: N8nEnvelope<T>,
  { idempotencyKey, correlationId }: { idempotencyKey: string; correlationId: string },
): Promise<N8nCallResult> {
  const url = `${env("N8N_WEBHOOK_BASE_URL").replace(/\/$/, "")}/${envelope.event}`;
  const body = JSON.stringify(envelope);
  let last: N8nCallResult = { ok: false, status: null, attempts: 0, reason: "network" };

  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-n8n-token": env("N8N_WEBHOOK_TOKEN"),
          "idempotency-key": idempotencyKey, // той самий у кожній спробі
          "x-correlation-id": correlationId,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      console.info(
        `n8n.out event=${envelope.event} attempt=${attempt} status=${response.status} ms=${Date.now() - started} correlation=${correlationId}`,
      );
      if (response.ok) {
        // Дивимось на код статусу; тіло — лише JSON від Respond to Webhook ({"job_id"}), текст не парсимо.
        const json: unknown = response.headers.get("content-type")?.includes("application/json")
          ? await response.json().catch(() => null)
          : null;
        return { ok: true, status: response.status, attempts: attempt, body: json };
      }
      last = { ok: false, status: response.status, attempts: attempt, reason: "http" };
      if (!retryable(response.status)) return last; // 4xx: 403 токен, 404 не опубліковано / тестовий URL
    } catch (error) {
      const timeout = error instanceof Error && error.name === "TimeoutError";
      console.warn(
        `n8n.out event=${envelope.event} attempt=${attempt} error=${timeout ? "timeout" : "network"} ms=${Date.now() - started} correlation=${correlationId}`,
      );
      last = { ok: false, status: null, attempts: attempt, reason: timeout ? "timeout" : "network" };
    }
    const delay = RETRY_DELAYS_MS[attempt - 1];
    if (delay !== undefined) await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return last;
}
```

## Виклик із Server Action — через `after()`

```ts
"use server";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { callN8nWebhook, n8nCallbackUrl } from "@/lib/n8n/client";

export async function requestSomething(_prev: State, formData: FormData): Promise<State> {
  // 1) сесія / права / валідація — server-auth-actions (для публічної форми — лише валідація)
  // 2) запис зі статусом "queued" і ключами, створеними ОДИН раз
  const record = await db.insertRequest({ ...parsed.data, status: "queued",
    idempotencyKey: randomUUID(), correlationId: randomUUID() });

  // 3) n8n — після відповіді користувачу (server-after-nonblocking)
  after(async () => {
    const result = await callN8nWebhook(
      { version: 1, event: "quote-request", data: { quoteId: record.id, company: record.company },
        callbackUrl: n8nCallbackUrl("quote-request") },
      { idempotencyKey: record.idempotencyKey, correlationId: record.correlationId },
    );
    const jobId = result.ok && typeof (result.body as { job_id?: unknown })?.job_id === "string"
      ? (result.body as { job_id: string }).job_id : null;
    await db.updateRequest(record.id, result.ok && result.status === 202
      ? { status: "sent", jobId } : { status: "failed" });
  });

  return { status: "ok", id: record.id }; // лише { status, id }
}
```

## `app/api/n8n/[event]/route.ts` — колбек

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";

const EVENTS = new Set(["quote-request"]); // шляхи, які ми приймаємо
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

function signatureMatches(secret: string, timestamp: string, raw: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex"), "utf8");
  const given = Buffer.from(header.slice("sha256=".length), "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected); // спершу довжини
}

export async function POST(request: Request, ctx: RouteContext<"/api/n8n/[event]">) {
  const { event } = await ctx.params;
  // 1. до читання тіла
  if (!EVENTS.has(event)) return Response.json({ error: "unknown event" }, { status: 404 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "unsupported media type" }, { status: 415 });
  }
  // 2–3. сирий текст, розмір
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return Response.json({ error: "too large" }, { status: 413 });
  // 4. вікно часу
  const timestamp = request.headers.get("x-n8n-timestamp") ?? "";
  const ts = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  // 5. підпис
  const secret = process.env.N8N_CALLBACK_SECRET;
  if (!secret || !signatureMatches(secret, timestamp, raw, request.headers.get("x-n8n-signature"))) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  // 6. застовпити ключ
  const key = request.headers.get("idempotency-key") ?? "";
  if (!key) return Response.json({ error: "missing idempotency-key" }, { status: 400 });
  if (!(await db.claimIdempotencyKey(key))) return Response.json({ duplicate: true }, { status: 200 });

  try {
    // 7. лише тепер — JSON і форма; ключ = поля підписаного тіла
    let body: unknown;
    try { body = JSON.parse(raw); } catch { body = null; }
    if (!isCallbackBody(body, event) || key !== `${body.data.jobId}:${body.event}`) {
      await db.releaseIdempotencyKey(key);
      return Response.json({ error: "bad request" }, { status: 400 });
    }
    // 8. мінімальний стан — ДО відповіді
    const saved = await db.applyCallback(body.data); // знайти запис за requestIdempotencyKey / jobId
    if (!saved) {
      await db.releaseIdempotencyKey(key);
      return Response.json({ error: "bad request" }, { status: 400 });
    }
    console.info(`n8n.callback event=${body.event} status=202 bytes=${raw.length} correlation=${body.data.correlationId ?? "-"}`);
    // 10. повільне — після відповіді
    after(() => notifySomeone(saved.id));
    // 9.
    return Response.json({ ok: true }, { status: 202 });
  } catch {
    await db.releaseIdempotencyKey(key);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
```

Не додавайте `export const runtime = "edge"` — потрібен `node:crypto`.
