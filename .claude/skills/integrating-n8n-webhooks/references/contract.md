# Контракт Next.js → n8n: виклик вебхука

Повний контракт виклику. `SKILL.md` — стисло; тут — деталі й «чому».

## Змінні середовища (лише серверні)

| Змінна | Що це | `.env.example` (локально) |
|---|---|---|
| `N8N_WEBHOOK_BASE_URL` | База **production**-URL, закінчується на `/webhook` (без `<path>`) | `http://127.0.0.1:5678/webhook` |
| `N8N_WEBHOOK_TOKEN` | Значення заголовка `x-n8n-token` (= credential Header Auth в n8n) | `change-me-webhook-token` |
| `N8N_CALLBACK_SECRET` | Секрет HMAC для колбеків (= Hmac Secret у Crypto credential n8n) | `change-me-callback-secret` |
| `APP_BASE_URL` | Адреса застосунку, за якою n8n бачить колбек-ендпоінти | `http://127.0.0.1:3000` |

- Жодна `N8N_*` не має префікса `NEXT_PUBLIC_` — Next.js вбудовує такі змінні в клієнтський бандл.
- Інших `N8N_*` немає. Стара `N8N_WEBHOOK_URL` (повний URL з `<path>` усередині) — не за контрактом:
  одна змінна на всі події + шлях = ім'я події в коді.
- Справжні значення — лише в `.env.local` (у `.gitignore`) і на хостингу. У `.env.example` —
  `change-me-…` і локальні адреси з `/webhook`, **ніколи** `/webhook-test/`.
- Секрет генеруємо: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- Секрет ніколи не йде в query string, у Client Component чи в журнал.
- Змінні читаються на старті: після зміни `.env.local` — перезапуск `npm start` / `npm run dev`.

## Де живе код

- Один модуль `lib/n8n/client.ts`, перший рядок — `import "server-only";` (імпорт з Client Component
  стає помилкою збірки). Пакет ставити **не треба** — Next.js 16 обробляє `server-only` сам
  (`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`).
- Прямих `fetch` до n8n і читання `N8N_WEBHOOK_*` поза цим модулем немає.
- Ніколи `export const runtime = "edge"` — потрібен `node:crypto`, а `edge` у Next.js 16 застарілий.

## Запит

`POST ${N8N_WEBHOOK_BASE_URL}/<path>`; `<path>` — ім'я події в kebab-case (`lead-created`,
`quote-request`). Одна подія — один шлях (n8n дозволяє один вебхук на «шлях + метод»).

| Заголовок | Значення |
|---|---|
| `content-type` | `application/json` |
| `x-n8n-token` | `N8N_WEBHOOK_TOKEN` |
| `idempotency-key` | UUID, створений **один раз** на бізнес-операцію й **збережений разом із записом**; у кожній спробі — той самий |
| `x-correlation-id` | UUID ланцюжка дій; його ж пишемо в журнали |

Тіло — конверт:

```json
{
  "version": 1,
  "event": "quote-request",
  "data": { "quoteId": "q_0042", "company": "Nova Dental", "budget": 1500 },
  "callbackUrl": "http://127.0.0.1:3000/api/n8n/quote-request"
}
```

- `version` — версія конверта. Нове необов'язкове поле — та сама версія; перейменування чи зміна сенсу
  — нова версія, і воркфлоу якийсь час приймає обидві.
- `data` — **мінімум**, потрібний воркфлоу, зібраний явно по полях. Ніколи не `JSON.stringify(lead)`:
  IP, user agent, внутрішні нотатки, `rawPayload` n8n не потрібні.
- `callbackUrl` — лише для асинхронних воркфлоу: `${APP_BASE_URL}/api/n8n/<path>`.

## Таймаут і повтори

- Кожна спроба — `fetch(url, { …, signal: AbortSignal.timeout(10_000) })`. В асинхронному режимі n8n
  відповідає одразу, тож 10 с без відповіді — збій, а не «повільний воркфлоу».
- Не більше **двох повторів** (разом 3 спроби), пауза **1 с**, потім **3 с**, і **лише** для:
  мережевої помилки, таймауту (`TimeoutError`), `5xx`, `524`. Завжди з тим самим `idempotency-key`.
- `4xx` не повторюємо: `403` — неправильний токен (Header Auth n8n повертає саме 403, не 401),
  `404` — воркфлоу не опубліковано або це тестовий URL. Такі помилки виправляють, а не повторюють.
- Відповідь n8n — **лише код статусу**. Текст (`Workflow was started`) не парсимо: він відрізняється
  від документації («Workflow got started»).

## Хто викликає

- Дія з UI — Server Action: сесія, права й валідація всередині (`server-auth-actions`).
- Користувач **не** чекає на n8n: дія зберігає запис (статус `queued`, `idempotencyKey`,
  `correlationId`), повертає лише `{ status, id }`, а виклик n8n з повторами — в `after()`
  (`server-after-nonblocking`). Ще й тому, що Next.js виконує Server Actions по одній на клієнта:
  довге очікування блокує наступну дію того ж користувача.
- Результат виклику (`202`, `4xx`, вичерпані повтори) записуємо в стан запису (`sent` / `failed`),
  щоб його було видно в UI, а не лише в журналі.
- Не-React клієнт (інший сервіс, cron) — Route Handler.

## Реєстр інтеграцій

Кожна інтеграція — рядок у `docs/n8n-integrations.md` проєкту:

| event | напрям | шлях n8n | режим | власник |
|---|---|---|---|---|
| `quote-request` | Next.js → n8n → колбек | `/webhook/quote-request` | Respond to Webhook 202 + колбек | ім'я відповідального |
