"use client";

import { useActionState } from "react";
import { addNote, type NoteFormState } from "@/app/dashboard/actions";
import { NOTE_MAX_LENGTH } from "@/lib/note-form";

const initialState: NoteFormState = { status: "idle" };

export function NoteForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(addNote, initialState);
  const errors = state.status === "invalid" ? state.errors : {};
  const values = state.status === "invalid" ? state.values : {};

  return (
    <form
      action={formAction}
      noValidate
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 text-sm"
    >
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor="note" className="block font-medium">
        Додати нотатку
      </label>
      <textarea
        id="note"
        name="note"
        rows={3}
        maxLength={NOTE_MAX_LENGTH}
        defaultValue={values.note ?? ""}
        aria-invalid={errors.note ? true : undefined}
        aria-describedby={errors.note ? "note-error note-hint" : "note-hint"}
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <p id="note-hint" className="text-xs text-slate-500">
        До {NOTE_MAX_LENGTH} символів. Нотатку бачать лише учасники робочого простору.
      </p>
      {errors.note && (
        <p id="note-error" className="text-xs text-red-600">
          {errors.note}
        </p>
      )}

      {state.status === "invalid" && (
        <div role="alert" className="text-xs text-red-700">
          Перевірте поля: {Object.keys(errors).length}
        </div>
      )}
      {state.status === "error" && (
        <div role="alert" className="text-xs text-red-700">
          {state.message}
        </div>
      )}
      {state.status === "ok" && (
        <p role="status" className="text-xs text-green-700">
          Нотатку додано.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {pending ? "Зберігаємо…" : "Зберегти нотатку"}
      </button>
    </form>
  );
}
