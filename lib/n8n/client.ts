import "server-only";

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000]; // 2 retries → 3 attempts in total

export type N8nEnvelope<T> = {
  version: 1;
  event: string; // kebab-case, equals the webhook path
  data: T; // minimal fields, built explicitly
  callbackUrl?: string; // async events only
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

const retryable = (status: number) => status >= 500; // 5xx, including 524

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
          "idempotency-key": idempotencyKey, // the same on every attempt
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
        // Only the status code matters; the body is read solely as Respond to Webhook JSON ({"job_id"}).
        const json: unknown = response.headers.get("content-type")?.includes("application/json")
          ? await response.json().catch(() => null)
          : null;
        return { ok: true, status: response.status, attempts: attempt, body: json };
      }
      last = { ok: false, status: response.status, attempts: attempt, reason: "http" };
      if (!retryable(response.status)) return last; // 4xx: 403 token, 404 not published / test URL
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
