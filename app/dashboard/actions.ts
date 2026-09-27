"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getCurrentUser, getWorkspace } from "@/lib/data";
import { parseNoteForm, type NoteField } from "@/lib/note-form";

export type NoteFormState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<NoteField, string>>; values: Partial<Record<NoteField, string>> }
  | { status: "error"; message: string }
  | { status: "ok" };

export async function addNote(_prevState: NoteFormState, formData: FormData): Promise<NoteFormState> {
  // Session: no valid cookie → redirect("/login").
  const user = await getCurrentUser();

  // Permissions: leadId comes from a hidden field, so check it belongs to the user's workspace.
  const leadId = formData.get("leadId");
  const [workspace, lead] = await Promise.all([
    getWorkspace(user.workspaceSlug),
    typeof leadId === "string" ? db.getLead(leadId) : null,
  ]);
  if (!lead || lead.workspaceId !== workspace.id) {
    return { status: "error", message: "Немає доступу до цього ліда" };
  }

  const parsed = parseNoteForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors, values: parsed.values };
  }

  try {
    const updated = await db.appendLeadNote(lead.id, parsed.data.note);
    if (!updated) return { status: "error", message: "Лід не знайдено" };
  } catch (error) {
    console.error("Failed to add note", lead.id, (error as Error).message);
    return { status: "error", message: "Не вдалося зберегти нотатку. Спробуйте ще раз." };
  }

  after(() => logAudit("lead.note_added", lead.id));
  revalidatePath(`/dashboard/leads/${lead.id}`);
  return { status: "ok" };
}
