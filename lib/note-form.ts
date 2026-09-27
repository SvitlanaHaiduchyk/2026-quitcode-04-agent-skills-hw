export const NOTE_MAX_LENGTH = 500;

export type NoteField = "note";

export type NoteParseResult =
  | { ok: true; data: { note: string } }
  | { ok: false; errors: Partial<Record<NoteField, string>>; values: Partial<Record<NoteField, string>> };

export function parseNoteForm(formData: FormData): NoteParseResult {
  const raw = formData.get("note");
  const value = typeof raw === "string" ? raw.trim() : "";

  if (!value) {
    return { ok: false, errors: { note: "Напишіть текст нотатки" }, values: { note: "" } };
  }
  if (value.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      errors: { note: `Нотатка задовга: максимум ${NOTE_MAX_LENGTH} символів` },
      values: { note: value.slice(0, NOTE_MAX_LENGTH) },
    };
  }

  return { ok: true, data: { note: value } };
}
