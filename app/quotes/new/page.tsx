import Link from "next/link";
import { QuoteForm } from "@/components/quote-form";

export default function NewQuotePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Studio Nova
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-10 px-6 py-12 md:grid-cols-[1fr_1.2fr]">
        <section className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">Запит на кошторис</h1>
          <p className="text-slate-600">
            Опишіть задачу — ми підготуємо PDF-кошторис. Зазвичай це займає одну-дві хвилини, статус
            видно на сторінці запиту.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <QuoteForm />
        </section>
      </main>
    </div>
  );
}
