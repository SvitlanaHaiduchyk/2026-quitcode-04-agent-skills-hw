"use server";

import { after } from "next/server";
import { db } from "@/lib/db";
import { callN8nWebhook, n8nCallbackUrl } from "@/lib/n8n/client";
import { parseQuoteForm, type QuoteFormField } from "@/lib/quote-form";

const EVENT = "quote-request";

export type RequestQuoteState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<QuoteFormField, string>> }
  | { status: "ok"; id: string };

export async function requestQuote(
  _prevState: RequestQuoteState,
  formData: FormData,
): Promise<RequestQuoteState> {
  // Public form: no session, validation only.
  const parsed = parseQuoteForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors };
  }

  const quote = await db.insertQuote(parsed.data);

  // The workflow runs 40–90 s: n8n answers 202 {job_id} at once and reports back via callback.
  after(async () => {
    let result;
    try {
      result = await callN8nWebhook(
        {
          version: 1,
          event: EVENT,
          // Only what the estimate needs; the email stays with us.
          data: {
            quoteId: quote.id,
            company: quote.company,
            description: quote.description,
            budget: quote.budget,
          },
          callbackUrl: n8nCallbackUrl(EVENT),
        },
        { idempotencyKey: quote.idempotencyKey, correlationId: quote.correlationId },
      );
    } catch (error) {
      // Missing env variable and the like: log the name only.
      const errorName = error instanceof Error ? error.name : "unknown";
      console.error(`n8n.out event=${EVENT} quote=${quote.id} error=${errorName}`);
      result = null;
    }

    const jobId =
      result?.ok && typeof (result.body as { job_id?: unknown } | null)?.job_id === "string"
        ? (result.body as { job_id: string }).job_id
        : null;

    if (result?.ok && result.status === 202) {
      await db.updateQuote({ id: quote.id }, { status: "sent", jobId });
    } else {
      // 200 means the webhook responds "Immediately" instead of Respond to Webhook 202.
      const errorCode = !result ? "config" : result.status ? `n8n_${result.status}` : result.ok ? "n8n" : result.reason;
      await db.updateQuote({ id: quote.id }, { status: "failed", errorCode });
    }
  });

  return { status: "ok", id: quote.id };
}
