"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { callN8nWebhook } from "@/lib/n8n/client";
import { logAudit } from "@/lib/audit";
import { parseLeadForm, type LeadFormField } from "@/lib/lead-form";
import type { LeadStatus } from "@/lib/types";

const PUBLIC_FORM_WORKSPACE_ID = "ws_studio_nova";

export type SubmitLeadState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<LeadFormField, string>> }
  | { status: "ok" };

export async function submitLead(
  _prevState: SubmitLeadState,
  formData: FormData,
): Promise<SubmitLeadState> {
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors };
  }

  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const userAgent = requestHeaders.get("user-agent") ?? "";

  const lead = await db.insertLead({
    ...parsed.data,
    workspaceId: PUBLIC_FORM_WORKSPACE_ID,
    jobTitle: "",
    city: "",
    country: "",
    source: "website",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    ipAddress,
    userAgent,
    rawPayload: {
      form: { id: "contact-main", version: "2026-07", fields: parsed.data },
      request: {
        ip: ipAddress,
        userAgent,
        acceptLanguage: requestHeaders.get("accept-language"),
        receivedAt: new Date().toISOString(),
      },
    },
  });

  // "lead-created" is an FYI event (webhook responds Immediately): the user does not wait for n8n.
  after(async () => {
    try {
      await callN8nWebhook(
        {
          version: 1,
          event: "lead-created",
          // Minimum for the workflow; no IP, user agent, contact details or raw form data.
          data: { leadId: lead.id, company: lead.company, source: lead.source, budget: lead.budget },
        },
        { idempotencyKey: randomUUID(), correlationId: randomUUID() },
      );
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "unknown";
      console.error(`n8n.out event=lead-created lead=${lead.id} error=${errorName}`);
    }
  });

  await logAudit("lead.created", lead.id);

  return { status: "ok" };
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  await db.updateLeadStatus(id, status);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${id}`);
}

export async function deleteLead(id: string) {
  await db.deleteLead(id);
  revalidatePath("/dashboard");
}
