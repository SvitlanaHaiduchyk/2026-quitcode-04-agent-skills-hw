import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteAutoRefresh } from "@/components/quote-auto-refresh";
import { db } from "@/lib/db";
import { QUOTE_BUDGET_OPTIONS } from "@/lib/quote-form";
import type { QuoteStatus } from "@/lib/types";

const dateTimeFormat = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" });

const STATUS_TEXT: Record<QuoteStatus, { title: string; hint: string; className: string }> = {
  queued: {
    title: "Запит прийнято",
    hint: "Передаємо його на підготовку кошторису.",
    className: "bg-slate-100 text-slate-700",
  },
  sent: {
    title: "Готуємо кошторис",
    hint: "Зазвичай це 40–90 секунд. Сторінка оновиться сама.",
    className: "bg-amber-100 text-amber-800",
  },
  ready: {
    title: "Кошторис готовий",
    hint: "Завантажте PDF за посиланням нижче.",
    className: "bg-emerald-100 text-emerald-800",
  },
  failed: {
    title: "Не вдалося підготувати кошторис",
    hint: "Ми вже знаємо про проблему й зв'яжемося з вами email.",
    className: "bg-red-100 text-red-800",
  },
};

export default async function QuotePage({ params }: PageProps<"/quotes/[id]">) {
  const { id } = await params;
  const quote = await db.getQuote(id);
  if (!quote) notFound();

  const status = STATUS_TEXT[quote.status];
  const pending = quote.status === "queued" || quote.status === "sent";
  const budget =
    QUOTE_BUDGET_OPTIONS.find((option) => option.value === String(quote.budget ?? ""))?.label ?? "—";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-12">
      {pending && <QuoteAutoRefresh />}
      <Link href="/quotes/new" className="text-sm text-slate-500 hover:text-slate-900">
        ← Новий запит
      </Link>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Кошторис для {quote.company}</h1>
        <p className="text-sm text-slate-500">Створено {dateTimeFormat.format(new Date(quote.createdAt))}</p>
      </div>

      <section className={`rounded-xl p-5 ${status.className}`} aria-live="polite">
        <p className="font-medium">
          {pending && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />}
          {status.title}
        </p>
        <p className="mt-1 text-sm">{status.hint}</p>
        {quote.status === "ready" && quote.documentUrl && (
          <a
            href={quote.documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Завантажити PDF
          </a>
        )}
      </section>

      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <dt className="text-slate-500">Бюджет</dt>
        <dd>{budget}</dd>
        <dt className="text-slate-500">Задача</dt>
        <dd className="whitespace-pre-line">{quote.description}</dd>
      </dl>
    </main>
  );
}
