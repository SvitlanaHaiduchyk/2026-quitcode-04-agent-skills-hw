# Налаштування на боці n8n (словами, без JSON)

Воркфлоу клієнта — його власність: JSON не експортуємо й не імпортуємо. Налаштування передаємо текстом —
ось цим списком (у PR / `docs/n8n-integrations.md`).

1. **Webhook**: HTTP Method `POST`, Path — ім'я події (`quote-request`). Authentication — **Header Auth**,
   credential: Name `x-n8n-token`, Value = `N8N_WEBHOOK_TOKEN`. Неправильний / відсутній заголовок → **403**
   «Authorization data is wrong!». Respond — `Using 'Respond to Webhook' Node` (для швидких подій —
   `Immediately`). Фіксовані IP хостингу — Options → IP(s) Allowlist (за reverse proxy — `N8N_PROXY_HOPS`).
   Дані в наступних вузлах — `$json.body`, заголовки — `$json.headers` (імена в нижньому регістрі).
2. **Remove Duplicates**: «Remove Items Processed in Previous Executions», значення —
   `{{ $json.headers['idempotency-key'] }}`.
3. **Respond to Webhook**: Respond With JSON, Response Code `202`, тіло `{"job_id": "{{ $execution.id }}"}`.
4. … робота воркфлоу (генерація PDF тощо) …
5. **Edit Fields**: `ts` = `{{ Math.floor($now.toSeconds()) }}`, `body` =
   `{{ JSON.stringify({ version: 1, event: 'quote-request.completed', data: { jobId: $execution.id, … } }) }}`.
   Тіло підписуємо й відправляємо **одним і тим самим рядком**.
6. **Crypto** (v2): Action `Hmac`, Type `SHA256`, Encoding `HEX`, значення `{{ $json.ts + '.' + $json.body }}`,
   credential **Crypto** з Hmac Secret = `N8N_CALLBACK_SECRET`.
7. **HTTP Request**: `POST` на `{{ $('Webhook').item.json.body.callbackUrl }}`. Заголовки `x-n8n-timestamp`,
   `x-n8n-signature` (`sha256=` + результат Crypto), `idempotency-key`
   (`{{ $execution.id }}:quote-request.completed`), `x-correlation-id` (з вхідних заголовків).
   Body Content Type — **Raw**, Content Type `application/json`, Body — поле `body`. Options → Timeout `10000`.
   Settings → Retry On Fail, Max Tries `3`, Wait Between Tries `1000`.
   n8n у Docker, застосунок на хості — `host.docker.internal`, не `localhost`.
8. **Save** і **Publish**. Після кожної зміни — Publish знову.

Чому Raw, а не «JSON → Using Fields Below»: документація не гарантує, що серіалізація полів дасть ті самі
байти, що ми підписали.
