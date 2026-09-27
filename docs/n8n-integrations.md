# Інтеграції з n8n

| event | напрям | шлях n8n | режим | власник |
|---|---|---|---|---|
| `quote-request` | Next.js → n8n → колбек | `/webhook/quote-request` | Respond to Webhook 202 + колбек | TODO: вказати відповідального |
| `lead-created` | Next.js → n8n | `/webhook/lead-created` | Immediately (подія «до відома») | TODO: вказати відповідального |

## `lead-created`

Публічна форма ліда (`/`) → Server Action `submitLead` (`app/actions.ts`) → `POST /webhook/lead-created` в `after()`.
Тіло: `{ version: 1, event: "lead-created", data: { leadId, company, source, budget } }` — без контактів, IP, user agent
і сирих даних форми. Колбеку немає; відповідь n8n (`200`) лише журналюється.

## `quote-request`

Форма `/quotes/new` → Server Action `requestQuote` (`app/quotes/actions.ts`) → `POST /webhook/quote-request`
в `after()`. Воркфлоу працює 40–90 с, тому відповідає одразу `202 {"job_id"}`, а результат надсилає
підписаним колбеком на `POST /api/n8n/quote-request`. Статус видно на `/quotes/[id]`.

Тіло запиту: `{ version: 1, event: "quote-request", data: { quoteId, company, description, budget }, callbackUrl }`.
Email клієнта в n8n **не** передається.

Колбек: `event` = `quote-request.completed` (з `data.result.documentUrl`, лише http/https) або
`quote-request.failed` (з `data.error.code`); `data.requestIdempotencyKey` = заголовок `idempotency-key`
вихідного запиту.

### Налаштування воркфлоу в n8n

1. **Webhook**: `POST`, Path `quote-request`, Authentication — Header Auth (Name `x-n8n-token`,
   Value = `N8N_WEBHOOK_TOKEN`), Respond — `Using 'Respond to Webhook' Node`.
2. **Remove Duplicates**: «Remove Items Processed in Previous Executions», значення
   `{{ $json.headers['idempotency-key'] }}`.
3. **Respond to Webhook**: JSON, Response Code `202`, тіло `{"job_id": "{{ $execution.id }}"}`.
4. … генерація PDF …
5. **Edit Fields**: `ts` = `{{ Math.floor($now.toSeconds()) }}`, `body` = `JSON.stringify` конверта
   `{ version: 1, event: 'quote-request.completed', data: { jobId: $execution.id, status: 'completed',
   correlationId, requestIdempotencyKey: <idempotency-key з вхідних заголовків>, result: { documentUrl }, completedAt } }`.
6. **Crypto** (v2): Hmac, SHA256, HEX, значення `{{ $json.ts + '.' + $json.body }}`, Crypto credential з
   Hmac Secret = `N8N_CALLBACK_SECRET`.
7. **HTTP Request**: `POST` на `{{ $('Webhook').item.json.body.callbackUrl }}`, заголовки `x-n8n-timestamp`,
   `x-n8n-signature` (`sha256=` + результат Crypto), `idempotency-key` (`{{ $execution.id }}:quote-request.completed`),
   `x-correlation-id`. Body — Raw, `application/json`, поле `body`. Timeout `10000`, Retry On Fail: 3 спроби, 1000 мс.
8. **Save** і **Publish**.
